/**
 * Forwards gnubok core events to Activepieces webhook URLs.
 *
 * Users register webhook URLs in their AP flows (via the gnubok piece triggers).
 * This module looks up active webhook subscriptions for a company and POSTs the event payload.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtensionLogger } from '@/lib/extensions/types'
import { triggerWebhook } from './ap-client'

interface WebhookSubscription {
  id: string
  company_id: string
  event_type: string
  webhook_url: string
  active: boolean
}

/**
 * Forward a gnubok event to all matching AP webhook subscriptions for this company.
 */
export async function forwardEvent(
  supabase: SupabaseClient,
  companyId: string,
  eventType: string,
  payload: Record<string, unknown>,
  log: ExtensionLogger
): Promise<void> {
  const { data: subscriptions, error } = await supabase
    .from('automation_webhooks')
    .select('*')
    .eq('company_id', companyId)
    .eq('event_type', eventType)
    .eq('active', true)

  if (error) {
    log.error('Failed to fetch webhook subscriptions', error.message)
    return
  }

  if (!subscriptions || subscriptions.length === 0) return

  const results = await Promise.allSettled(
    (subscriptions as WebhookSubscription[]).map(sub =>
      triggerWebhook(sub.webhook_url, {
        event: eventType,
        timestamp: new Date().toISOString(),
        companyId,
        ...payload,
      })
    )
  )

  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length > 0) {
    log.warn(`${failed.length}/${results.length} webhook forwards failed for ${eventType}`)
  }
}
