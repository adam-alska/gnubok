import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { parseInboundPayload, extractAttachments, resolveUserFromEmail } from '@/extensions/general/invoice-inbox/lib/email-handler'
import { analyzeInvoice } from '@/extensions/general/invoice-inbox/lib/invoice-analyzer'
import { matchSupplier } from '@/extensions/general/invoice-inbox/lib/supplier-matcher'
import crypto from 'crypto'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() { },
      },
    }
  )
}

export async function POST(request: Request) {
  // Verify webhook signature
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[invoice-inbox] RESEND_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const svixId = request.headers.get('svix-id')
  const svixTimestamp = request.headers.get('svix-timestamp')
  const svixSignature = request.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 })
  }

  const rawBody = await request.text()

  try {
    const wh = new Webhook(webhookSecret)
    wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)
  const payload = parseInboundPayload(body)

  if (!payload) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Resolve user from recipient email
  const userId = await resolveUserFromEmail(payload.to, supabase)

  if (!userId) {
    console.warn(`[invoice-inbox] No user found for email: ${payload.to}`)
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Extract file attachments
  const attachments = extractAttachments(payload)

  if (attachments.length === 0) {
    // Create inbox item with error status (no attachments)
    await supabase
      .from('invoice_inbox_items')
      .insert({
        user_id: userId,
        status: 'error',
        source: 'email',
        email_from: payload.from,
        email_subject: payload.subject,
        email_received_at: payload.created_at,
        error_message: 'No supported attachments found',
      })

    return NextResponse.json({ data: { processed: 0, message: 'No attachments' } })
  }

  const processed: string[] = []

  for (const attachment of attachments) {
    try {
      const buffer = Buffer.from(attachment.content, 'base64')
      const hash = crypto.createHash('sha256').update(buffer).digest('hex')

      // Upload to storage
      const storagePath = `documents/${userId}/inbox/${Date.now()}-${attachment.filename}`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, buffer, { contentType: attachment.content_type })

      if (uploadError) {
        console.error('[invoice-inbox] Upload failed:', uploadError)
        continue
      }

      // Create document attachment
      const { data: document, error: docError } = await supabase
        .from('document_attachments')
        .insert({
          user_id: userId,
          storage_path: storagePath,
          file_name: attachment.filename,
          file_size_bytes: buffer.length,
          mime_type: attachment.content_type,
          sha256_hash: hash,
          upload_source: 'email',
        })
        .select()
        .single()

      if (docError || !document) continue

      // Create inbox item
      const { data: inboxItem, error: itemError } = await supabase
        .from('invoice_inbox_items')
        .insert({
          user_id: userId,
          status: 'processing',
          source: 'email',
          email_from: payload.from,
          email_subject: payload.subject,
          email_received_at: payload.created_at,
          document_id: document.id,
        })
        .select()
        .single()

      if (itemError || !inboxItem) continue

      // Process: analyze invoice
      try {
        const extraction = await analyzeInvoice(attachment.content, attachment.content_type)

        // Supplier matching
        let matchedSupplierId: string | null = null
        const { data: suppliers } = await supabase
          .from('suppliers')
          .select('*')
          .eq('user_id', userId)

        if (suppliers && suppliers.length > 0) {
          const match = matchSupplier(extraction, suppliers)
          if (match && match.confidence >= 0.7) {
            matchedSupplierId = match.supplierId
          }
        }

        await supabase
          .from('invoice_inbox_items')
          .update({
            status: 'ready',
            extracted_data: extraction as unknown as Record<string, unknown>,
            confidence: extraction.confidence,
            matched_supplier_id: matchedSupplierId,
          })
          .eq('id', inboxItem.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed'
        await supabase
          .from('invoice_inbox_items')
          .update({ status: 'error', error_message: message })
          .eq('id', inboxItem.id)
      }

      processed.push(inboxItem.id)
    } catch (err) {
      console.error('[invoice-inbox] Processing attachment failed:', err)
    }
  }

  return NextResponse.json({ data: { processed: processed.length, ids: processed } })
}
