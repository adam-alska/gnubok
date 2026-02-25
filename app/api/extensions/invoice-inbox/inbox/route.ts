import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { eventBus } from '@/lib/events/bus'
import { analyzeInvoice } from '@/extensions/general/invoice-inbox/lib/invoice-analyzer'
import { matchSupplier } from '@/extensions/general/invoice-inbox/lib/supplier-matcher'
import { getSettings } from '@/extensions/general/invoice-inbox'
import { matchDocumentToTransactions } from '@/lib/documents/document-matcher'
import type { InvoiceInboxItem, InvoiceExtractionResult } from '@/types'
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
  const documentType = searchParams.get('document_type')

  let query = supabase
    .from('invoice_inbox_items')
    .select('*, document:document_attachments(id, file_name, mime_type, storage_path), supplier:suppliers(id, name), receipt:receipts(id, merchant_name, total_amount, receipt_date, status, matched_transaction_id)')
    .eq('user_id', user.id)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (documentType && documentType !== 'all') {
    query = query.eq('document_type', documentType)
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

  // Support batch upload: multiple `files` entries, fallback to single `file`
  const files: File[] = []
  const multiFiles = formData.getAll('files')
  if (multiFiles.length > 0) {
    for (const f of multiFiles) {
      if (f instanceof File) files.push(f)
    }
  } else {
    const single = formData.get('file') as File | null
    if (single) files.push(single)
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  const items: Array<Record<string, unknown>> = []
  const errors: string[] = []

  for (const file of files) {
    if (!supportedTypes.includes(file.type)) {
      errors.push(`${file.name}: unsupported file type`)
      continue
    }

    try {
      const result = await uploadAndCreateInboxItem(supabase, user.id, file)
      items.push(result.inboxItem)

      // Process asynchronously
      processInboxItem(result.inboxItem.id as string, user.id, result.base64, file.type).catch((err) =>
        console.error('[invoice-inbox] Background processing failed:', err)
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      errors.push(`${file.name}: ${message}`)
    }
  }

  // Return array for batch, single item for backward compat
  if (files.length === 1 && items.length === 1) {
    return NextResponse.json({ data: items[0] })
  }

  return NextResponse.json({ data: items, errors: errors.length > 0 ? errors : undefined })
}

async function uploadAndCreateInboxItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File
): Promise<{ inboxItem: Record<string, unknown>; base64: string }> {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const base64 = buffer.toString('base64')
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')

  const storagePath = `documents/${userId}/inbox/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType: file.type })

  if (uploadError) {
    throw new Error('Failed to upload file')
  }

  const { data: document, error: docError } = await supabase
    .from('document_attachments')
    .insert({
      user_id: userId,
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
    throw new Error('Failed to create document record')
  }

  const { data: inboxItem, error: itemError } = await supabase
    .from('invoice_inbox_items')
    .insert({
      user_id: userId,
      status: 'processing',
      source: 'upload',
      document_id: document.id,
    })
    .select()
    .single()

  if (itemError || !inboxItem) {
    throw new Error('Failed to create inbox item')
  }

  await eventBus.emit({
    type: 'supplier_invoice.received',
    payload: { inboxItem, userId },
  })

  return { inboxItem, base64 }
}

async function processInboxItem(
  itemId: string,
  userId: string,
  base64: string,
  mimeType: string
): Promise<void> {
  const supabase = await createClient()

  try {
    console.log(`[invoice-inbox] Processing item=${itemId}: starting AI extraction (${mimeType})`)
    const extraction = await analyzeInvoice(base64, mimeType)

    console.log(`[invoice-inbox] item=${itemId} extraction complete:`, {
      confidence: extraction.confidence,
      suggestedTemplateId: extraction.suggestedTemplateId || null,
      supplier: extraction.supplier?.name || null,
      total: extraction.totals?.total || null,
      invoiceDate: extraction.invoice?.invoiceDate || null,
      dueDate: extraction.invoice?.dueDate || null,
      paymentRef: extraction.invoice?.paymentReference || null,
    })

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
          console.log(`[invoice-inbox] item=${itemId} supplier matched: id=${match.supplierId} confidence=${match.confidence}`)
        }
      }
    }

    // Store extraction result with template suggestion
    const updateData: Record<string, unknown> = {
      status: 'ready',
      extracted_data: extraction as unknown as Record<string, unknown>,
      confidence: extraction.confidence,
      matched_supplier_id: matchedSupplierId,
    }

    if (extraction.suggestedTemplateId) {
      updateData.suggested_template_id = extraction.suggestedTemplateId
      updateData.suggested_template_confidence = extraction.confidence
      console.log(`[invoice-inbox] item=${itemId} template suggestion: ${extraction.suggestedTemplateId} (confidence=${extraction.confidence})`)
    }

    await supabase
      .from('invoice_inbox_items')
      .update(updateData)
      .eq('id', itemId)

    // Fetch the updated item for event emission and matching
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

      // Document-to-transaction matching
      try {
        const matchResult = await matchDocumentToTransactions(
          supabase,
          userId,
          updatedItem as InvoiceInboxItem
        )

        if (matchResult) {
          await supabase
            .from('invoice_inbox_items')
            .update({
              matched_transaction_id: matchResult.transactionId,
              match_confidence: matchResult.confidence,
              match_method: matchResult.method,
            })
            .eq('id', itemId)
        }
      } catch (matchError) {
        // Non-blocking: log but don't fail the item
        console.error('[invoice-inbox] Transaction matching failed:', matchError)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    await supabase
      .from('invoice_inbox_items')
      .update({ status: 'error', error_message: message })
      .eq('id', itemId)
  }
}
