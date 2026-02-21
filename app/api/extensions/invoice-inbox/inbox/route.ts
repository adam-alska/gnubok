import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { eventBus } from '@/lib/events/bus'
import { analyzeInvoice } from '@/extensions/general/invoice-inbox/lib/invoice-analyzer'
import { matchSupplier } from '@/extensions/general/invoice-inbox/lib/supplier-matcher'
import { getSettings } from '@/extensions/general/invoice-inbox'
import crypto from 'crypto'

ensureInitialized()

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('invoice_inbox_items')
    .select('*, document:document_attachments(id, file_name, mime_type, storage_path), supplier:suppliers(id, name)')
    .eq('user_id', user.id)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (!supportedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  try {
    // Read file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')
    const hash = crypto.createHash('sha256').update(buffer).digest('hex')

    // Upload to storage
    const storagePath = `documents/${user.id}/inbox/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, { contentType: file.type })

    if (uploadError) {
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Create document attachment record
    const { data: document, error: docError } = await supabase
      .from('document_attachments')
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        file_name: file.name,
        file_size_bytes: buffer.length,
        mime_type: file.type,
        sha256_hash: hash,
        upload_source: 'file_upload',
      })
      .select()
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
    }

    // Create inbox item
    const { data: inboxItem, error: itemError } = await supabase
      .from('invoice_inbox_items')
      .insert({
        user_id: user.id,
        status: 'processing',
        source: 'upload',
        document_id: document.id,
      })
      .select()
      .single()

    if (itemError || !inboxItem) {
      return NextResponse.json({ error: 'Failed to create inbox item' }, { status: 500 })
    }

    // Emit received event
    await eventBus.emit({
      type: 'supplier_invoice.received',
      payload: { inboxItem, userId: user.id },
    })

    // Process asynchronously - analyze and match
    processInboxItem(inboxItem.id, user.id, base64, file.type).catch((err) =>
      console.error('[invoice-inbox] Background processing failed:', err)
    )

    return NextResponse.json({ data: inboxItem })
  } catch (error) {
    console.error('[invoice-inbox] Upload failed:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

async function processInboxItem(
  itemId: string,
  userId: string,
  base64: string,
  mimeType: string
): Promise<void> {
  const supabase = await createClient()

  try {
    const extraction = await analyzeInvoice(base64, mimeType)

    // Supplier matching
    const settings = await getSettings(userId)
    let matchedSupplierId: string | null = null

    if (settings.autoMatchSupplierEnabled) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('*')
        .eq('user_id', userId)

      if (suppliers && suppliers.length > 0) {
        const match = matchSupplier(extraction, suppliers)
        if (match && match.confidence >= settings.supplierMatchThreshold) {
          matchedSupplierId = match.supplierId
        }
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
      .eq('id', itemId)

    const { data: updatedItem } = await supabase
      .from('invoice_inbox_items')
      .select('*')
      .eq('id', itemId)
      .single()

    if (updatedItem) {
      await eventBus.emit({
        type: 'supplier_invoice.extracted',
        payload: {
          inboxItem: updatedItem,
          confidence: extraction.confidence,
          userId,
        },
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    await supabase
      .from('invoice_inbox_items')
      .update({ status: 'error', error_message: message })
      .eq('id', itemId)
  }
}
