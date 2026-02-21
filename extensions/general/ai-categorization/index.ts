import { createClient } from '@/lib/supabase/server'
import type { Extension } from '@/lib/extensions/types'
import type { EventPayload } from '@/lib/events/types'
import type { Transaction, EntityType } from '@/types'
import {
  AnthropicCategorizationProvider,
  type CategorizationProvider,
  type TransactionForCategorization,
  type CategorizationContext,
  type CategorizationSuggestion,
} from './categorizer'

// ============================================================
// Settings
// ============================================================

export interface AiCategorizationSettings {
  autoSuggestEnabled: boolean
  confidenceThreshold: number
  providerModel: string
}

const DEFAULT_SETTINGS: AiCategorizationSettings = {
  autoSuggestEnabled: true,
  confidenceThreshold: 0.7,
  providerModel: 'claude-haiku-4-5-20251001',
}

export async function getSettings(userId: string): Promise<AiCategorizationSettings> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('extension_data')
    .select('value')
    .eq('user_id', userId)
    .eq('extension_id', 'ai-categorization')
    .eq('key', 'settings')
    .single()

  if (!data?.value) return { ...DEFAULT_SETTINGS }

  return { ...DEFAULT_SETTINGS, ...(data.value as Partial<AiCategorizationSettings>) }
}

export async function saveSettings(
  userId: string,
  partial: Partial<AiCategorizationSettings>
): Promise<AiCategorizationSettings> {
  const current = await getSettings(userId)
  const merged = { ...current, ...partial }

  const supabase = await createClient()

  await supabase
    .from('extension_data')
    .upsert(
      {
        user_id: userId,
        extension_id: 'ai-categorization',
        key: 'settings',
        value: merged,
      },
      { onConflict: 'user_id,extension_id,key' }
    )

  return merged
}

// ============================================================
// Provider
// ============================================================

let provider: CategorizationProvider | null = null

function getProvider(model?: string): CategorizationProvider {
  if (!provider) {
    provider = new AnthropicCategorizationProvider(model)
  }
  return provider
}

// ============================================================
// Public API — on-demand categorization
// ============================================================

export async function categorizeTransactions(
  userId: string,
  transactionIds: string[]
): Promise<CategorizationSuggestion[]> {
  const supabase = await createClient()
  const settings = await getSettings(userId)

  // Fetch transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, description, amount, date, merchant_name, mcc_code, currency')
    .eq('user_id', userId)
    .in('id', transactionIds)

  if (!transactions || transactions.length === 0) return []

  const batch: TransactionForCategorization[] = transactions.map((t) => ({
    id: t.id,
    description: t.description,
    amount: t.amount,
    date: t.date,
    merchant_name: t.merchant_name,
    mcc_code: t.mcc_code,
    currency: t.currency,
  }))

  const context = await buildContext(userId, supabase)

  const aiProvider = getProvider(settings.providerModel)
  const suggestions = await aiProvider.categorize(batch, context)

  // Store suggestions
  await storeSuggestions(userId, suggestions, supabase)

  return suggestions
}

// ============================================================
// Event Handler
// ============================================================

async function handleTransactionSynced(
  payload: EventPayload<'transaction.synced'>
): Promise<void> {
  const { transactions: syncedTransactions, userId } = payload

  // Gate: Is autoSuggestEnabled?
  const settings = await getSettings(userId)
  if (!settings.autoSuggestEnabled) {
    return
  }

  // Gate: Filter to uncategorized transactions only
  const uncategorized = syncedTransactions.filter(
    (t: Transaction) => t.is_business === null
  )
  if (uncategorized.length === 0) {
    return
  }

  console.log(
    `[ai-categorization] Auto-suggest triggered for ${uncategorized.length} uncategorized transactions`
  )

  try {
    const supabase = await createClient()

    const batch: TransactionForCategorization[] = uncategorized.map((t: Transaction) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      merchant_name: t.merchant_name,
      mcc_code: t.mcc_code,
      currency: t.currency,
    }))

    const context = await buildContext(userId, supabase)
    const aiProvider = getProvider(settings.providerModel)
    const suggestions = await aiProvider.categorize(batch, context)

    // Store only suggestions above confidence threshold
    const qualifiedSuggestions = suggestions.filter(
      (s) => s.confidence >= settings.confidenceThreshold
    )

    if (qualifiedSuggestions.length > 0) {
      await storeSuggestions(userId, qualifiedSuggestions, supabase)
    }

    console.log(
      `[ai-categorization] Generated ${suggestions.length} suggestions, ${qualifiedSuggestions.length} above threshold (${settings.confidenceThreshold})`
    )
  } catch (error) {
    console.error('[ai-categorization] handleTransactionSynced failed:', error)
  }
}

// ============================================================
// Helpers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildContext(userId: string, supabase: any): Promise<CategorizationContext> {
  // Fetch entity type
  const { data: companySettings } = await supabase
    .from('company_settings')
    .select('entity_type')
    .eq('user_id', userId)
    .single()

  const entityType: EntityType = companySettings?.entity_type || 'enskild_firma'

  // Fetch recent categorization history
  const { data: historicalTxns } = await supabase
    .from('transactions')
    .select('description, category')
    .eq('user_id', userId)
    .not('is_business', 'is', null)
    .neq('category', 'uncategorized')
    .order('updated_at', { ascending: false })
    .limit(50)

  const recentHistory = (historicalTxns || []).map(
    (t: { description: string; category: string }) => ({
      description: t.description,
      category: t.category,
    })
  )

  return { entityType, recentHistory }
}

async function storeSuggestions(
  userId: string,
  suggestions: CategorizationSuggestion[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<void> {
  for (const suggestion of suggestions) {
    await supabase.from('extension_data').upsert(
      {
        user_id: userId,
        extension_id: 'ai-categorization',
        key: `suggestion:${suggestion.transactionId}`,
        value: suggestion,
      },
      { onConflict: 'user_id,extension_id,key' }
    )
  }
}

// ============================================================
// Extension Object
// ============================================================

export const aiCategorizationExtension: Extension = {
  id: 'ai-categorization',
  name: 'AI Kategorisering',
  version: '1.0.0',
  eventHandlers: [
    { eventType: 'transaction.synced', handler: handleTransactionSynced },
  ],
  settingsPanel: {
    label: 'AI Kategorisering',
    path: '/settings/extensions/ai-categorization',
  },
  async onInstall(ctx) {
    await saveSettings(ctx.userId, DEFAULT_SETTINGS)
  },
}
