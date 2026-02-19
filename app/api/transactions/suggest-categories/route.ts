import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSuggestedCategories, type SuggestedCategory } from '@/lib/transactions/category-suggestions'
import type { Transaction, TransactionCategory } from '@/types'
import { validateBody, SuggestCategoriesInputSchema } from '@/lib/validation'

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

  const raw = await request.json()
  const validation = validateBody(SuggestCategoriesInputSchema, raw)
  if (!validation.success) return validation.response
  const { transaction_ids } = validation.data

  const ids = transaction_ids

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
