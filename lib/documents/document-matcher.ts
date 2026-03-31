/**
 * Document-to-Transaction Matcher
 *
 * Pure matching logic that works from extracted data already stored on inbox items.
 * Zero AI or extension dependencies — works entirely from structured data.
 *
 * Matching passes by document type:
 *
 * Supplier invoices:
 *   1. Payment reference exact match → 0.98
 *   2. Exact amount + bankgiro → 0.92
 *   3. Exact amount + date ±5 days → 0.85
 *   4. Fuzzy amount + supplier name → 0.70
 *
 * Receipts:
 *   Weighted scoring (amount 40%, date 25%, merchant 35%), min confidence 0.60
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvoiceInboxItem, Transaction, InvoiceExtractionResult, ReceiptExtractionResult } from '@/types'
import {
  calculateMerchantSimilarity,
  calculateMatchConfidence,
} from './core-receipt-matcher'

export type DocumentMatchMethod =
  | 'payment_reference'
  | 'amount_date'
  | 'amount_merchant'
  | 'receipt_match'

export interface DocumentMatchResult {
  transactionId: string
  confidence: number
  method: DocumentMatchMethod
  matchReasons: string[]
}

/**
 * Match a single inbox item to the best candidate transaction.
 *
 * If `candidateTransactions` is not provided, fetches unbooked expense
 * transactions within ±7 days of the document date.
 */
export async function matchDocumentToTransactions(
  supabase: SupabaseClient,
  companyId: string,
  inboxItem: InvoiceInboxItem,
  candidateTransactions?: Transaction[]
): Promise<DocumentMatchResult | null> {
  const tag = `[document-matcher] item=${inboxItem.id} type=${inboxItem.document_type}`

  // Only match supplier invoices and receipts
  if (inboxItem.document_type === 'government_letter' || inboxItem.document_type === 'unknown') {
    console.log(`${tag} — skipped (unsupported document type)`)
    return null
  }

  if (!inboxItem.extracted_data) {
    console.log(`${tag} — skipped (no extracted_data)`)
    return null
  }

  const transactions = candidateTransactions ?? (await fetchCandidateTransactions(supabase, companyId, inboxItem))

  console.log(`${tag} — ${transactions.length} candidate transactions`)

  if (transactions.length === 0) {
    console.log(`${tag} — no candidates, aborting`)
    return null
  }

  let result: DocumentMatchResult | null = null

  if (inboxItem.document_type === 'supplier_invoice') {
    result = matchSupplierInvoiceDocument(inboxItem, transactions)
  } else if (inboxItem.document_type === 'receipt') {
    result = matchReceiptDocument(inboxItem, transactions)
  }

  if (result) {
    console.log(`${tag} — MATCHED tx=${result.transactionId} confidence=${result.confidence} method=${result.method} reasons=[${result.matchReasons.join(', ')}]`)
  } else {
    console.log(`${tag} — no match found`)
  }

  return result
}

/**
 * Fetch unbooked expense transactions within ±7 days of the document date.
 */
async function fetchCandidateTransactions(
  supabase: SupabaseClient,
  companyId: string,
  inboxItem: InvoiceInboxItem
): Promise<Transaction[]> {
  const docDate = getDocumentDate(inboxItem)
  if (!docDate) return []

  const startDate = new Date(docDate)
  startDate.setDate(startDate.getDate() - 7)
  const endDate = new Date(docDate)
  endDate.setDate(endDate.getDate() + 7)

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('company_id', companyId)
    .is('journal_entry_id', null)
    .is('is_business', null)
    .lt('amount', 0)
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (error || !data) return []
  return data as Transaction[]
}

/**
 * Extract the most relevant date from an inbox item's extracted data.
 */
function getDocumentDate(inboxItem: InvoiceInboxItem): string | null {
  const data = inboxItem.extracted_data as Record<string, unknown> | null
  if (!data) return null

  if (inboxItem.document_type === 'supplier_invoice') {
    const extraction = data as unknown as InvoiceExtractionResult
    return extraction.invoice?.dueDate ?? extraction.invoice?.invoiceDate ?? null
  }

  if (inboxItem.document_type === 'receipt') {
    const extraction = data as unknown as ReceiptExtractionResult
    return extraction.receipt?.date ?? null
  }

  return null
}

