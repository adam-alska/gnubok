import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSuggestedCategories, mergeAiSuggestions, getSuggestedTemplates, type SuggestedCategory, type SuggestedTemplate } from '@/lib/transactions/category-suggestions'
import type { Transaction, TransactionCategory, EntityType } from '@/types'

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

  // Fetch pre-computed AI suggestions for these transactions
  const aiKeys = ids.map((id: string) => `suggestion:${id}`)
  const { data: aiRecords } = await supabase
    .from('extension_data')
    .select('key, value')
    .eq('user_id', user.id)
    .eq('extension_id', 'ai-categorization')
    .in('key', aiKeys)

  const aiSuggestionsMap: Record<string, { category: string; basAccount: string; confidence: number; reasoning: string }> = {}
  if (aiRecords) {
    for (const record of aiRecords) {
      const txId = record.key.replace('suggestion:', '')
      aiSuggestionsMap[txId] = record.value as { category: string; basAccount: string; confidence: number; reasoning: string }
    }
  }

  // Fetch entity type for template matching
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type')
    .eq('user_id', user.id)
    .single()
  const entityType = (settings?.entity_type as EntityType) || undefined

  // Generate suggestions for each transaction
  const suggestions: Record<string, SuggestedCategory[]> = {}
  const template_suggestions: Record<string, SuggestedTemplate[]> = {}

  for (const tx of transactions) {
    let result = getSuggestedCategories(
      tx as Transaction,
      mappingRules || [],
      categoryHistory
    )

    // Merge AI suggestions if available
    const aiSuggestion = aiSuggestionsMap[tx.id]
    if (aiSuggestion) {
      result = mergeAiSuggestions(result, [aiSuggestion])
    }

    suggestions[tx.id] = result
    template_suggestions[tx.id] = getSuggestedTemplates(tx as Transaction, entityType)
  }

  return NextResponse.json({ suggestions, template_suggestions })
}
