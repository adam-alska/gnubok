import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * AI Consent Service
 *
 * Manages per-extension consent for AI features that send user data to
 * third-party AI providers. Required before any AI extension API call.
 *
 * Uses the existing `extension_data` table (migration 020) with key='ai_consent'.
 *
 * Version bump policy:
 * - BUMP version when: New sub-processor added, new data type sent to existing
 *   provider, changed processing purpose.
 * - DO NOT bump when: Bug fix, model upgrade within same provider
 *   (e.g. Haiku 4.5 -> Haiku 5), performance improvements.
 * - When version bumps, existing consents become invalid and users must re-consent.
 */

export const CURRENT_CONSENT_VERSION = 1

export const AI_EXTENSIONS = ['receipt-ocr', 'ai-categorization', 'ai-chat'] as const

export type AiExtensionId = (typeof AI_EXTENSIONS)[number]

export function isAiExtension(extensionId: string): extensionId is AiExtensionId {
  return (AI_EXTENSIONS as readonly string[]).includes(extensionId)
}

export const AI_DATA_DISCLOSURES: Record<AiExtensionId, {
  provider: string
  dataTypes: string[]
  purpose: string
}> = {
  'receipt-ocr': {
    provider: 'Anthropic',
    dataTypes: ['Kvittobilder', 'Extraherad text fran kvitton'],
    purpose: 'Automatisk avlasning och kategorisering av kvitton',
  },
  'ai-categorization': {
    provider: 'Anthropic, OpenAI',
    dataTypes: ['Transaktionsbeskrivningar', 'Belopp', 'Bokformallar'],
    purpose: 'Automatisk kategorisering av banktransaktioner',
  },
  'ai-chat': {
    provider: 'Anthropic, OpenAI',
    dataTypes: ['Chattmeddelanden', 'Bokforingsdata som refereras i chatten'],
    purpose: 'AI-assistent for bokforingsfragor',
  },
}

/**
 * Check if user has valid AI consent for the given extension.
 * Returns true for non-AI extensions (no consent needed).
 */
export async function hasAiConsent(
  supabase: SupabaseClient,
  userId: string,
  extensionId: string
): Promise<boolean> {
  if (!isAiExtension(extensionId)) {
    return true
  }

  const { data } = await supabase
    .from('extension_data')
    .select('value')
    .eq('user_id', userId)
    .eq('extension_id', extensionId)
    .eq('key', 'ai_consent')
    .single()

  if (!data?.value) return false

  const consent = data.value as { consented: boolean; version: number }
  return consent.consented === true && consent.version >= CURRENT_CONSENT_VERSION
}

/**
 * Grant AI consent for an extension.
 */
export async function grantAiConsent(
  supabase: SupabaseClient,
  userId: string,
  extensionId: string
): Promise<void> {
  if (!isAiExtension(extensionId)) return

  await supabase
    .from('extension_data')
    .upsert(
      {
        user_id: userId,
        extension_id: extensionId,
        key: 'ai_consent',
        value: {
          consented: true,
          version: CURRENT_CONSENT_VERSION,
          granted_at: new Date().toISOString(),
        },
      },
      { onConflict: 'user_id,extension_id,key' }
    )
}

/**
 * Revoke AI consent for an extension.
 */
export async function revokeAiConsent(
  supabase: SupabaseClient,
  userId: string,
  extensionId: string
): Promise<void> {
  if (!isAiExtension(extensionId)) return

  await supabase
    .from('extension_data')
    .upsert(
      {
        user_id: userId,
        extension_id: extensionId,
        key: 'ai_consent',
        value: {
          consented: false,
          version: CURRENT_CONSENT_VERSION,
          revoked_at: new Date().toISOString(),
        },
      },
      { onConflict: 'user_id,extension_id,key' }
    )
}