/**
 * Match a supplier invoice inbox item to transactions using a 4-pass algorithm.
 */
function matchSupplierInvoiceDocument(
  inboxItem: InvoiceInboxItem,
  transactions: Transaction[]
): DocumentMatchResult | null {
  const tag = `[document-matcher:supplier] item=${inboxItem.id}`
  const extraction = inboxItem.extracted_data as unknown as InvoiceExtractionResult
  if (!extraction) return null

  const invoiceTotal = extraction.totals?.total
  if (invoiceTotal == null || invoiceTotal === 0) {
    console.log(`${tag} — no invoice total in extracted data`)
    return null
  }

  const paymentRef = extraction.invoice?.paymentReference
  const bankgiro = extraction.supplier?.bankgiro
  const plusgiro = extraction.supplier?.plusgiro
  const supplierName = extraction.supplier?.name
  const dueDate = extraction.invoice?.dueDate ?? extraction.invoice?.invoiceDate

  console.log(`${tag} — extracted: total=${invoiceTotal}, supplier=${supplierName || '?'}, dueDate=${dueDate || '?'}, paymentRef=${paymentRef || '?'}, bankgiro=${bankgiro || '?'}, templateId=${extraction.suggestedTemplateId || '?'}`)

  let bestMatch: DocumentMatchResult | null = null

  for (const tx of transactions) {
    const txAmount = Math.abs(tx.amount)
    const txDesc = (tx.description || '').toLowerCase()
    const txRef = tx.reference || ''

    // Pass 1: Payment reference exact match → 0.98
    if (paymentRef && txRef) {
      const normTxRef = txRef.replace(/\D/g, '')
      const normPayRef = paymentRef.replace(/\D/g, '')
      if (normTxRef && normPayRef && normTxRef === normPayRef) {
        console.log(`${tag} — Pass 1 HIT: tx=${tx.id} ref=${normPayRef}`)
        return {
          transactionId: tx.id,
          confidence: 0.98,
          method: 'payment_reference',
          matchReasons: ['Betalningsreferens matchar'],
        }
      }
    }

    // Pass 2: Exact amount + bankgiro/plusgiro → 0.92
    const amountMatch = Math.abs(txAmount - invoiceTotal) < 0.005
    if (amountMatch) {
      const bgNorm = bankgiro?.replace(/\D/g, '')
      const pgNorm = plusgiro?.replace(/\D/g, '')
      const hasBgMatch = bgNorm && txDesc.includes(bgNorm)
      const hasPgMatch = pgNorm && txDesc.includes(pgNorm)

      if (hasBgMatch || hasPgMatch) {
        console.log(`${tag} — Pass 2 HIT: tx=${tx.id} amount=${txAmount} bg/pg match`)
        return {
          transactionId: tx.id,
          confidence: 0.92,
          method: 'payment_reference',
          matchReasons: ['Exakt belopp', hasBgMatch ? 'Bankgiro matchar' : 'Plusgiro matchar'],
        }
      }
    }

    // Pass 3: Exact amount + date ±14 days → 0.85 (close) / 0.75 (wider)
    // Invoices are often paid early or a few days late, so we use a 14-day window.
    if (amountMatch && dueDate) {
      const txDate = new Date(tx.date)
      const docDate = new Date(dueDate)
      const diffDays = Math.abs((txDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24))

      if (diffDays <= 14) {
        // Higher confidence for close dates, lower for wider window
        const confidence = diffDays <= 5 ? 0.85 : 0.75
        console.log(`${tag} — Pass 3 HIT: tx=${tx.id} amount=${txAmount} date_diff=${diffDays.toFixed(1)}d → confidence=${confidence}`)
        const candidate: DocumentMatchResult = {
          transactionId: tx.id,
          confidence,
          method: 'amount_date',
          matchReasons: ['Exakt belopp', diffDays === 0 ? 'Exakt datum' : `Datum ±${Math.round(diffDays)} dagar`],
        }
        if (!bestMatch || candidate.confidence > bestMatch.confidence) {
          bestMatch = candidate
        }
      }
    }

    // Pass 4: Fuzzy amount (±1%) + supplier name in description → 0.70
    const fuzzyAmountMatch = Math.abs(txAmount - invoiceTotal) / invoiceTotal <= 0.01
    if (fuzzyAmountMatch && supplierName) {
      const normalizedName = supplierName.toLowerCase().replace(/[^\w\såäöé]/g, '')
      const nameWords = normalizedName.split(/\s+/).filter((w) => w.length >= 3)
      const nameInDesc = nameWords.some((word) => txDesc.includes(word))

      if (nameInDesc) {
        console.log(`${tag} — Pass 4 HIT: tx=${tx.id} amount=${txAmount} (~${((Math.abs(txAmount - invoiceTotal) / invoiceTotal) * 100).toFixed(1)}%) name words=[${nameWords.join(',')}]`)
        const candidate: DocumentMatchResult = {
          transactionId: tx.id,
          confidence: 0.70,
          method: 'amount_merchant',
          matchReasons: ['Belopp matchar (±1%)', 'Leverantörsnamn i beskrivning'],
        }
        if (!bestMatch || candidate.confidence > bestMatch.confidence) {
          bestMatch = candidate
        }
      }
    }
  }

  return bestMatch
}

