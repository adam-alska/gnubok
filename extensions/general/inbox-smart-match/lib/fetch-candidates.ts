/**
 * Candidate transaction fetcher — deterministic narrowing before the LLM call.
 *
 * Pulls unbooked expense transactions within ±7 days of the document date,
 * ordered by how close their amount is to the document total. Limits to top 5
 * so the LLM has a focused candidate set and the token cost stays bounded.
 *
 * Works for both `ReceiptExtractionResult` and `InvoiceExtractionResult` — the
 * match anchors (date, amount, currency, counterparty name) are structurally
 * identical even if the field names differ.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvoiceExtractionResult, ReceiptExtractionResult } from '@/types'

const DATE_WINDOW_DAYS = 7
const MAX_CANDIDATES = 5

export interface CandidateTransaction {
  id: string
  date: string
  description: string
  amount: number
  amount_sek: number | null
  currency: string
  merchant_name: string | null
}

export type ExtractedDocument = ReceiptExtractionResult | InvoiceExtractionResult

export interface MatchAnchors {
  date: string
  amount: number
  currency: string
  counterpartyName: string | null
}

function isInvoiceExtraction(e: ExtractedDocument): e is InvoiceExtractionResult {
  return 'invoice' in e && typeof (e as InvoiceExtractionResult).invoice === 'object'
}

/**
 * Extract the reference date and absolute amount from a classified document's
 * extracted data. Returns null if required fields are missing.
 */
export function getMatchAnchors(extracted: ExtractedDocument | null): MatchAnchors | null {
  if (!extracted) return null

  let date: string | null
  let currency: string
  let counterpartyName: string | null

  if (isInvoiceExtraction(extracted)) {
    date = extracted.invoice?.invoiceDate ?? null
    currency = extracted.invoice?.currency ?? 'SEK'
    counterpartyName = extracted.supplier?.name ?? null
  } else {
    date = extracted.receipt?.date ?? null
    currency = extracted.receipt?.currency ?? 'SEK'
    counterpartyName = extracted.merchant?.name ?? null
  }

  const amount = extracted.totals?.total ?? null
  if (!date || amount == null || amount <= 0) return null
  return { date, amount, currency, counterpartyName }
}

/**
 * Fetch up to MAX_CANDIDATES unbooked expense transactions near the document's
 * date + amount. Ordering prefers exact amount matches first.
 */
export async function fetchCandidateTransactions(
  supabase: SupabaseClient,
  companyId: string,
  extracted: ExtractedDocument | null
): Promise<CandidateTransaction[]> {
  const anchors = getMatchAnchors(extracted)
  if (!anchors) return []

  const anchorDate = new Date(anchors.date)
  if (isNaN(anchorDate.getTime())) return []

  const windowStart = new Date(anchorDate)
  windowStart.setUTCDate(windowStart.getUTCDate() - DATE_WINDOW_DAYS)
  const windowEnd = new Date(anchorDate)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + DATE_WINDOW_DAYS)

  // Exclude transactions already claimed by any other inbox item in this
  // company. The partial unique index on (company_id, matched_transaction_id)
  // is the final guard against concurrent double-matches, but filtering up
  // front saves an LLM roundtrip on the obvious cases.
  const { data: claimed, error: claimedError } = await supabase
    .from('invoice_inbox_items')
    .select('matched_transaction_id')
    .eq('company_id', companyId)
    .not('matched_transaction_id', 'is', null)

  if (claimedError) {
    throw new Error(`Failed to load matched transactions: ${claimedError.message}`)
  }

  const excludedIds = new Set(
    (claimed ?? [])
      .map((row) => (row as { matched_transaction_id: string | null }).matched_transaction_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  )

  // Pull negative-amount (expense) transactions without a journal entry in the window
  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, description, amount, amount_sek, currency, merchant_name')
    .eq('company_id', companyId)
    .is('journal_entry_id', null)
    .lt('amount', 0)
    .gte('date', windowStart.toISOString().slice(0, 10))
    .lte('date', windowEnd.toISOString().slice(0, 10))
    .order('date', { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(`Failed to fetch candidate transactions: ${error.message}`)
  }
  if (!data || data.length === 0) return []

  const filtered = excludedIds.size > 0
    ? data.filter((tx) => !excludedIds.has(tx.id as string))
    : data
  if (filtered.length === 0) return []

  // Rank candidates by amount proximity. For SEK documents we compare directly,
  // for other currencies we prefer amount_sek if the document amount has been converted.
  const anchorAbs = Math.abs(anchors.amount)
  const scored = filtered.map((tx) => {
    const txAmount = Math.abs(Number(tx.amount) || 0)
    const txSek = tx.amount_sek == null ? null : Math.abs(Number(tx.amount_sek))
    const primaryDiff = Math.abs(txAmount - anchorAbs)
    const sekDiff = txSek == null ? Infinity : Math.abs(txSek - anchorAbs)
    const bestDiff = Math.min(primaryDiff, sekDiff)
    return { tx, diff: bestDiff }
  })

  scored.sort((a, b) => a.diff - b.diff)

  return scored.slice(0, MAX_CANDIDATES).map(({ tx }) => ({
    id: tx.id,
    date: tx.date,
    description: tx.description ?? '',
    amount: Number(tx.amount),
    amount_sek: tx.amount_sek == null ? null : Number(tx.amount_sek),
    currency: tx.currency ?? 'SEK',
    merchant_name: tx.merchant_name ?? null,
  }))
}
