import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSuggestedCategories, mergeAiSuggestions, getSuggestedTemplates, type SuggestedCategory, type SuggestedTemplate } from '@/lib/transactions/category-suggestions'
import type { Transaction, TransactionCategory, EntityType } from '@/types'

// Minimum confidence threshold — below this, suggestions are considered weak
// and we trigger on-demand AI categorization to get better results.
const WEAK_SUGGESTION_THRESHOLD = 0.55

/**
 * Check if suggestions are "weak" — only history-based fallbacks
 * with no strong rule/pattern/AI match.
 */
function hasWeakSuggestions(result: SuggestedCategory[]): boolean {
  if (result.length === 0) return true
  // Weak if the best suggestion is below threshold
  const bestConfidence = Math.max(...result.map((s) => s.confidence))
  if (bestConfidence < WEAK_SUGGESTION_THRESHOLD) return true
  // Weak if all suggestions are from history only (no rule/pattern/ai match)
  if (result.every((s) => s.source === 'history')) return true
  return false
}

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

  type AiSuggestion = { category: string; basAccount: string; confidence: number; reasoning: string }
  const aiSuggestionsMap: Record<string, AiSuggestion[]> = {}
  if (aiRecords) {
    for (const record of aiRecords) {
      const txId = record.key.replace('suggestion:', '')
      const value = record.value
      // Handle both single object (old) and array (new) storage formats
      if (Array.isArray(value)) {
        aiSuggestionsMap[txId] = value as AiSuggestion[]
      } else {
        aiSuggestionsMap[txId] = [value as AiSuggestion]
      }
    }
  }

  // Fetch entity type for template matching
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type')
    .eq('user_id', user.id)
    .single()
  const entityType = (settings?.entity_type as EntityType) || undefined

  // Generate initial suggestions for each transaction
  const suggestions: Record<string, SuggestedCategory[]> = {}
  const template_suggestions: Record<string, SuggestedTemplate[]> = {}
  const needsAiIds: string[] = []

  for (const tx of transactions) {
    let result = getSuggestedCategories(
      tx as Transaction,
      mappingRules || [],
      categoryHistory
    )

    // Merge pre-computed AI suggestions if available
    const aiSuggestions = aiSuggestionsMap[tx.id]
    if (aiSuggestions && aiSuggestions.length > 0) {
      result = mergeAiSuggestions(result, aiSuggestions, tx.amount)
    } else if (hasWeakSuggestions(result)) {
      // No pre-computed AI suggestion AND rule-based suggestions are weak —
      // mark this transaction for on-demand AI categorization
      needsAiIds.push(tx.id)
    }

    suggestions[tx.id] = result
    template_suggestions[tx.id] = await getSuggestedTemplates(tx as Transaction, entityType)
  }

  // Trigger on-demand AI categorization for transactions with weak suggestions
  if (needsAiIds.length > 0) {
    console.log(
      `[suggest-categories] ${needsAiIds.length} transactions have weak suggestions, triggering on-demand AI:`,
      needsAiIds.map((id) => {
        const tx = transactions.find((t) => t.id === id)
        return tx
          ? { id, description: tx.description, merchant_name: tx.merchant_name, amount: tx.amount }
          : { id }
      })
    )

    try {
      const { categorizeTransactions } = await import(
        '@/extensions/general/ai-categorization'
      )
      const aiResults = await categorizeTransactions(user.id, needsAiIds)

      console.log(
        '[suggest-categories] AI categorization results:',
        aiResults.map((r) => ({
          id: r.transactionId,
          category: r.category,
          basAccount: r.basAccount,
          confidence: r.confidence,
          reasoning: r.reasoning,
          isPrivate: r.isPrivate,
          templateId: r.templateId,
        }))
      )

      // Group AI results by transactionId (AI now returns 2 per transaction)
      const groupedAi: Record<string, { category: string; basAccount: string; confidence: number; reasoning: string }[]> = {}
      for (const aiResult of aiResults) {
        if (!groupedAi[aiResult.transactionId]) {
          groupedAi[aiResult.transactionId] = []
        }
        groupedAi[aiResult.transactionId].push({
          category: aiResult.category,
          basAccount: aiResult.basAccount,
          confidence: aiResult.confidence,
          reasoning: aiResult.reasoning,
        })
      }

      for (const [txId, aiSuggestions] of Object.entries(groupedAi)) {
        const existing = suggestions[txId] || []
        const tx = transactions.find((t) => t.id === txId)
        suggestions[txId] = mergeAiSuggestions(existing, aiSuggestions, tx?.amount)
      }
    } catch (err) {
      // AI categorization is non-blocking — log and continue with existing suggestions
      console.error('[suggest-categories] On-demand AI categorization failed:', err)
    }
  }

  return NextResponse.json({ suggestions, template_suggestions })
}
