import type { SupabaseClient } from '@supabase/supabase-js'
import { getTransactions, getAccountBalance } from './api-client'
import { ingestTransactions as defaultIngest } from '@/lib/transactions/ingest'
import type { RawTransaction, IngestResult } from '@/types'
import type { StoredAccount } from '../types'

/** Ingest function signature — matches lib/transactions/ingest */
export type IngestFn = (
  supabase: SupabaseClient,
  userId: string,
  raw: RawTransaction[]
) => Promise<IngestResult>

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
 *
 * @param ingest - Optional ingest function override (defaults to core ingestTransactions).
 *                 When called from an extension handler with ctx.services.ingestTransactions,
 *                 pass that function to avoid direct @/lib imports.
 */
export async function syncAccountTransactions(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  account: StoredAccount,
  fromDate: string,
  toDate: string,
  ingest: IngestFn = defaultIngest
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

  const ingestResult = await ingest(supabase, userId, rawTransactions)

  // Update account balance
  try {
    const balance = await getAccountBalance(account.uid)
    account.balance = balance.amount
    account.balance_updated_at = new Date().toISOString()
  } catch {
    // Keep previous balance, don't update timestamp
  }

  return {
    imported: ingestResult.imported,
    duplicates: ingestResult.duplicates,
    errors: ingestResult.errors,
  }
}
