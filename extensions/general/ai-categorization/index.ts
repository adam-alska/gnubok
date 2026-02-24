import type { Extension, ExtensionContext } from '@/lib/extensions/types'
import type { EventPayload } from '@/lib/events/types'
import type { Transaction, EntityType } from '@/types'
import {
  AnthropicCategorizationProvider,
  type CategorizationProvider,
  type TransactionForCategorization,
  type EnrichedCategorizationContext,
  type CategorizationSuggestion,
  type AccountUsageEntry,
  type MerchantHistoryEntry,
} from './categorizer'
import { findSimilarTemplates } from '@/lib/bookkeeping/template-embeddings'
import type { BookingTemplate } from '@/lib/bookkeeping/booking-templates'

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

/** Get settings via ExtensionContext (preferred in event handlers) */
async function getSettingsViaCtx(ctx: ExtensionContext): Promise<AiCategorizationSettings> {
  const stored = await ctx.settings.get<Partial<AiCategorizationSettings>>()
  return { ...DEFAULT_SETTINGS, ...(stored || {}) }
}

/** Get settings for external callers (settings routes, on-demand API) */
export async function getSettings(userId: string): Promise<AiCategorizationSettings> {
  const { createClient } = await import('@/lib/supabase/server')
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

  const { createClient } = await import('@/lib/supabase/server')
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
  const { createClient } = await import('@/lib/supabase/server')
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

  const context = await buildEnrichedContext(userId, supabase, batch)

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
  payload: EventPayload<'transaction.synced'>,
  ctx?: ExtensionContext
): Promise<void> {
  const { transactions: syncedTransactions, userId } = payload
  const log = ctx?.log ?? console

  // Gate: Is autoSuggestEnabled?
  const settings = ctx ? await getSettingsViaCtx(ctx) : await getSettings(userId)
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

  log.info(`Auto-suggest triggered for ${uncategorized.length} uncategorized transactions`)

  try {
    const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()

    const batch: TransactionForCategorization[] = uncategorized.map((t: Transaction) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      merchant_name: t.merchant_name,
      mcc_code: t.mcc_code,
      currency: t.currency,
    }))

    const context = await buildEnrichedContext(userId, supabase, batch)
    const aiProvider = getProvider(settings.providerModel)
    const suggestions = await aiProvider.categorize(batch, context)

    // Store only suggestions above confidence threshold
    const qualifiedSuggestions = suggestions.filter(
      (s) => s.confidence >= settings.confidenceThreshold
    )

    if (qualifiedSuggestions.length > 0) {
      await storeSuggestions(userId, qualifiedSuggestions, supabase)
    }

    log.info(
      `Generated ${suggestions.length} suggestions, ${qualifiedSuggestions.length} above threshold (${settings.confidenceThreshold})`
    )
  } catch (error) {
    log.error('handleTransactionSynced failed:', error)
  }
}

// ============================================================
// Helpers
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildEnrichedContext(
  userId: string,
  supabase: any,
  transactions: TransactionForCategorization[]
): Promise<EnrichedCategorizationContext> {
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

  // Fetch user's most-used accounts (top 30)
  const { data: accountUsageRows } = await supabase
    .from('journal_entry_lines')
    .select('account_number')
    .eq('user_id', userId)

  const accountCounts = new Map<string, number>()
  if (accountUsageRows) {
    for (const row of accountUsageRows as { account_number: string }[]) {
      accountCounts.set(row.account_number, (accountCounts.get(row.account_number) || 0) + 1)
    }
  }
  const userAccountUsage: AccountUsageEntry[] = Array.from(accountCounts.entries())
    .map(([account_number, count]) => ({ account_number, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)

  // Fetch merchant history for this batch's merchants
  const merchantNames = [...new Set(
    transactions
      .map((t) => t.merchant_name)
      .filter((n): n is string => n !== null && n.length > 0)
  )]

  let merchantHistory: MerchantHistoryEntry[] = []
  if (merchantNames.length > 0) {
    const { data: merchantRows } = await supabase
      .from('transactions')
      .select('merchant_name, category, template_id')
      .eq('user_id', userId)
      .not('is_business', 'is', null)
      .neq('category', 'uncategorized')
      .in('merchant_name', merchantNames)
      .limit(200)

    if (merchantRows) {
      const merchantMap = new Map<string, MerchantHistoryEntry>()
      for (const row of merchantRows as { merchant_name: string; category: string; template_id: string | null }[]) {
        const key = `${row.merchant_name}:${row.category}`
        const existing = merchantMap.get(key)
        if (existing) {
          existing.count++
        } else {
          merchantMap.set(key, {
            merchant_name: row.merchant_name,
            category: row.category,
            template_id: row.template_id,
            count: 1,
          })
        }
      }
      merchantHistory = Array.from(merchantMap.values())
        .sort((a, b) => b.count - a.count)
    }
  }

  // Find candidate templates via embedding search
  // Use a representative subset of transactions to find candidates
  const representativeTransactions = transactions.slice(0, 5)
  const candidateMap = new Map<string, BookingTemplate>()

  for (const tx of representativeTransactions) {
    try {
      const matches = await findSimilarTemplates(
        tx as unknown as Transaction,
        entityType
      )
      for (const m of matches) {
        if (!candidateMap.has(m.template.id)) {
          candidateMap.set(m.template.id, m.template)
        }
      }
    } catch {
      // Embedding search failed — continue without candidates
    }
  }

  const candidateTemplates = Array.from(candidateMap.values())

  return {
    entityType,
    recentHistory,
    candidateTemplates,
    userAccountUsage,
    merchantHistory,
  }
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
    await ctx.settings.set('settings', DEFAULT_SETTINGS)
  },
}
