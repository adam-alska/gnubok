import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@/lib/logger'

const log = createLogger('ai-usage')

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  model: string
}

/**
 * Track AI token usage. Non-blocking — errors are logged, not thrown.
 */
export function trackTokenUsage(
  supabase: SupabaseClient,
  userId: string,
  extensionId: string,
  usage: TokenUsage,
  companyId?: string
): void {
  supabase
    .from('ai_usage_tracking')
    .insert({
      user_id: userId,
      company_id: companyId,
      extension_id: extensionId,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    })
    .then(({ error }) => {
      if (error) {
        log.error(`Failed to track usage for ${extensionId}:`, error.message)
      }
    })
}
