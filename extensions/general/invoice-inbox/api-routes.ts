import { NextResponse } from 'next/server'
import type { ApiRouteDefinition, ExtensionContext } from '@/lib/extensions/types'
import type { InvoiceExtractionResult } from './types'
import type { InvoiceInboxItem, SupplierInvoice } from '@/types'
import { analyzeDocument } from '@/lib/ai/document-analyzer'
import { matchSupplier } from './lib/supplier-matcher'
import { getSettings, saveSettings } from './index'
import { eventBus } from '@/lib/events/bus'
import { matchDocumentToTransactions } from '@/lib/documents/document-matcher'
import crypto from 'crypto'

// ============================================================
// Helpers
// ============================================================

async function getSupabase() {
  const { createClient } = await import('@/lib/supabase/server')
  return createClient()
}

function getIdParam(request: Request): string | null {
  const { searchParams } = new URL(request.url)
  return searchParams.get('_id')
}

// ============================================================
// GET /inbox — List inbox items
// ============================================================

async function handleGetInbox(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const companyId = ctx!.companyId
  const supabase = await getSupabase()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const documentType = searchParams.get('document_type')

  let query = supabase
    .from('invoice_inbox_items')
    .select('*, document:document_attachments(id, file_name, mime_type, storage_path), supplier:suppliers(id, name), receipt:receipts(id, merchant_name, total_amount, receipt_date, status, matched_transaction_id)')
    .eq('company_id', userId)

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

// ============================================================
// POST /inbox — Upload file(s) to inbox
// ============================================================

async function handlePostInbox(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const companyId = ctx!.companyId
  const supabase = await getSupabase()

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
      const result = await uploadAndCreateInboxItem(supabase, userId, companyId, file)
      items.push(result.inboxItem)

      // Process asynchronously
      processInboxItem(result.inboxItem.id as string, userId, companyId, result.base64, file.type).catch((err) =>
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
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  userId: string,
  companyId: string,
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
      company_id: companyId,
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
    payload: { inboxItem, userId, companyId },
  })

  return { inboxItem, base64 }
}

