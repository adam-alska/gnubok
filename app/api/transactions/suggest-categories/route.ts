import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSuggestedCategories, mergeAiSuggestions, getSuggestedTemplates, type SuggestedCategory, type SuggestedTemplate } from '@/lib/transactions/category-suggestions'
import type { Transaction, EntityType } from '@/types'

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
    }

    suggestions[tx.id] = result
    template_suggestions[tx.id] = await getSuggestedTemplates(tx as Transaction, entityType, mappingRules || undefined)
  }

  // Inject document template suggestions from matched inbox items
  try {
    const { data: matchedInboxItems } = await supabase
      .from('invoice_inbox_items')
      .select('matched_transaction_id, suggested_template_id, suggested_template_confidence')
      .eq('user_id', user.id)
      .in('matched_transaction_id', ids)
      .not('suggested_template_id', 'is', null)

    if (matchedInboxItems && matchedInboxItems.length > 0) {
      console.log(`[suggest-categories] Found ${matchedInboxItems.length} matched inbox items with template suggestions`)
      const { getTemplateById } = await import('@/lib/bookkeeping/booking-templates')

      for (const item of matchedInboxItems) {
        const txId = item.matched_transaction_id as string
        const templateId = item.suggested_template_id as string
        const template = getTemplateById(templateId)
        if (!template) {
          console.log(`[suggest-categories] Template "${templateId}" not found, skipping`)
          continue
        }

        console.log(`[suggest-categories] Injecting document template: tx=${txId} → ${templateId} (${template.name_sv}, debit=${template.debit_account}, confidence=${item.suggested_template_confidence})`)

        // Add to template_suggestions at the top with boosted confidence
        const existing = template_suggestions[txId] || []
        const docTemplate: SuggestedTemplate = {
          template_id: templateId,
          name_sv: template.name_sv,
          name_en: template.name_en,
          group: template.group,
          debit_account: template.debit_account,
          credit_account: template.credit_account,
          confidence: Math.min((item.suggested_template_confidence as number) || 0.8, 1),
          description_sv: template.description_sv,
          risk_level: template.risk_level,
          requires_review: template.requires_review,
        }
        template_suggestions[txId] = [docTemplate, ...existing.filter((t) => t.template_id !== templateId)]
      }
    }
  } catch {
    // Non-blocking
  }

  return NextResponse.json({ suggestions, template_suggestions })
}
