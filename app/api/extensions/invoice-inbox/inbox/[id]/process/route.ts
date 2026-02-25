import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { eventBus } from '@/lib/events/bus'
import { analyzeInvoice } from '@/extensions/general/invoice-inbox/lib/invoice-analyzer'
import { matchSupplier } from '@/extensions/general/invoice-inbox/lib/supplier-matcher'
import { getSettings } from '@/extensions/general/invoice-inbox'
import { matchDocumentToTransactions } from '@/lib/documents/document-matcher'
import type { InvoiceInboxItem } from '@/types'

ensureInitialized()

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Fetch inbox item
  const { data: inboxItem, error: findError } = await supabase
    .from('invoice_inbox_items')
    .select('*, document:document_attachments(id, storage_path, mime_type)')
    .eq('id', id)
    .eq('user_id', user.id)
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

    // Analyze
    const extraction = await analyzeInvoice(base64, document.mime_type)

    // Supplier matching
    const settings = await getSettings(user.id)
    let matchedSupplierId: string | null = null

    if (settings.autoMatchSupplierEnabled) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('*')
        .eq('user_id', user.id)

      if (suppliers && suppliers.length > 0) {
        const match = matchSupplier(extraction, suppliers)
        if (match && match.confidence >= settings.supplierMatchThreshold) {
          matchedSupplierId = match.supplierId
        }
      }
    }

    // Update inbox item with extraction + template suggestion
    const updateData: Record<string, unknown> = {
      status: 'ready',
      extracted_data: extraction as unknown as Record<string, unknown>,
      confidence: extraction.confidence,
      matched_supplier_id: matchedSupplierId,
      error_message: null,
      // Reset previous match on re-process
      matched_transaction_id: null,
      match_confidence: null,
      match_method: null,
    }

    if (extraction.suggestedTemplateId) {
      updateData.suggested_template_id = extraction.suggestedTemplateId
      updateData.suggested_template_confidence = extraction.confidence
    }

    const { data: updatedItem, error: updateError } = await supabase
      .from('invoice_inbox_items')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    if (updatedItem) {
      await eventBus.emit({
        type: 'supplier_invoice.extracted',
        payload: {
          inboxItem: updatedItem,
          confidence: extraction.confidence,
          userId: user.id,
        },
      })

      // Document-to-transaction matching (non-blocking)
      try {
        const matchResult = await matchDocumentToTransactions(
          supabase,
          user.id,
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
            .eq('id', id)
        }
      } catch (matchError) {
        console.error('[invoice-inbox] Transaction matching failed:', matchError)
      }
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
