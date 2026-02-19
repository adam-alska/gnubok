import { createClient } from '@/lib/supabase/server'
import { eventBus } from '@/lib/events/bus'
import { analyzeReceipt } from '@/lib/receipts/receipt-analyzer'
import { processLineItems } from '@/lib/receipts/receipt-categorizer'
import { autoMatchReceipts } from '@/lib/receipts/receipt-matcher'
import type { Extension } from '@/lib/extensions/types'
import type { EventPayload } from '@/lib/events/types'
import type { Receipt, Transaction } from '@/types'

// ============================================================
// Settings
// ============================================================

export interface ReceiptOcrSettings {
  autoOcrEnabled: boolean
  autoMatchEnabled: boolean
  autoMatchThreshold: number
  ocrConfidenceThreshold: number
}

const DEFAULT_SETTINGS: ReceiptOcrSettings = {
  autoOcrEnabled: true,
  autoMatchEnabled: true,
  autoMatchThreshold: 0.8,
  ocrConfidenceThreshold: 0.6,
}

export async function getSettings(userId: string): Promise<ReceiptOcrSettings> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('extension_data')
    .select('value')
    .eq('user_id', userId)
    .eq('extension_id', 'receipt-ocr')
    .eq('key', 'settings')
    .single()

  if (!data?.value) return { ...DEFAULT_SETTINGS }

  // Merge with defaults for forward-compatibility
  return { ...DEFAULT_SETTINGS, ...(data.value as Partial<ReceiptOcrSettings>) }
}