async function processInboxItem(
  itemId: string,
  userId: string,
  companyId: string,
  base64: string,
  mimeType: string
): Promise<void> {
  const supabase = await getSupabase()

  try {
    console.log(`[invoice-inbox] Processing item=${itemId}: starting AI analysis (${mimeType})`)
    const result = await analyzeDocument(base64, mimeType)

    const { classification } = result
    console.log(`[invoice-inbox] item=${itemId} classified as: ${classification.type} (confidence=${classification.confidence}, reasoning=${classification.reasoning})`)

    // Handle based on document type
    if (classification.type === 'receipt' && result.receipt) {
      await processAsReceipt(supabase, itemId, userId, companyId, result.receipt)
    } else if (classification.type === 'supplier_invoice' && result.invoice) {
      await processAsInvoice(supabase, itemId, userId, companyId, result.invoice)
    } else if (classification.type === 'government_letter' || classification.type === 'unknown') {
      // Store classification but no extraction — user must review manually
      await supabase
        .from('invoice_inbox_items')
        .update({
          status: 'ready',
          document_type: classification.type,
          confidence: classification.confidence,
        })
        .eq('id', itemId)
    } else {
      // Classification gave a type but extraction failed — fall back to supplier_invoice extraction
      console.warn(`[invoice-inbox] item=${itemId}: classified as ${classification.type} but no extraction data, falling back`)
      const { extractInvoice } = await import('@/lib/ai/document-analyzer')
      const fallbackExtraction = await extractInvoice(base64, mimeType)
      await processAsInvoice(supabase, itemId, userId, companyId, fallbackExtraction)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    await supabase
      .from('invoice_inbox_items')
      .update({ status: 'error', error_message: message })
      .eq('id', itemId)
  }
}

async function processAsReceipt(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  itemId: string,
  userId: string,
  companyId: string,
  extraction: import('@/types').ReceiptExtractionResult
): Promise<void> {
  console.log(`[invoice-inbox] item=${itemId} processing as receipt: merchant=${extraction.merchant?.name}, total=${extraction.totals?.total}`)

  // Fetch the inbox item to get document_id for the receipt image_url
  const { data: inboxItem } = await supabase
    .from('invoice_inbox_items')
    .select('document_id, document:document_attachments(storage_path)')
    .eq('id', itemId)
    .single()

  let imageUrl: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = inboxItem?.document as any
  if (document?.storage_path) {
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(document.storage_path)
    imageUrl = urlData?.publicUrl || null
  }

  // Create receipt record
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .insert({
      user_id: userId,
      image_url: imageUrl,
      status: 'extracted',
      extraction_confidence: extraction.confidence,
      merchant_name: extraction.merchant?.name || null,
      merchant_org_number: extraction.merchant?.orgNumber || null,
      merchant_vat_number: extraction.merchant?.vatNumber || null,
      receipt_date: extraction.receipt?.date || null,
      receipt_time: extraction.receipt?.time || null,
      total_amount: extraction.totals?.total || null,
      currency: extraction.receipt?.currency || 'SEK',
      vat_amount: extraction.totals?.vatAmount || null,
      is_restaurant: extraction.flags?.isRestaurant || false,
      is_systembolaget: extraction.flags?.isSystembolaget || false,
      is_foreign_merchant: extraction.flags?.isForeignMerchant || false,
      raw_extraction: extraction,
    })
    .select()
    .single()

  if (receiptError || !receipt) {
    console.error(`[invoice-inbox] item=${itemId} receipt creation failed:`, receiptError)
    // Fall back: store as receipt type without linked receipt
    await supabase
      .from('invoice_inbox_items')
      .update({
        status: 'ready',
        document_type: 'receipt',
        extracted_data: extraction as unknown as Record<string, unknown>,
        confidence: extraction.confidence,
      })
      .eq('id', itemId)
    return
  }

  // Insert receipt line items
  if (extraction.lineItems?.length > 0) {
    const lineItemsToInsert = extraction.lineItems.map((item, index) => ({
      receipt_id: receipt.id,
      description: item.description || '',
      quantity: item.quantity || 1,
      unit_price: item.unitPrice,
      line_total: item.lineTotal || 0,
      vat_rate: item.vatRate,
      vat_amount:
        item.vatRate && item.lineTotal
          ? Math.round((item.lineTotal * item.vatRate) / (100 + item.vatRate) * 100) / 100
          : null,
      suggested_category: item.suggestedCategory || null,
      sort_order: index,
    }))

    await supabase.from('receipt_line_items').insert(lineItemsToInsert)
  }

  // Update inbox item: mark as receipt with linked receipt
  await supabase
    .from('invoice_inbox_items')
    .update({
      status: 'ready',
      document_type: 'receipt',
      extracted_data: extraction as unknown as Record<string, unknown>,
      confidence: extraction.confidence,
      linked_receipt_id: receipt.id,
    })
    .eq('id', itemId)

  // Emit receipt.extracted event (non-blocking)
  try {
    await eventBus.emit({
      type: 'receipt.extracted',
      payload: {
        receipt,
        documentId: inboxItem?.document_id || null,
        confidence: extraction.confidence,
        userId,
        companyId,
      },
    })
  } catch {
    // Non-blocking
  }

  // Try to match receipt to a transaction
  try {
    const { data: updatedItem } = await supabase
      .from('invoice_inbox_items')
      .select('*')
      .eq('id', itemId)
      .single()

    if (updatedItem) {
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
    }
  } catch (matchError) {
    console.error('[invoice-inbox] Receipt transaction matching failed:', matchError)
  }
}

async function processAsInvoice(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  itemId: string,
  userId: string,
  companyId: string,
  extraction: InvoiceExtractionResult
): Promise<void> {
  console.log(`[invoice-inbox] item=${itemId} processing as supplier_invoice: supplier=${extraction.supplier?.name}, total=${extraction.totals?.total}`)

  // Supplier matching
  const settings = await getSettings(userId)
  let matchedSupplierId: string | null = null

  if (settings.autoMatchSupplierEnabled) {
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('*')
      .eq('company_id', userId)

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
    document_type: 'supplier_invoice',
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
        companyId,
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
      console.error('[invoice-inbox] Transaction matching failed:', matchError)
    }
  }
}

