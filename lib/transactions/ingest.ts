import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateMappingRules } from '@/lib/bookkeeping/mapping-engine'
import { createTransactionJournalEntry } from '@/lib/bookkeeping/transaction-entries'
import { getBestInvoiceMatch } from '@/lib/invoices/invoice-matching'
import { findSupplierInvoiceMatch } from '@/lib/invoices/supplier-invoice-matching'
import { tryReconcileTransaction, fetchUnlinkedGLLines } from '@/lib/reconciliation/bank-reconciliation'
import { fetchMultipleRates } from '@/lib/currency/riksbanken'
import type { UnlinkedGLLine } from '@/lib/reconciliation/bank-reconciliation'
import type { Transaction, RawTransaction, IngestResult, SupplierInvoice, Currency, ExchangeRate } from '@/types'

// Re-export types for backward compatibility
export type { RawTransaction, IngestResult } from '@/types'

/**
 * Build a lookup map of already-booked transactions keyed by "date|amount".
 * Each key maps to the number of booked transactions with that date+amount
 * combination, allowing correct dedup when multiple transactions share
 * the same date and amount.
 */
async function buildBookedTransactionMap(
  supabase: SupabaseClient,
  userId: string,
  rawTransactions: RawTransaction[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (rawTransactions.length === 0) return map

  const dates = rawTransactions.map((t) => t.date).sort()
  const dateFrom = dates[0]
  const dateTo = dates[dates.length - 1]

  try {
    const { data: booked } = await supabase
      .from('transactions')
      .select('date, amount')
      .eq('user_id', userId)
      .not('journal_entry_id', 'is', null)
      .gte('date', dateFrom)
      .lte('date', dateTo)

    if (booked) {
      for (const tx of booked) {
        const key = `${tx.date}|${tx.amount}`
        map.set(key, (map.get(key) || 0) + 1)
      }
    }
  } catch {
    // Non-critical — content-based dedup will be skipped
  }

  return map
}

/**
 * Generic transaction ingestion pipeline.
 *
 * Handles:
 * 1. Deduplication via external_id
 * 1b. Content-based dedup via date+amount against already-booked transactions
 *     (catches cross-source duplicates, e.g. CSV import then PSD2 sync)
 * 2. Insert into transactions table
 * 3. OCR/reference-based invoice matching (highest confidence)
 * 4. Amount+customer fallback invoice matching
 * 5. Mapping rule evaluation for auto-categorization
 * 6. Auto-journal-entry creation for high-confidence matches
 *
 * Used by both bank file import and Enable Banking PSD2 sync.
 */
export async function ingestTransactions(
  supabase: SupabaseClient,
  userId: string,
  rawTransactions: RawTransaction[]
): Promise<IngestResult> {
  const result: IngestResult = {
    imported: 0,
    duplicates: 0,
    reconciled: 0,
    auto_categorized: 0,
    auto_matched_invoices: 0,
    errors: 0,
    transaction_ids: [],
  }

  // Pre-fetch booked transactions for content-based dedup (date+amount)
  // This catches cross-source duplicates (e.g. same transaction imported
  // via CSV and then again via PSD2 with different external_id)
  const bookedMap = await buildBookedTransactionMap(supabase, userId, rawTransactions)

  // Pre-fetch unlinked GL lines for reconciliation (non-critical)
  let glLinePool: UnlinkedGLLine[] = []
  try {
    glLinePool = await fetchUnlinkedGLLines(supabase, userId)
  } catch {
    // Non-critical — reconciliation will be skipped
  }

  // Pre-fetch unpaid supplier invoices for expense matching (non-critical)
  let unpaidSupplierInvoices: SupplierInvoice[] = []
  try {
    const { data } = await supabase
      .from('supplier_invoices')
      .select('*, supplier:suppliers(*)')
      .eq('user_id', userId)
      .in('status', ['registered', 'approved'])
      .gt('remaining_amount', 0)

    if (data) unpaidSupplierInvoices = data as SupplierInvoice[]
  } catch {
    // Non-critical — supplier invoice matching will be skipped
  }

  // Pre-fetch exchange rates for non-SEK currencies (non-critical)
  let exchangeRates = new Map<Currency, ExchangeRate>()
  try {
    const uniqueCurrencies = [...new Set(
      rawTransactions
        .map(t => t.currency)
        .filter((c): c is Currency => c != null && c !== 'SEK')
    )]
    if (uniqueCurrencies.length > 0) {
      exchangeRates = await fetchMultipleRates(uniqueCurrencies)
    }
  } catch {
    // Non-critical — amount_sek fields will stay null
  }

  // Pre-fetch existing external_ids in batches for dedup (avoids N+1 queries)
  const existingExternalIds = new Set<string>()
  const externalIds = rawTransactions.map(t => t.external_id)
  for (let i = 0; i < externalIds.length; i += 500) {
    const chunk = externalIds.slice(i, i + 500)
    const { data } = await supabase
      .from('transactions')
      .select('external_id')
      .eq('user_id', userId)
      .in('external_id', chunk)
    data?.forEach(r => existingExternalIds.add(r.external_id))
  }

  for (const raw of rawTransactions) {
    // 1. Check for duplicates via external_id (batch pre-fetched)
    if (existingExternalIds.has(raw.external_id)) {
      result.duplicates++
      continue
    }

    // 1b. Content-based dedup: skip if an already-booked transaction
    // exists with the same date and amount (cross-source duplicate)
    const contentKey = `${raw.date}|${raw.amount}`
    const bookedCount = bookedMap.get(contentKey) || 0
    if (bookedCount > 0) {
      bookedMap.set(contentKey, bookedCount - 1)
      result.duplicates++
      continue
    }

    // 2. Insert new transaction (with SEK conversion for foreign currencies)
    const rateInfo = raw.currency && raw.currency !== 'SEK'
      ? exchangeRates.get(raw.currency as Currency)
      : undefined
    const amountSek = rateInfo
      ? Math.round(raw.amount * rateInfo.rate * 100) / 100
      : null

    const { data: newTransaction, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        bank_connection_id: raw.bank_connection_id || null,
        external_id: raw.external_id,
        date: raw.date,
        description: raw.description,
        amount: raw.amount,
        currency: raw.currency,
        amount_sek: amountSek,
        exchange_rate: rateInfo?.rate ?? null,
        exchange_rate_date: rateInfo?.date ?? null,
        category: 'uncategorized',
        is_business: null,
        mcc_code: raw.mcc_code || null,
        merchant_name: raw.merchant_name || null,
        reference: raw.reference || null,
        import_source: raw.import_source || null,
      })
      .select()
      .single()

    if (insertError || !newTransaction) {
      result.errors++
      continue
    }

    result.imported++
    result.transaction_ids.push(newTransaction.id)

    // 2.5. Try reconciliation against pre-fetched unlinked GL lines
    if (glLinePool.length > 0) {
      try {
        const match = tryReconcileTransaction(newTransaction as Transaction, glLinePool)
        if (match) {
          await supabase
            .from('transactions')
            .update({
              journal_entry_id: match.glLine.journal_entry_id,
              reconciliation_method: match.method,
              is_business: true,
            })
            .eq('id', newTransaction.id)

          // Remove matched GL line from pool to prevent double-matching
          glLinePool = glLinePool.filter((l) => l.line_id !== match.glLine.line_id)
          result.reconciled++
          continue // Skip invoice matching and auto-categorization
        }
      } catch {
        // Non-critical — fall through to normal flow
      }
    }

    // 3. For income transactions, try invoice matching
    if (newTransaction.amount > 0) {
      try {
        // OCR/reference matching is handled inside getBestInvoiceMatch
        // (which calls findMatchingInvoices, which now checks references)
        const bestMatch = await getBestInvoiceMatch(
          supabase,
          userId,
          newTransaction as Transaction,
          0.50
        )

        if (bestMatch) {
          await supabase
            .from('transactions')
            .update({ potential_invoice_id: bestMatch.invoice.id })
            .eq('id', newTransaction.id)

          result.auto_matched_invoices++
        }
      } catch {
        // Non-critical — continue processing
      }
    }

    // 3b. For expense transactions, try supplier invoice matching
    if (newTransaction.amount < 0 && unpaidSupplierInvoices.length > 0) {
      try {
        const match = findSupplierInvoiceMatch(
          newTransaction as Transaction,
          unpaidSupplierInvoices
        )

        if (match) {
          if (match.confidence >= 0.85) {
            // Auto-link at high confidence
            await supabase
              .from('transactions')
              .update({ supplier_invoice_id: match.supplierInvoice.id })
              .eq('id', newTransaction.id)

            result.auto_matched_invoices++
          } else {
            // Store as suggestion at lower confidence (0.70–0.85)
            await supabase
              .from('transactions')
              .update({ potential_supplier_invoice_id: match.supplierInvoice.id })
              .eq('id', newTransaction.id)
          }
        }
      } catch {
        // Non-critical — continue processing
      }
    }

    // 4. Evaluate mapping rules for auto-categorization
    try {
      const mappingResult = await evaluateMappingRules(
        supabase,
        userId,
        newTransaction as Transaction
      )

      if (mappingResult.confidence >= 0.8 && !mappingResult.requires_review) {
        const journalEntry = await createTransactionJournalEntry(
          supabase,
          userId,
          newTransaction as Transaction,
          mappingResult
        )

        if (journalEntry) {
          await supabase
            .from('transactions')
            .update({
              journal_entry_id: journalEntry.id,
              is_business: !mappingResult.default_private,
            })
            .eq('id', newTransaction.id)

          result.auto_categorized++
        }
      }
    } catch {
      // Non-critical — continue processing
    }
  }

  return result
}
