/**
 * Receipt Pipeline — shared, reusable receipt processing function.
 *
 * SERVER-ONLY: uses receipt-analyzer (Anthropic SDK).
 *
 * Extracts receipt data, categorizes line items, inserts records,
 * and attempts auto-matching against bank transactions.
 */

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Receipt, ReceiptExtractionResult } from '@/types'
import { analyzeReceipt } from './receipt-analyzer'
import { processLineItems, getDefaultClassification } from './receipt-categorizer'
import { autoMatchReceipts } from './receipt-matcher'
import { eventBus } from '@/lib/events/bus'

export interface ReceiptPipelineOptions {
  documentId: string | null
  source: 'upload' | 'camera' | 'email'
  emailFrom?: string
  storageUrl: string
  preExtracted?: ReceiptExtractionResult
}

export interface ProcessedReceipt {
  receipt: Receipt
  lineItems: unknown[]
  matchedTransaction?: { transactionId: string; confidence: number }
}

/**
 * Process a document through the receipt pipeline:
 * 1. Analyze with Claude Vision
 * 2. Categorize line items
 * 3. Insert receipt + line items
 * 4. Auto-match against unmatched transactions
 * 5. Emit receipt.extracted event
 */
export async function processReceiptFromDocument(
  supabase: SupabaseClient,
  userId: string,
  base64: string,
  mimeType: string,
  opts: ReceiptPipelineOptions
): Promise<ProcessedReceipt> {
  // 1. Use pre-extracted data if available, otherwise analyze with Claude Vision
  const validImageType = mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  const extraction = opts.preExtracted ?? await analyzeReceipt(base64, validImageType)

  // 2. Categorize line items and apply default business classification
  const processedLineItems = processLineItems(extraction.lineItems)
  const { defaultIsBusiness } = getDefaultClassification(
    extraction.flags.isRestaurant,
    extraction.flags.isSystembolaget
  )

  // 3. Insert receipt record
  const { data: receipt, error: insertError } = await supabase
    .from('receipts')
    .insert({
      user_id: userId,
      image_url: opts.storageUrl,
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
      document_id: opts.documentId,
      source: opts.source,
      email_from: opts.emailFrom ?? null,
    })
    .select()
    .single()

  if (insertError || !receipt) {
    throw new Error(`Failed to create receipt: ${insertError?.message}`)
  }

  // 4. Insert line items
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
          ? Math.round((item.lineTotal * item.vatRate) / (100 + item.vatRate) * 100) / 100
          : null,
      extraction_confidence: item.confidence,
      suggested_category: item.suggestedCategory,
      category: item.category,
      bas_account: item.basAccount,
      is_business: defaultIsBusiness,
      sort_order: index,
    }))

    await supabase.from('receipt_line_items').insert(lineItemsToInsert)
  }

  // 5. Auto-match against unmatched expense transactions (±7 days from receipt date)
  let matchedTransaction: ProcessedReceipt['matchedTransaction'] | undefined

  if (extraction.receipt.date && extraction.totals.total) {
    const receiptDate = new Date(extraction.receipt.date)
    const dateFrom = new Date(receiptDate)
    dateFrom.setDate(dateFrom.getDate() - 7)
    const dateTo = new Date(receiptDate)
    dateTo.setDate(dateTo.getDate() + 7)

    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .is('receipt_id', null)
      .lt('amount', 0)
      .gte('date', dateFrom.toISOString().split('T')[0])
      .lte('date', dateTo.toISOString().split('T')[0])

    if (transactions && transactions.length > 0) {
      const matches = autoMatchReceipts([receipt], transactions, 0.8)
      if (matches.length > 0) {
        const best = matches[0]
        matchedTransaction = {
          transactionId: best.match.transaction.id,
          confidence: best.match.confidence,
        }

        // Link receipt to transaction
        await supabase
          .from('receipts')
          .update({
            matched_transaction_id: best.match.transaction.id,
            match_confidence: best.match.confidence,
          })
          .eq('id', receipt.id)

        await supabase
          .from('transactions')
          .update({ receipt_id: receipt.id })
          .eq('id', best.match.transaction.id)
      }
    }
  }

  // 6. Emit event
  await eventBus.emit({
    type: 'receipt.extracted',
    payload: {
      receipt,
      documentId: opts.documentId,
      confidence: extraction.confidence,
      userId,
    },
  })

  return { receipt, lineItems: processedLineItems, matchedTransaction }
}
