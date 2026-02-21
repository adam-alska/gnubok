import { SupabaseClient } from '@supabase/supabase-js'
import { getTransactions, getAccountBalance } from './api-client'
import { ingestTransactions, type RawTransaction } from '@/lib/transactions/ingest'
import type { StoredAccount } from '../types'

export interface SyncResult {
  imported: number
  duplicates: number
  errors: number
}

/**
 * Sync transactions for a single bank account via Enable Banking PSD2.
 *
 * Fetches transactions from the Enable Banking API, converts to RawTransaction
 * format, and delegates to the shared ingestion pipeline.
 */
export async function syncAccountTransactions(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  account: StoredAccount,
  fromDate: string,
  toDate: string
): Promise<SyncResult> {
  const bankTransactions = await getTransactions(
    account.uid,
    fromDate,
    toDate,
    account.currency
  )

  // Convert Enable Banking format to generic RawTransaction
  const rawTransactions: RawTransaction[] = bankTransactions.map((tx) => ({
    date: tx.booking_date || tx.date,
    description: tx.description || tx.counterparty_name || 'Unknown',
    amount: tx.amount,
    currency: tx.currency || account.currency,
    external_id: `${connectionId}_${tx.id}`,
    mcc_code: tx.merchant_category_code ? parseInt(tx.merchant_category_code, 10) : null,
    merchant_name: tx.counterparty_name || null,
    reference: tx.reference || null,
    bank_connection_id: connectionId,
    import_source: 'enable_banking',
  }))

  const ingestResult = await ingestTransactions(supabase, userId, rawTransactions)

  // Update account balance
  try {
    const balance = await getAccountBalance(account.uid)
    account.balance = balance.amount
  } catch {
    // Ignore balance fetch errors
  }

  return {
    imported: ingestResult.imported,
    duplicates: ingestResult.duplicates,
    errors: ingestResult.errors,
  }
}
