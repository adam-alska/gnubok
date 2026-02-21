import type { SupabaseClient } from '@supabase/supabase-js'
import { evaluateMappingRules } from '@/lib/bookkeeping/mapping-engine'
import { createTransactionJournalEntry } from '@/lib/bookkeeping/transaction-entries'
import { getBestInvoiceMatch } from '@/lib/invoice/invoice-matching'
import { tryReconcileTransaction, fetchUnlinkedGLLines } from '@/lib/reconciliation/bank-reconciliation'
import type { UnlinkedGLLine } from '@/lib/reconciliation/bank-reconciliation'
import type { Transaction } from '@/types'

/**
 * Normalized transaction input for the generic ingestion pipeline.
 * Both file import and PSD2 sync convert to this format before ingesting.
 */
export interface RawTransaction {
  date: string
  description: string
  amount: number
  currency: string
  external_id: string // dedup key
  mcc_code?: number | null
  merchant_name?: string | null
  reference?: string | null // OCR number, Bankgiro ref, etc.
  bank_connection_id?: string | null
  import_source?: string // 'csv_nordea', 'camt053', 'enable_banking', etc.
}

export interface IngestResult {
  imported: number
  duplicates: number
  reconciled: number
  auto_categorized: number
  auto_matched_invoices: number
  errors: number
  transaction_ids: string[]
}

/**
 * Generic transaction ingestion pipeline.
 *
 * Handles:
 * 1. Deduplication via external_id
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

  // Pre-fetch unlinked GL lines for reconciliation (non-critical)
  let glLinePool: UnlinkedGLLine[] = []
  try {
    glLinePool = await fetchUnlinkedGLLines(supabase, userId)
  } catch {
    // Non-critical — reconciliation will be skipped
  }

  for (const raw of rawTransactions) {
    // 1. Check for duplicates via external_id
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('external_id', raw.external_id)
      .single()

    if (existing) {
      result.duplicates++
      continue
    }

    // 2. Insert new transaction
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

    // 4. Evaluate mapping rules for auto-categorization
    try {
      const mappingResult = await evaluateMappingRules(
        userId,
        newTransaction as Transaction
      )

      if (mappingResult.confidence >= 0.8 && !mappingResult.requires_review) {
        const journalEntry = await createTransactionJournalEntry(
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
