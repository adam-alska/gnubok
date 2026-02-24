import type { Extension, ExtensionContext } from '@/lib/extensions/types'
import type { EventPayload } from '@/lib/events/types'

// ============================================================
// Settings
// ============================================================

export interface UserDescriptionMatchSettings {
  batchApplyEnabled: boolean
  minConfidenceThreshold: number
}

const DEFAULT_SETTINGS: UserDescriptionMatchSettings = {
  batchApplyEnabled: true,
  minConfidenceThreshold: 0.55,
}

export async function getSettings(userId: string): Promise<UserDescriptionMatchSettings> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data } = await supabase
    .from('extension_data')
    .select('value')
    .eq('user_id', userId)
    .eq('extension_id', 'user-description-match')
    .eq('key', 'settings')
    .single()

  if (!data?.value) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...(data.value as Partial<UserDescriptionMatchSettings>) }
}

export async function saveSettings(
  userId: string,
  partial: Partial<UserDescriptionMatchSettings>
): Promise<UserDescriptionMatchSettings> {
  const current = await getSettings(userId)
  const merged = { ...current, ...partial }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  await supabase
    .from('extension_data')
    .upsert(
      {
        user_id: userId,
        extension_id: 'user-description-match',
        key: 'settings',
        value: merged,
      },
      { onConflict: 'user_id,extension_id,key' }
    )

  return merged
}

// ============================================================
// Event Handler
// ============================================================

async function handleTransactionCategorized(
  payload: EventPayload<'transaction.categorized'>,
  ctx?: ExtensionContext
): Promise<void> {
  const { transaction, userId } = payload
  const log = ctx?.log ?? console

  if (!transaction.merchant_name) return

  const settings = ctx
    ? { ...(DEFAULT_SETTINGS), ...(await ctx.settings.get<Partial<UserDescriptionMatchSettings>>() || {}) }
    : await getSettings(userId)

  if (!settings.batchApplyEnabled) return

  try {
    const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()

    // Check if the rule that fired was a user-described rule
    const { data: rule } = await supabase
      .from('mapping_rules')
      .select('id, user_description, merchant_pattern')
      .eq('user_id', userId)
      .eq('source', 'user_description')
      .ilike('merchant_pattern', transaction.merchant_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .limit(1)
      .single()

    if (!rule) return

    // Count uncategorized siblings
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('merchant_name', transaction.merchant_name)
      .is('journal_entry_id', null)

    if (!count || count === 0) return

    // Store batch hint for the UI
    await supabase.from('extension_data').upsert(
      {
        user_id: userId,
        extension_id: 'user-description-match',
        key: `batch_hint:${transaction.merchant_name}`,
        value: {
          merchant_name: transaction.merchant_name,
          uncategorized_count: count,
          user_description: rule.user_description,
        },
      },
      { onConflict: 'user_id,extension_id,key' }
    )

    log.info(`[user-description-match] Batch hint stored: ${count} uncategorized for ${transaction.merchant_name}`)
  } catch (error) {
    log.error('[user-description-match] handleTransactionCategorized failed:', error)
  }
}

// ============================================================
// Extension Object
// ============================================================

export const userDescriptionMatchExtension: Extension = {
  id: 'user-description-match',
  name: 'Beskrivningsmatchning',
  version: '1.0.0',
  eventHandlers: [
    { eventType: 'transaction.categorized', handler: handleTransactionCategorized },
  ],
  settingsPanel: {
    label: 'Beskrivningsmatchning',
    path: '/settings/extensions/user-description-match',
  },
  async onInstall(ctx) {
    await ctx.settings.set('settings', DEFAULT_SETTINGS)
  },
}
