import { createClient } from '@/lib/supabase/server'
import { eventBus } from '@/lib/events/bus'
import { analyzeInvoice } from './lib/invoice-analyzer'
import { matchSupplier } from './lib/supplier-matcher'
import type { Extension } from '@/lib/extensions/types'
import type { EventPayload } from '@/lib/events/types'
import type { InvoiceInboxSettings } from './types'

// ============================================================
// Settings
// ============================================================

const DEFAULT_SETTINGS: InvoiceInboxSettings = {
  autoProcessEnabled: true,
  autoMatchSupplierEnabled: true,
  supplierMatchThreshold: 0.7,
  inboxEmail: null,
}

export async function getSettings(userId: string): Promise<InvoiceInboxSettings> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('extension_data')
    .select('value')
    .eq('user_id', userId)
    .eq('extension_id', 'invoice-inbox')
    .eq('key', 'settings')
    .single()

  if (!data?.value) return { ...DEFAULT_SETTINGS }

  return { ...DEFAULT_SETTINGS, ...(data.value as Partial<InvoiceInboxSettings>) }
}

export async function saveSettings(
  userId: string,
  partial: Partial<InvoiceInboxSettings>
): Promise<InvoiceInboxSettings> {
  const current = await getSettings(userId)
  const merged = { ...current, ...partial }

  const supabase = await createClient()

  await supabase
    .from('extension_data')
    .upsert(
      {
        user_id: userId,
        extension_id: 'invoice-inbox',
        key: 'settings',
        value: merged,
      },
      { onConflict: 'user_id,extension_id,key' }
    )

  return merged
}

// ============================================================
// Event Handlers
// ============================================================

const INVOICE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]

/**
 * When a PDF/image is uploaded via the document archive, check if it should
 * be auto-processed as a supplier invoice.
 */
async function handleDocumentUploaded(
  payload: EventPayload<'document.uploaded'>
): Promise<void> {
  const { document, userId } = payload

  // Gate: Is it a supported file type?
  if (!document.mime_type || !INVOICE_MIME_TYPES.includes(document.mime_type)) {
    return
  }

  // Gate: Is autoProcessEnabled?
  const settings = await getSettings(userId)
  if (!settings.autoProcessEnabled) {
    return
  }

  // Gate: Was this document already processed as an inbox item?
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('invoice_inbox_items')
    .select('id')
    .eq('user_id', userId)
    .eq('document_id', document.id)
    .limit(1)

  if (existing && existing.length > 0) {
    return
  }

  console.log(`[invoice-inbox] Auto-process triggered for document ${document.id}`)

  try {
    // Create inbox item
    const { data: inboxItem, error: insertError } = await supabase
      .from('invoice_inbox_items')
      .insert({
        user_id: userId,
        status: 'processing',
        source: 'upload',
        document_id: document.id,
      })
      .select()
      .single()

    if (insertError || !inboxItem) {
      console.error('[invoice-inbox] Failed to create inbox item:', insertError)
      return
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.storage_path)

    if (downloadError || !fileData) {
      await supabase
        .from('invoice_inbox_items')
        .update({ status: 'error', error_message: 'Failed to download document' })
        .eq('id', inboxItem.id)
      return
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Analyze invoice
    const extraction = await analyzeInvoice(base64, document.mime_type)

    // Supplier matching
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

    // Update inbox item with extracted data
    await supabase
      .from('invoice_inbox_items')
      .update({
        status: 'ready',
        extracted_data: extraction as unknown as Record<string, unknown>,
        confidence: extraction.confidence,
        matched_supplier_id: matchedSupplierId,
      })
      .eq('id', inboxItem.id)

    // Fetch updated item
    const { data: updatedItem } = await supabase
      .from('invoice_inbox_items')
      .select('*')
      .eq('id', inboxItem.id)
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

    console.log(`[invoice-inbox] Invoice ${inboxItem.id} processed (confidence: ${extraction.confidence})`)
  } catch (error) {
    console.error('[invoice-inbox] handleDocumentUploaded failed:', error)
  }
}

// ============================================================
// Extension Object
// ============================================================

export const invoiceInboxExtension: Extension = {
  id: 'invoice-inbox',
  name: 'Invoice Inbox',
  version: '1.0.0',
  eventHandlers: [
    { eventType: 'document.uploaded', handler: handleDocumentUploaded },
  ],
  settingsPanel: {
    label: 'Invoice Inbox',
    path: '/settings/extensions/invoice-inbox',
  },
  async onInstall(ctx) {
    await saveSettings(ctx.userId, DEFAULT_SETTINGS)
  },
}