/**
 * Match a receipt inbox item to transactions using weighted scoring.
 * Weights: amount 40%, date 25%, merchant 35%. Min confidence: 0.60.
 */
function matchReceiptDocument(
  inboxItem: InvoiceInboxItem,
  transactions: Transaction[]
): DocumentMatchResult | null {
  const tag = `[document-matcher:receipt] item=${inboxItem.id}`
  const extraction = inboxItem.extracted_data as unknown as ReceiptExtractionResult
  if (!extraction) return null

  const receiptTotal = extraction.totals?.total
  const receiptDate = extraction.receipt?.date
  const merchantName = extraction.merchant?.name

  if (receiptTotal == null || receiptTotal === 0) {
    console.log(`${tag} — no receipt total in extracted data`)
    return null
  }

  console.log(`${tag} — extracted: total=${receiptTotal}, date=${receiptDate || '?'}, merchant=${merchantName || '?'}, templateId=${extraction.suggestedTemplateId || '?'}`)

  let bestMatch: DocumentMatchResult | null = null

  for (const tx of transactions) {
    if (tx.receipt_id) continue // Skip already matched

    const txAmount = Math.abs(tx.amount)
    const txDate = new Date(tx.date)

    // Calculate date variance
    const dateVariance = receiptDate
      ? Math.abs((new Date(receiptDate).getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24))
      : 3 // Default to tolerance boundary if no date

    if (dateVariance > 3) continue

    // Calculate amount variance
    const amountVariance = Math.abs(receiptTotal - txAmount) / receiptTotal
    if (amountVariance > 0.05) continue // Skip if >5% off

    // Calculate merchant similarity
    const txMerchant = tx.merchant_name || tx.description || ''
    const merchantSimilarity = merchantName
      ? calculateMerchantSimilarity(merchantName, txMerchant)
      : 0

    const { confidence, matchReasons } = calculateMatchConfidence(
      dateVariance,
      amountVariance,
      merchantSimilarity
    )

    console.log(`${tag} — scoring tx=${tx.id} "${tx.description}": date_var=${dateVariance.toFixed(1)}d amount_var=${(amountVariance * 100).toFixed(1)}% merchant_sim=${merchantSimilarity.toFixed(2)} → confidence=${confidence}`)

    if (confidence >= 0.60 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = {
        transactionId: tx.id,
        confidence,
        method: 'receipt_match',
        matchReasons,
      }
    }
  }

  return bestMatch
}