export async function saveSettings(
  userId: string,
  partial: Partial<ReceiptOcrSettings>
): Promise<ReceiptOcrSettings> {
  const current = await getSettings(userId)
  const merged = { ...current, ...partial }

  const supabase = await createClient()

  await supabase
    .from('extension_data')
    .upsert(
      {
        user_id: userId,
        extension_id: 'receipt-ocr',
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

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/**
 * When an image is uploaded via the document archive, auto-trigger OCR.
 */
async function handleDocumentUploaded(
  payload: EventPayload<'document.uploaded'>
): Promise<void> {
  const { document, userId } = payload

  // Gate: Is it an image?
  if (!document.mime_type || !IMAGE_MIME_TYPES.includes(document.mime_type)) {
    return
  }

  // Gate: Is autoOcrEnabled?
  const settings = await getSettings(userId)
  if (!settings.autoOcrEnabled) {
    return
  }

  console.log(`[receipt-ocr] Auto-OCR triggered for document ${document.id}`)

  try {
    const supabase = await createClient()

    // Download image from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.storage_path)

    if (downloadError || !fileData) {
      console.error('[receipt-ocr] Failed to download document:', downloadError)
      return
    }

    // Convert to base64
    const arrayBuffer = await fileData.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = document.mime_type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

    // Analyze receipt
    const extraction = await analyzeReceipt(base64, mimeType)

    // Gate: Is confidence high enough?
    if (extraction.confidence < settings.ocrConfidenceThreshold) {
      console.log(
        `[receipt-ocr] Confidence ${extraction.confidence} below threshold ${settings.ocrConfidenceThreshold}, skipping`
      )
      return
    }

    // Process line items
    const processedLineItems = processLineItems(extraction.lineItems)

    // Get public URL for the document
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(document.storage_path)

    // Create receipt record
    const { data: receipt, error: insertError } = await supabase
      .from('receipts')
      .insert({
        user_id: userId,
        image_url: urlData.publicUrl,
        status: 'extracted',
        extraction_confidence: extraction.confidence,
        merchant_name: extraction.merchant.name,
        merchant_org_number: extraction.merchant.orgNumber,
        merchant_vat_number: extraction.merchant.vatNumber,
        receipt_date: extraction.receipt.date,
        receipt_time: extraction.receipt.time,
        total_amount: extraction.totals.total,
        currency: extraction.receipt.currency,
        vat_amount: extraction.totals.vatAmount,
        is_restaurant: extraction.flags.isRestaurant,
        is_systembolaget: extraction.flags.isSystembolaget,
        is_foreign_merchant: extraction.flags.isForeignMerchant,
        raw_extraction: extraction,
      })
      .select()
      .single()

    if (insertError || !receipt) {
      console.error('[receipt-ocr] Failed to create receipt:', insertError)
      return
    }

    // Insert line items
    if (processedLineItems.length > 0) {
      const lineItemsToInsert = processedLineItems.map((item, index) => ({
        receipt_id: receipt.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
        vat_rate: item.vatRate,
        vat_amount:
          item.vatRate && item.lineTotal
            ? (item.lineTotal * item.vatRate) / (100 + item.vatRate)
            : null,
        extraction_confidence: item.confidence,
        suggested_category: item.suggestedCategory,
        sort_order: index,
      }))

      await supabase.from('receipt_line_items').insert(lineItemsToInsert)
    }

    // Fetch complete receipt with line items
    const { data: completeReceipt } = await supabase
      .from('receipts')
      .select('*, line_items:receipt_line_items(*)')
      .eq('id', receipt.id)
      .single()

    // Emit receipt.extracted
    await eventBus.emit({
      type: 'receipt.extracted',
      payload: {
        receipt: (completeReceipt || receipt) as unknown as Receipt,
        documentId: document.id,
        confidence: extraction.confidence,
        userId,
      },
    })

    console.log(`[receipt-ocr] Receipt ${receipt.id} created from document ${document.id}`)
  } catch (error) {
    console.error('[receipt-ocr] handleDocumentUploaded failed:', error)
  }
}

/**
 * When new transactions arrive from banking sync, auto-match unmatched receipts.
 */
async function handleTransactionSynced(
  payload: EventPayload<'transaction.synced'>
): Promise<void> {
  const { transactions: syncedTransactions, userId } = payload

  // Gate: Is autoMatchEnabled?
  const settings = await getSettings(userId)
  if (!settings.autoMatchEnabled) {
    return
  }

  // Only consider expense transactions
  const expenseTransactions = syncedTransactions.filter((t) => t.amount < 0)
  if (expenseTransactions.length === 0) {
    return
  }

  console.log(
    `[receipt-ocr] Auto-match triggered for ${expenseTransactions.length} expense transactions`
  )

  try {
    const supabase = await createClient()

    // Fetch unmatched receipts
    const { data: unmatchedReceipts, error: fetchError } = await supabase
      .from('receipts')
      .select('*, line_items:receipt_line_items(*)')
      .eq('user_id', userId)
      .in('status', ['extracted', 'confirmed'])
      .is('matched_transaction_id', null)

    if (fetchError || !unmatchedReceipts || unmatchedReceipts.length === 0) {
      return
    }

    // Run auto-matching
    const matches = autoMatchReceipts(
      unmatchedReceipts as unknown as Receipt[],
      expenseTransactions,
      settings.autoMatchThreshold
    )

    // Process each match
    for (const { receipt, match } of matches) {
      // Update receipt with match
      await supabase
        .from('receipts')
        .update({
          matched_transaction_id: match.transaction.id,
          match_confidence: match.confidence,
        })
        .eq('id', receipt.id)

      // Update transaction with receipt link
      await supabase
        .from('transactions')
        .update({ receipt_id: receipt.id })
        .eq('id', match.transaction.id)

      // Emit receipt.matched
      await eventBus.emit({
        type: 'receipt.matched',
        payload: {
          receipt,
          transaction: match.transaction,
          confidence: match.confidence,
          autoMatched: true,
          userId,
        },
      })

      console.log(
        `[receipt-ocr] Auto-matched receipt ${receipt.id} to transaction ${match.transaction.id} (confidence: ${match.confidence})`
      )
    }
  } catch (error) {
    console.error('[receipt-ocr] handleTransactionSynced failed:', error)
  }
}

// ============================================================
// Extension Object
// ============================================================

export const receiptOcrExtension: Extension = {
  id: 'receipt-ocr',
  name: 'Receipt OCR',
  version: '1.0.0',
  eventHandlers: [
    { eventType: 'document.uploaded', handler: handleDocumentUploaded },
    { eventType: 'transaction.synced', handler: handleTransactionSynced },
  ],
  mappingRuleTypes: [
    {
      id: 'receipt-ocr-merchant',
      name: 'OCR Merchant Match',
      description: 'Auto-categorize transactions based on OCR-extracted merchant names',
    },
    {
      id: 'receipt-ocr-category',
      name: 'OCR Category Suggestion',
      description: 'Suggest transaction categories from receipt line item analysis',
    },
  ],
  settingsPanel: {
    label: 'Receipt OCR',
    path: '/settings/extensions/receipt-ocr',
  },
  async onInstall(ctx) {
    await saveSettings(ctx.userId, DEFAULT_SETTINGS)
  },
}
