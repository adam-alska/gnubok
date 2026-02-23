/**
 * Push Notifications Extension
 *
 * Converts system events into instant push notifications.
 * Also provides cron-based scheduling for time-dependent checks
 * (tax deadlines, invoice due/overdue).
 *
 * Event handlers follow the gate pattern:
 *   check extension setting -> build payload -> send via unified pipeline
 */

import type { Extension, ExtensionContext } from '@/lib/extensions/types'
import type { EventPayload } from '@/lib/events/types'
import { sendNotificationToUser } from './notification-sender'
import {
  createPeriodLockedPayload,
  createYearClosedPayload,
  createInvoiceSentPayload,
  createReceiptExtractedPayload,
  createReceiptMatchedPayload,
} from './payload-builders'

// ============================================================
// Settings
// ============================================================

export interface PushNotificationSettings {
  periodLockedEnabled: boolean
  periodYearClosedEnabled: boolean
  invoiceSentEnabled: boolean
  receiptExtractedEnabled: boolean
  receiptMatchedEnabled: boolean
}

const DEFAULT_SETTINGS: PushNotificationSettings = {
  periodLockedEnabled: true,
  periodYearClosedEnabled: true,
  invoiceSentEnabled: false,
  receiptExtractedEnabled: true,
  receiptMatchedEnabled: true,
}

/** Get settings via ExtensionContext (preferred in event handlers) */
async function getSettingsViaCtx(ctx: ExtensionContext): Promise<PushNotificationSettings> {
  const stored = await ctx.settings.get<Partial<PushNotificationSettings>>()
  return { ...DEFAULT_SETTINGS, ...(stored || {}) }
}

/** Get settings for external callers (settings routes, cron jobs) */
export async function getSettings(userId: string): Promise<PushNotificationSettings> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data } = await supabase
    .from('extension_data')
    .select('value')
    .eq('user_id', userId)
    .eq('extension_id', 'push-notifications')
    .eq('key', 'settings')
    .single()

  if (!data?.value) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...(data.value as Partial<PushNotificationSettings>) }
}

export async function saveSettings(
  userId: string,
  partial: Partial<PushNotificationSettings>
): Promise<PushNotificationSettings> {
  const current = await getSettings(userId)
  const merged = { ...current, ...partial }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  await supabase
    .from('extension_data')
    .upsert(
      {
        user_id: userId,
        extension_id: 'push-notifications',
        key: 'settings',
        value: merged,
      },
      { onConflict: 'user_id,extension_id,key' }
    )

  return merged
}

// ============================================================
// Event Handlers
// ============================================================

async function handlePeriodLocked(
  payload: EventPayload<'period.locked'>,
  ctx?: ExtensionContext
): Promise<void> {
  const { period, userId } = payload

  const settings = ctx ? await getSettingsViaCtx(ctx) : await getSettings(userId)
  if (!settings.periodLockedEnabled) return

  const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
  const notificationPayload = createPeriodLockedPayload(period.name, period.id)

  const result = await sendNotificationToUser(
    supabase,
    userId,
    notificationPayload,
    'period_locked',
    period.id
  )

  if (result.sent) {
    (ctx?.log ?? console).info(`Period locked notification sent for ${period.name}`)
  }
}

async function handleYearClosed(
  payload: EventPayload<'period.year_closed'>,
  ctx?: ExtensionContext
): Promise<void> {
  const { period, userId } = payload

  const settings = ctx ? await getSettingsViaCtx(ctx) : await getSettings(userId)
  if (!settings.periodYearClosedEnabled) return

  const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
  const notificationPayload = createYearClosedPayload(period.name, period.id)

  const result = await sendNotificationToUser(
    supabase,
    userId,
    notificationPayload,
    'period_year_closed',
    period.id
  )

  if (result.sent) {
    (ctx?.log ?? console).info(`Year closed notification sent for ${period.name}`)
  }
}

async function handleInvoiceSent(
  payload: EventPayload<'invoice.sent'>,
  ctx?: ExtensionContext
): Promise<void> {
  const { invoice, userId } = payload

  const settings = ctx ? await getSettingsViaCtx(ctx) : await getSettings(userId)
  if (!settings.invoiceSentEnabled) return

  const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
  const notificationPayload = createInvoiceSentPayload(
    invoice.invoice_number,
    invoice.id
  )

  const result = await sendNotificationToUser(
    supabase,
    userId,
    notificationPayload,
    'invoice_sent',
    invoice.id
  )

  if (result.sent) {
    (ctx?.log ?? console).info(`Invoice sent notification for #${invoice.invoice_number}`)
  }
}

async function handleReceiptExtracted(
  payload: EventPayload<'receipt.extracted'>,
  ctx?: ExtensionContext
): Promise<void> {
  const { receipt, userId } = payload

  const settings = ctx ? await getSettingsViaCtx(ctx) : await getSettings(userId)
  if (!settings.receiptExtractedEnabled) return

  const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
  const notificationPayload = createReceiptExtractedPayload(
    receipt.merchant_name,
    receipt.id
  )

  const result = await sendNotificationToUser(
    supabase,
    userId,
    notificationPayload,
    'receipt_extracted',
    receipt.id
  )

  if (result.sent) {
    (ctx?.log ?? console).info(`Receipt extracted notification for ${receipt.id}`)
  }
}

async function handleReceiptMatched(
  payload: EventPayload<'receipt.matched'>,
  ctx?: ExtensionContext
): Promise<void> {
  const { receipt, transaction, userId } = payload

  const settings = ctx ? await getSettingsViaCtx(ctx) : await getSettings(userId)
  if (!settings.receiptMatchedEnabled) return

  const supabase = ctx?.supabase ?? await (await import('@/lib/supabase/server')).createClient()
  const notificationPayload = createReceiptMatchedPayload(receipt.id, transaction.id)

  const result = await sendNotificationToUser(
    supabase,
    userId,
    notificationPayload,
    'receipt_matched',
    receipt.id
  )

  if (result.sent) {
    (ctx?.log ?? console).info(`Receipt matched notification for ${receipt.id}`)
  }
}

// ============================================================
// Extension Object
// ============================================================

export const pushNotificationsExtension: Extension = {
  id: 'push-notifications',
  name: 'Push-notiser',
  version: '1.0.0',
  eventHandlers: [
    { eventType: 'period.locked', handler: handlePeriodLocked },
    { eventType: 'period.year_closed', handler: handleYearClosed },
    { eventType: 'invoice.sent', handler: handleInvoiceSent },
    { eventType: 'receipt.extracted', handler: handleReceiptExtracted },
    { eventType: 'receipt.matched', handler: handleReceiptMatched },
  ],
  settingsPanel: {
    label: 'Push-notiser',
    path: '/settings/extensions/push-notifications',
  },
  async onInstall(ctx) {
    await ctx.settings.set('settings', DEFAULT_SETTINGS)
  },
}