// ============================================================
// GET /inbox/:id — Get single inbox item
// ============================================================

async function handleGetInboxItem(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const companyId = ctx!.companyId
  const supabase = await getSupabase()
  const id = getIdParam(request)

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('invoice_inbox_items')
    .select('*, document:document_attachments(id, file_name, mime_type, storage_path), supplier:suppliers(id, name)')
    .eq('id', id)
    .eq('company_id', userId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

// ============================================================
// PATCH /inbox/:id — Update inbox item fields
// ============================================================

async function handlePatchInboxItem(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const companyId = ctx!.companyId
  const supabase = await getSupabase()
  const id = getIdParam(request)

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  const body = await request.json()

  // Verify item exists and belongs to user
  const { data: existing, error: findError } = await supabase
    .from('invoice_inbox_items')
    .select('id, status')
    .eq('id', id)
    .eq('company_id', userId)
    .single()

  if (findError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (existing.status === 'confirmed') {
    return NextResponse.json({ error: 'Cannot edit confirmed item' }, { status: 400 })
  }

  // Only allow updating certain fields
  const allowedFields: Record<string, unknown> = {}
  if (body.extracted_data !== undefined) allowedFields.extracted_data = body.extracted_data
  if (body.matched_supplier_id !== undefined) allowedFields.matched_supplier_id = body.matched_supplier_id

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('invoice_inbox_items')
    .update(allowedFields)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// ============================================================
// DELETE /inbox/:id — Soft-delete (reject) inbox item
// ============================================================

async function handleDeleteInboxItem(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const companyId = ctx!.companyId
  const supabase = await getSupabase()
  const id = getIdParam(request)

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  // Soft delete: set status to rejected
  const { data, error } = await supabase
    .from('invoice_inbox_items')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('company_id', userId)
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

// ============================================================
// POST /inbox/:id/process — Re-process an inbox item
// ============================================================

async function handleProcessInboxItem(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const companyId = ctx!.companyId
  const supabase = await getSupabase()
  const id = getIdParam(request)

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  // Fetch inbox item
  const { data: inboxItem, error: findError } = await supabase
    .from('invoice_inbox_items')
    .select('*, document:document_attachments(id, storage_path, mime_type)')
    .eq('id', id)
    .eq('company_id', userId)
    .single()

  if (findError || !inboxItem) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (inboxItem.status === 'confirmed') {
    return NextResponse.json({ error: 'Already confirmed' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = inboxItem.document as any
  if (!document?.storage_path || !document?.mime_type) {
    return NextResponse.json({ error: 'No document attached' }, { status: 400 })
  }

  // Update status to processing
  await supabase
    .from('invoice_inbox_items')
    .update({ status: 'processing', error_message: null })
    .eq('id', id)

  try {
    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.storage_path)

    if (downloadError || !fileData) {
      await supabase
        .from('invoice_inbox_items')
        .update({ status: 'error', error_message: 'Failed to download document' })
        .eq('id', id)
      return NextResponse.json({ error: 'Failed to download document' }, { status: 500 })
    }

    const arrayBuffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Reset previous classification on re-process
    await supabase
      .from('invoice_inbox_items')
      .update({
        matched_transaction_id: null,
        match_confidence: null,
        match_method: null,
        linked_receipt_id: null,
      })
      .eq('id', id)

    // Analyze with classification
    const result = await analyzeDocument(base64, document.mime_type)
    const { classification } = result

    console.log(`[invoice-inbox] Re-process item=${id} classified as: ${classification.type} (confidence=${classification.confidence})`)

    if (classification.type === 'receipt' && result.receipt) {
      await processAsReceipt(supabase, id, userId, companyId, result.receipt)
    } else if (classification.type === 'supplier_invoice' && result.invoice) {
      await processAsInvoice(supabase, id, userId, companyId, result.invoice)
    } else if (classification.type === 'government_letter' || classification.type === 'unknown') {
      await supabase
        .from('invoice_inbox_items')
        .update({
          status: 'ready',
          document_type: classification.type,
          confidence: classification.confidence,
          error_message: null,
        })
        .eq('id', id)
    } else {
      // Fallback: extract as invoice
      const { extractInvoice } = await import('@/lib/ai/document-analyzer')
      const fallbackExtraction = await extractInvoice(base64, document.mime_type)
      await processAsInvoice(supabase, id, userId, companyId, fallbackExtraction)
    }

    // Fetch final state
    const { data: updatedItem, error: updateError } = await supabase
      .from('invoice_inbox_items')
      .select('*')
      .eq('id', id)
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ data: updatedItem })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed'
    await supabase
      .from('invoice_inbox_items')
      .update({ status: 'error', error_message: message })
      .eq('id', id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================================
// POST /inbox/:id/confirm — Confirm inbox item as supplier invoice
// ============================================================

async function handleConfirmInboxItem(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const companyId = ctx!.companyId
  const supabase = await getSupabase()
  const id = getIdParam(request)

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  // Fetch inbox item
  const { data: inboxItem, error: findError } = await supabase
    .from('invoice_inbox_items')
    .select('*')
    .eq('id', id)
    .eq('company_id', userId)
    .single()

  if (findError || !inboxItem) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (inboxItem.status === 'confirmed') {
    return NextResponse.json({ error: 'Already confirmed' }, { status: 400 })
  }

  if (!inboxItem.extracted_data) {
    return NextResponse.json({ error: 'No extracted data available' }, { status: 400 })
  }

  const extraction = inboxItem.extracted_data as unknown as InvoiceExtractionResult
  const body = await request.json().catch(() => ({}))

  try {
    console.log('[invoice-inbox] Confirm: starting for item', id, 'extraction keys:', Object.keys(extraction))

    // Resolve supplier: use matched, use body override, or create new
    let supplierId = body.supplier_id || inboxItem.matched_supplier_id

    if (!supplierId) {
      // Use frontend-provided supplier data if available, otherwise fall back to extraction
      const frontendSupplier = body.new_supplier as {
        name?: string
        supplier_type?: string
        org_number?: string
        vat_number?: string
        bankgiro?: string
        plusgiro?: string
        default_expense_account?: string
        default_currency?: string
      } | undefined

      const supplierName = frontendSupplier?.name || extraction.supplier?.name
      if (!supplierName) {
        return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
      }

      const validSupplierTypes = ['swedish_business', 'eu_business', 'non_eu_business']
      const supplierType = frontendSupplier?.supplier_type && validSupplierTypes.includes(frontendSupplier.supplier_type)
        ? frontendSupplier.supplier_type
        : 'swedish_business'

      const { data: newSupplier, error: supplierError } = await supabase
        .from('suppliers')
        .insert({
          user_id: userId,
          name: supplierName,
          supplier_type: supplierType,
          org_number: frontendSupplier?.org_number || extraction.supplier?.orgNumber || null,
          vat_number: frontendSupplier?.vat_number || extraction.supplier?.vatNumber || null,
          bankgiro: frontendSupplier?.bankgiro || extraction.supplier?.bankgiro || null,
          plusgiro: frontendSupplier?.plusgiro || extraction.supplier?.plusgiro || null,
          default_expense_account: frontendSupplier?.default_expense_account || '6200',
          default_payment_terms: 30,
          default_currency: frontendSupplier?.default_currency || extraction.invoice?.currency || 'SEK',
        })
        .select()
        .single()

      if (supplierError || !newSupplier) {
        console.error('[invoice-inbox] Confirm: supplier creation failed:', supplierError)
        return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
      }

      supplierId = newSupplier.id
    }

    // Verify supplier exists and belongs to user
    const { data: supplier, error: supplierCheckError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .eq('company_id', userId)
      .single()

    if (supplierCheckError || !supplier) {
      console.error('[invoice-inbox] Confirm: supplier check failed:', supplierCheckError, 'supplierId=', supplierId)
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    // Get next arrival number
    const { data: arrivalNum, error: arrivalError } = await supabase
      .rpc('get_next_arrival_number', { p_user_id: userId })

    if (arrivalError) {
      console.error('[invoice-inbox] Confirm: arrival number error:', arrivalError)
      return NextResponse.json({ error: 'Failed to get arrival number' }, { status: 500 })
    }

    console.log('[invoice-inbox] Confirm: supplierId=', supplierId, 'arrivalNum=', arrivalNum)

    // Build line items from extraction.
    // The AI extraction may return lineTotal as gross (incl. VAT) or net.
    // Cross-check with extraction.totals to determine the correct split.
    const extractedTotals = extraction.totals
    const rawLineItems = extraction.lineItems || []

    const items: Array<{
      sort_order: number
      description: string
      quantity: number
      unit: string
      unit_price: number
      line_total: number
      account_number: string
      vat_code: null
      vat_rate: number
      vat_amount: number
    }> = []

    if (rawLineItems.length > 0 && extractedTotals?.subtotal != null && extractedTotals?.vatAmount != null) {
      // We have both line items and reliable totals — use totals for amounts
      // and distribute proportionally across line items
      const rawSum = rawLineItems.reduce((s, i) => s + (i.lineTotal || 0), 0)
      const knownSubtotal = extractedTotals.subtotal
      const knownVat = extractedTotals.vatAmount
      const knownVatRate = knownSubtotal > 0
        ? Math.round((knownVat / knownSubtotal) * 100) / 100
        : 0.25

      for (let index = 0; index < rawLineItems.length; index++) {
        const item = rawLineItems[index]
        // Distribute the known subtotal proportionally by each line's share
        const proportion = rawSum > 0 ? (item.lineTotal || 0) / rawSum : 1 / rawLineItems.length
        const lineNet = Math.round(knownSubtotal * proportion * 100) / 100
        const lineVat = Math.round(knownVat * proportion * 100) / 100
        items.push({
          sort_order: index,
          description: item.description,
          quantity: item.quantity || 1,
          unit: 'st',
          unit_price: lineNet,
          line_total: lineNet,
          account_number: item.accountSuggestion || supplier.default_expense_account || '6200',
          vat_code: null,
          vat_rate: knownVatRate,
          vat_amount: lineVat,
        })
      }
    } else if (rawLineItems.length > 0) {
      // Line items but no reliable totals — use per-line vatRate
      for (let index = 0; index < rawLineItems.length; index++) {
        const item = rawLineItems[index]
        const vatRate = item.vatRate != null ? item.vatRate / 100 : 0.25
        const lineTotal = Math.round(item.lineTotal * 100) / 100
        const vatAmount = Math.round(lineTotal * vatRate * 100) / 100
        items.push({
          sort_order: index,
          description: item.description,
          quantity: item.quantity || 1,
          unit: 'st',
          unit_price: item.unitPrice != null ? item.unitPrice : lineTotal,
          line_total: lineTotal,
          account_number: item.accountSuggestion || supplier.default_expense_account || '6200',
          vat_code: null,
          vat_rate: vatRate,
          vat_amount: vatAmount,
        })
      }
    }

    // If no line items, create a single item from totals
    if (items.length === 0 && extractedTotals?.total) {
      const total = extractedTotals.total
      const vatAmt = extractedTotals.vatAmount || 0
      const sub = extractedTotals.subtotal || total - vatAmt
      const vatRate = sub > 0 ? Math.round((vatAmt / sub) * 100) / 100 : 0.25
      items.push({
        sort_order: 0,
        description: 'Fakturabelopp',
        quantity: 1,
        unit: 'st',
        unit_price: sub,
        line_total: sub,
        account_number: supplier.default_expense_account || '6200',
        vat_code: null,
        vat_rate: vatRate,
        vat_amount: Math.round(vatAmt * 100) / 100,
      })
    }

    const subtotal = items.reduce((sum, i) => sum + i.line_total, 0)
    const vatAmount = items.reduce((sum, i) => sum + i.vat_amount, 0)
    const total = Math.round((subtotal + vatAmount) * 100) / 100

    // Determine VAT treatment
    const primaryVatRate = items[0]?.vat_rate || 0.25
    let vatTreatment = 'standard_25'
    if (primaryVatRate === 0.12) vatTreatment = 'reduced_12'
    else if (primaryVatRate === 0.06) vatTreatment = 'reduced_6'
    else if (primaryVatRate === 0) vatTreatment = 'exempt'

    console.log('[invoice-inbox] Confirm: items=', items.length, 'subtotal=', subtotal, 'vat=', vatAmount, 'total=', total, 'vatTreatment=', vatTreatment)

    // Insert supplier invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('supplier_invoices')
      .insert({
        user_id: userId,
        supplier_id: supplierId,
        arrival_number: arrivalNum,
        supplier_invoice_number: extraction.invoice?.invoiceNumber || `INBOX-${Date.now()}`,
        invoice_date: extraction.invoice?.invoiceDate || new Date().toISOString().split('T')[0],
        due_date: extraction.invoice?.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        status: 'registered',
        currency: extraction.invoice?.currency || 'SEK',
        vat_treatment: vatTreatment,
        payment_reference: extraction.invoice?.paymentReference || null,
        subtotal: Math.round(subtotal * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        total: Math.round(total * 100) / 100,
        remaining_amount: Math.round(total * 100) / 100,
        document_id: inboxItem.document_id || null,
        notes: body.notes || null,
      })
      .select()
      .single()

    if (invoiceError || !invoice) {
      console.error('[invoice-inbox] Confirm: invoice insert error:', invoiceError)
      return NextResponse.json({ error: invoiceError?.message || 'Failed to create invoice' }, { status: 500 })
    }

    console.log('[invoice-inbox] Confirm: invoice created id=', invoice.id)

    // Insert line items
    const itemInserts = items.map((item) => ({
      supplier_invoice_id: invoice.id,
      ...item,
    }))

    const { error: itemsError } = await supabase
      .from('supplier_invoice_items')
      .insert(itemInserts)

    if (itemsError) {
      console.error('[invoice-inbox] Confirm: items insert error:', itemsError, 'payload:', JSON.stringify(itemInserts))
      await supabase.from('supplier_invoices').delete().eq('id', invoice.id)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    // Update inbox item as confirmed
    await supabase
      .from('invoice_inbox_items')
      .update({
        status: 'confirmed',
        matched_supplier_id: supplierId,
        created_supplier_invoice_id: invoice.id,
      })
      .eq('id', inboxItem.id)

    // Emit confirmed event
    try {
      await eventBus.emit({
        type: 'supplier_invoice.confirmed',
        payload: {
          inboxItem: { ...inboxItem, status: 'confirmed' },
          supplierInvoice: invoice as SupplierInvoice,
          userId,
          companyId,
        },
      })
    } catch {
      // Non-blocking
    }

    // Journal entry creation is handled asynchronously by the core
    // supplier_invoice.confirmed event handler (see lib/bookkeeping/handlers/)
    return NextResponse.json({
      data: {
        ...invoice,
        items: itemInserts,
      },
    })
  } catch (error) {
    console.error('[invoice-inbox] Confirm failed:', error instanceof Error ? error.stack : error)
    return NextResponse.json({ error: 'Confirmation failed' }, { status: 500 })
  }
}

// ============================================================
// POST /inbox/:id/confirm-receipt — Confirm inbox item as receipt
// ============================================================

async function handleConfirmReceipt(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const companyId = ctx!.companyId
  const supabase = await getSupabase()
  const id = getIdParam(request)

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  // Fetch inbox item
  const { data: inboxItem, error: findError } = await supabase
    .from('invoice_inbox_items')
    .select('*')
    .eq('id', id)
    .eq('company_id', userId)
    .single()

  if (findError || !inboxItem) {
    return NextResponse.json({ error: 'Inbox item not found' }, { status: 404 })
  }

  if (inboxItem.document_type !== 'receipt') {
    return NextResponse.json({ error: 'Inbox item is not a receipt' }, { status: 400 })
  }

  if (!inboxItem.linked_receipt_id) {
    return NextResponse.json({ error: 'No linked receipt found' }, { status: 400 })
  }

  const body = await request.json()
  const {
    line_items,
    matched_transaction_id,
    representation_persons,
    representation_purpose,
    representation_business_connection,
  } = body

  // Update receipt line items (business/private classification)
  if (Array.isArray(line_items)) {
    for (const item of line_items) {
      if (!item.id) continue
      await supabase
        .from('receipt_line_items')
        .update({
          is_business: item.is_business,
          ...(item.category ? { category: item.category } : {}),
          ...(item.bas_account ? { bas_account: item.bas_account } : {}),
        })
        .eq('id', item.id)
        .eq('receipt_id', inboxItem.linked_receipt_id)
    }
  }

  // Calculate business/private totals
  const { data: updatedLineItems } = await supabase
    .from('receipt_line_items')
    .select('*')
    .eq('receipt_id', inboxItem.linked_receipt_id)

  let businessTotal = 0
  let privateTotal = 0
  if (updatedLineItems) {
    for (const li of updatedLineItems) {
      if (li.is_business === true) {
        businessTotal += li.line_total
      } else if (li.is_business === false) {
        privateTotal += li.line_total
      }
    }
  }
  businessTotal = Math.round(businessTotal * 100) / 100
  privateTotal = Math.round(privateTotal * 100) / 100

  // Update receipt with match and representation data
  const receiptUpdate: Record<string, unknown> = {
    status: 'confirmed',
  }

  if (matched_transaction_id) {
    receiptUpdate.matched_transaction_id = matched_transaction_id
  }
  if (representation_persons != null) {
    receiptUpdate.representation_persons = representation_persons
  }
  if (representation_purpose) {
    receiptUpdate.representation_purpose = representation_purpose
  }
  if (representation_business_connection) {
    receiptUpdate.representation_business_connection = representation_business_connection
  }

  await supabase
    .from('receipts')
    .update(receiptUpdate)
    .eq('id', inboxItem.linked_receipt_id)

  // Link transaction to receipt if provided
  if (matched_transaction_id) {
    await supabase
      .from('transactions')
      .update({ receipt_id: inboxItem.linked_receipt_id })
      .eq('id', matched_transaction_id)
      .eq('company_id', userId)
  }

  // Update inbox item status
  await supabase
    .from('invoice_inbox_items')
    .update({ status: 'confirmed' })
    .eq('id', id)

  // Emit event (non-blocking)
  try {
    const { data: receipt } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', inboxItem.linked_receipt_id)
      .single()

    if (receipt) {
      await eventBus.emit({
        type: 'receipt.confirmed',
        payload: {
          receipt,
          businessTotal,
          privateTotal,
          userId,
          companyId,
        },
      })
    }
  } catch {
    // Non-blocking
  }

  return NextResponse.json({ data: { confirmed: true, businessTotal, privateTotal } })
}

// ============================================================
// GET /settings — Get extension settings
// ============================================================

async function handleGetSettings(
  _request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const companyId = ctx!.companyId
  const settings = await getSettings(userId)
  return NextResponse.json({ data: settings })
}

// ============================================================
// PUT /settings — Update extension settings
// ============================================================

async function handlePutSettings(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const companyId = ctx!.companyId
  const body = await request.json()
  const settings = await saveSettings(userId, body)
  return NextResponse.json({ data: settings })
}

// ============================================================
// Route definitions
// ============================================================

export const invoiceInboxApiRoutes: ApiRouteDefinition[] = [
  // /inbox
  {
    method: 'GET',
    path: '/inbox',
    handler: handleGetInbox,
  },
  {
    method: 'POST',
    path: '/inbox',
    handler: handlePostInbox,
  },
  // /inbox/:id
  {
    method: 'GET',
    path: '/inbox/:id',
    handler: handleGetInboxItem,
  },
  {
    method: 'PATCH',
    path: '/inbox/:id',
    handler: handlePatchInboxItem,
  },
  {
    method: 'DELETE',
    path: '/inbox/:id',
    handler: handleDeleteInboxItem,
  },
  // /inbox/:id/process
  {
    method: 'POST',
    path: '/inbox/:id/process',
    handler: handleProcessInboxItem,
  },
  // /inbox/:id/confirm
  {
    method: 'POST',
    path: '/inbox/:id/confirm',
    handler: handleConfirmInboxItem,
  },
  // /inbox/:id/confirm-receipt
  {
    method: 'POST',
    path: '/inbox/:id/confirm-receipt',
    handler: handleConfirmReceipt,
  },
  // /settings
  {
    method: 'GET',
    path: '/settings',
    handler: handleGetSettings,
  },
  {
    method: 'PUT',
    path: '/settings',
    handler: handlePutSettings,
  },
]
