import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { parseInboundPayload, extractAttachments, resolveUserFromEmail } from '@/extensions/general/invoice-inbox/lib/email-handler'
import { matchSupplier } from '@/extensions/general/invoice-inbox/lib/supplier-matcher'
import { analyzeDocument } from '@/lib/ai/document-analyzer'
import { processReceiptFromDocument } from '@/extensions/general/receipt-ocr/lib/receipt-pipeline'
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

/**
 * Build raw email payload for BFL 7 kap. 2§ archiving.
 * Includes full email headers and body — excludes binary attachment content.
 */
function buildRawEmailPayload(body: Record<string, unknown>, payload: { from: string; to: string; subject: string; created_at: string }): Record<string, unknown> {
  return {
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    created_at: payload.created_at,
    text: body.text ?? null,
    html: body.html ?? null,
    headers: body.headers ?? null,
    message_id: body.message_id ?? null,
    in_reply_to: body.in_reply_to ?? null,
    references: body.references ?? null,
    archived_at: new Date().toISOString(),
  }
}

export async function POST(request: Request) {
  // Verify webhook signature
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[document-inbox] RESEND_WEBHOOK_SECRET not configured')
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
  const resolved = await resolveUserFromEmail(payload.to, supabase)

  if (!resolved) {
    console.warn(`[document-inbox] No user found for email: ${payload.to}`)
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { userId, companyId } = resolved

  // Build raw email payload for BFL 7:2 archiving (no binary attachment content)
  const rawEmailPayload = buildRawEmailPayload(body, payload)

  // Extract file attachments
  const attachments = extractAttachments(payload)

  if (attachments.length === 0) {
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
        raw_email_payload: rawEmailPayload,
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
        console.error('[document-inbox] Upload failed:', uploadError)
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

      // Unified classify + extract in a single Claude call
      let documentType: 'supplier_invoice' | 'receipt' | 'government_letter' | 'unknown' = 'supplier_invoice'
      let unifiedResult: Awaited<ReturnType<typeof analyzeDocument>> | null = null
      try {
        unifiedResult = await analyzeDocument(attachment.content, attachment.content_type)
        documentType = unifiedResult.classification.type
        console.log(`[document-inbox] Classified as ${documentType} (confidence: ${unifiedResult.classification.confidence})`)
      } catch (classifyErr) {
        console.error('[document-inbox] Classification failed, defaulting to supplier_invoice:', classifyErr)
      }

      // Create inbox item with document type and raw email payload
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
          document_type: documentType,
          raw_email_payload: rawEmailPayload,
        })
        .select()
        .single()

      if (itemError || !inboxItem) continue

      // Route based on document type
      try {
        switch (documentType) {
          case 'supplier_invoice': {
            // Use pre-extracted invoice data from unified call
            const extraction = unifiedResult?.invoice
            if (!extraction) {
              throw new Error('No invoice extraction available')
            }

            const isReverseCharge = unifiedResult?.classification.isReverseCharge ?? false

            // Store reverse charge flag in extracted data
            const extractedData = {
              ...(extraction as unknown as Record<string, unknown>),
              isReverseCharge,
            }

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
                extracted_data: extractedData,
                confidence: extraction.confidence,
                matched_supplier_id: matchedSupplierId,
              })
              .eq('id', inboxItem.id)
            break
          }

          case 'receipt': {
            // Use pre-extracted receipt data from unified call
            const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storagePath)

            const result = await processReceiptFromDocument(supabase, userId, companyId, attachment.content, attachment.content_type, {
              documentId: document.id,
              source: 'email',
              emailFrom: payload.from,
              storageUrl: urlData.publicUrl,
              preExtracted: unifiedResult?.receipt ?? undefined,
            })

            await supabase
              .from('invoice_inbox_items')
              .update({
                status: 'ready',
                linked_receipt_id: result.receipt.id,
                confidence: result.receipt.extraction_confidence,
              })
              .eq('id', inboxItem.id)
            break
          }

          case 'government_letter': {
            // Store with status ready for manual review
            await supabase
              .from('invoice_inbox_items')
              .update({
                status: 'ready',
                extracted_data: {
                  sender: payload.from,
                  subject: payload.subject,
                  body: typeof body.text === 'string' ? body.text : null,
                },
              })
              .eq('id', inboxItem.id)
            break
          }

          case 'unknown':
          default: {
            // Store with status ready for manual handling
            await supabase
              .from('invoice_inbox_items')
              .update({ status: 'ready' })
              .eq('id', inboxItem.id)
            break
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Processing failed'
        await supabase
          .from('invoice_inbox_items')
          .update({ status: 'error', error_message: message })
          .eq('id', inboxItem.id)
      }

      processed.push(inboxItem.id)
    } catch (err) {
      console.error('[document-inbox] Processing attachment failed:', err)
    }
  }

  return NextResponse.json({ data: { processed: processed.length, ids: processed } })
}
