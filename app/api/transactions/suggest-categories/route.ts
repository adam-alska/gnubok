import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSuggestedCategories, type SuggestedCategory } from '@/lib/transactions/category-suggestions'
import type { Transaction, TransactionCategory } from '@/types'

/**
 * POST /api/transactions/suggest-categories
 * Batch endpoint for getting category suggestions for multiple transactions
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { transaction_ids } = await request.json()

  if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
    return NextResponse.json({ error: 'transaction_ids is required' }, { status: 400 })
  }

  // Limit batch size
  const ids = transaction_ids.slice(0, 50)

  // Fetch transactions
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .in('id', ids)

  if (txError || !transactions) {
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  // Fetch user's mapping rules (once, for all transactions)
  const { data: mappingRules } = await supabase
    .from('mapping_rules')
    .select('*')
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .eq('is_active', true)
    .order('priority', { ascending: false })

  // Build category history from user's past categorized transactions
  const { data: historicalTxns } = await supabase
    .from('transactions')
    .select('category')
    .eq('user_id', user.id)
    .not('is_business', 'is', null)
    .neq('category', 'uncategorized')
    .neq('category', 'private')
    .limit(200)

  const categoryHistory: Record<string, number> = {}
  if (historicalTxns) {
    for (const tx of historicalTxns) {
      categoryHistory[tx.category] = (categoryHistory[tx.category] || 0) + 1
    }
  }

  // Generate suggestions for each transaction
  const suggestions: Record<string, SuggestedCategory[]> = {}

  for (const tx of transactions) {
    suggestions[tx.id] = getSuggestedCategories(
      tx as Transaction,
      mappingRules || [],
      categoryHistory
    )
  }

  return NextResponse.json({ suggestions })
}
