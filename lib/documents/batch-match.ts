/**
 * Batch Document Matching
 *
 * Orchestrates matching multiple inbox items to transactions in a single sweep.
 * Fetches all unbooked transactions once, then runs per-item matching with
 * greedy assignment to prevent double-matching.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvoiceInboxItem, Transaction } from '@/types'
import { matchDocumentToTransactions, type DocumentMatchResult } from './document-matcher'

export interface BatchMatchResult {
  matched: number
  total: number
  matches: Array<{ inboxItemId: string; result: DocumentMatchResult }>
}

/**
 * Run a matching sweep for all ready unmatched inbox items.
 *
 * 1. Fetches all ready/processing inbox items without a matched_transaction_id
 * 2. Fetches all unbooked expense transactions
 * 3. Runs matching per item, greedily assigning (highest confidence first)
 * 4. Persists matches back to inbox items
 */
export async function runDocumentMatchingSweep(
  supabase: SupabaseClient,
  userId: string,
  inboxItemIds?: string[]
): Promise<BatchMatchResult> {
  // 1. Fetch unmatched inbox items
  let query = supabase
    .from('invoice_inbox_items')
    .select('*')
    .eq('company_id', userId)
    .is('matched_transaction_id', null)
    .in('status', ['ready', 'processing'])

  if (inboxItemIds && inboxItemIds.length > 0) {
    query = query.in('id', inboxItemIds)
  }

  const { data: inboxItems, error: itemsError } = await query

  if (itemsError || !inboxItems || inboxItems.length === 0) {
    console.log(`[batch-match] No unmatched inbox items found`)
    return { matched: 0, total: 0, matches: [] }
  }

  console.log(`[batch-match] Starting sweep: ${inboxItems.length} unmatched inbox items`)

  // 2. Fetch all unbooked expense transactions (broad window: last 90 days)
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('company_id', userId)
    .is('journal_entry_id', null)
    .is('is_business', null)
    .lt('amount', 0)
    .gte('date', ninetyDaysAgo.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (txError || !transactions || transactions.length === 0) {
    console.log(`[batch-match] No candidate transactions found (last 90 days)`)
    return { matched: 0, total: inboxItems.length, matches: [] }
  }

  console.log(`[batch-match] ${transactions.length} candidate transactions (last 90 days)`)

  // 3. Run matching for each item and collect results
  const pendingMatches: Array<{
    inboxItemId: string
    result: DocumentMatchResult
  }> = []

  for (const item of inboxItems as InvoiceInboxItem[]) {
    const result = await matchDocumentToTransactions(
      supabase,
      userId,
      item,
      transactions as Transaction[]
    )
    if (result) {
      pendingMatches.push({ inboxItemId: item.id, result })
    }
  }

  // 4. Greedy assignment: sort by confidence desc, assign each transaction at most once
  pendingMatches.sort((a, b) => b.result.confidence - a.result.confidence)

  const assignedTransactionIds = new Set<string>()
  const finalMatches: typeof pendingMatches = []

  for (const match of pendingMatches) {
    if (assignedTransactionIds.has(match.result.transactionId)) {
      console.log(`[batch-match] Skipped item=${match.inboxItemId} → tx=${match.result.transactionId} (already assigned to higher-confidence match)`)
      continue // Transaction already assigned to a higher-confidence match
    }
    assignedTransactionIds.add(match.result.transactionId)
    finalMatches.push(match)
  }

  console.log(`[batch-match] Sweep complete: ${finalMatches.length}/${inboxItems.length} items matched, ${pendingMatches.length - finalMatches.length} skipped (greedy dedup)`)

  // 5. Persist matches
  for (const { inboxItemId, result } of finalMatches) {
    await supabase
      .from('invoice_inbox_items')
      .update({
        matched_transaction_id: result.transactionId,
        match_confidence: result.confidence,
        match_method: result.method,
      })
      .eq('id', inboxItemId)
      .eq('company_id', userId)
  }

  return {
    matched: finalMatches.length,
    total: inboxItems.length,
    matches: finalMatches,
  }
}
