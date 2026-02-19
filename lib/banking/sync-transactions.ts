import { SupabaseClient } from '@supabase/supabase-js'
import { getTransactions, getAccountBalance } from '@/lib/banking/enable-banking'
import { fetchMappingRules, evaluateMappingRulesWithCache } from '@/lib/bookkeeping/mapping-engine'
import { createTransactionJournalEntry } from '@/lib/bookkeeping/transaction-entries'
import { getBestInvoiceMatch } from '@/lib/invoice/invoice-matching'
import type { Transaction } from '@/types'

interface StoredAccount {
  uid: string
  iban?: string
  name?: string
  currency: string
  balance?: number
}

export interface SyncResult {
  imported: number
  duplicates: number
  errors: number
}

/**
 * Sync transactions for a single bank account
 * Shared logic used by both manual sync and cron job
 */
export async function syncAccountTransactions(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  account: StoredAccount,
  fromDate: string,
  toDate: string
): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, duplicates: 0, errors: 0 }

  const bankTransactions = await getTransactions(
    account.uid,
    fromDate,
    toDate,
    account.currency
  )

  // Fetch mapping rules once before the loop to avoid N+1 queries
  const mappingRules = await fetchMappingRules(userId)

  for (const tx of bankTransactions) {
    const externalId = `${connectionId}_${tx.id}`

    // Check for duplicates
    const { data: existing } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('external_id', externalId)
      .single()

    if (existing) {
      result.duplicates++
      continue
    }

    // Insert new transaction
    const { data: newTransaction, error: insertError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        bank_connection_id: connectionId,
        external_id: externalId,
        date: tx.booking_date || tx.date,
        description: tx.description || tx.counterparty_name || 'Unknown',
        amount: tx.amount,
        currency: tx.currency || account.currency,
        category: 'uncategorized',
        is_business: null,
        mcc_code: tx.merchant_category_code || null,
        merchant_name: tx.counterparty_name || null,
      })
      .select()
      .single()

    if (insertError || !newTransaction) {
      result.errors++
      continue
    }

    result.imported++

    // For income transactions, try to find matching invoices
    if (newTransaction.amount > 0) {
      try {
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
        }
      } catch {
        // Non-critical
      }
    }

    // Evaluate mapping rules for auto-categorization (using pre-fetched rules)
    try {
      const mappingResult = evaluateMappingRulesWithCache(
        mappingRules,
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
        }
      }
    } catch {
      // Non-critical
    }
  }

  // Update account balance
  try {
    const balance = await getAccountBalance(account.uid)
    account.balance = balance.amount
  } catch {
    // Ignore balance fetch errors
  }

  return result
}
