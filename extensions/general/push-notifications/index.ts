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

import { createClient } from '@/lib/supabase/server'
import type { Extension } from '@/lib/extensions/types'
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

export async function getSettings(userId: string): Promise<PushNotificationSettings> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('notification_settings')
    .select(
      'period_locked_enabled, period_year_closed_enabled, invoice_sent_enabled, receipt_extracted_enabled, receipt_matched_enabled'
    )
    .eq('user_id', userId)
    .single()

  if (!data) return { ...DEFAULT_SETTINGS }

  return {
    periodLockedEnabled: data.period_locked_enabled ?? DEFAULT_SETTINGS.periodLockedEnabled,
    periodYearClosedEnabled: data.period_year_closed_enabled ?? DEFAULT_SETTINGS.periodYearClosedEnabled,
    invoiceSentEnabled: data.invoice_sent_enabled ?? DEFAULT_SETTINGS.invoiceSentEnabled,
    receiptExtractedEnabled: data.receipt_extracted_enabled ?? DEFAULT_SETTINGS.receiptExtractedEnabled,
    receiptMatchedEnabled: data.receipt_matched_enabled ?? DEFAULT_SETTINGS.receiptMatchedEnabled,
  }
}

export async function saveSettings(
  userId: string,
  partial: Partial<PushNotificationSettings>
): Promise<PushNotificationSettings> {
  const current = await getSettings(userId)
  const merged = { ...current, ...partial }

  const supabase = await createClient()

  await supabase
    .from('notification_settings')
    .upsert(
      {
        user_id: userId,
        period_locked_enabled: merged.periodLockedEnabled,
        period_year_closed_enabled: merged.periodYearClosedEnabled,
        invoice_sent_enabled: merged.invoiceSentEnabled,
        receipt_extracted_enabled: merged.receiptExtractedEnabled,
        receipt_matched_enabled: merged.receiptMatchedEnabled,
      },
      { onConflict: 'user_id' }
    )

  return merged
}

// ============================================================
// Event Handlers
// ============================================================

async function handlePeriodLocked(
  payload: EventPayload<'period.locked'>
): Promise<void> {
  const { period, userId } = payload

  const settings = await getSettings(userId)
  if (!settings.periodLockedEnabled) return

  const supabase = await createClient()
  const notificationPayload = createPeriodLockedPayload(period.name, period.id)

  const result = await sendNotificationToUser(
    supabase,
    userId,
    notificationPayload,
    'period_locked',
    period.id
  )

  if (result.sent) {
    console.log(`[push-notifications] Period locked notification sent for ${period.name}`)
  }
}

async function handleYearClosed(
  payload: EventPayload<'period.year_closed'>
): Promise<void> {
  const { period, userId } = payload

  const settings = await getSettings(userId)
  if (!settings.periodYearClosedEnabled) return

  const supabase = await createClient()
  const notificationPayload = createYearClosedPayload(period.name, period.id)

  const result = await sendNotificationToUser(
    supabase,
    userId,
    notificationPayload,
    'period_year_closed',
    period.id
  )

  if (result.sent) {
    console.log(`[push-notifications] Year closed notification sent for ${period.name}`)
  }
}

async function handleInvoiceSent(
  payload: EventPayload<'invoice.sent'>
): Promise<void> {
  const { invoice, userId } = payload

  const settings = await getSettings(userId)
  if (!settings.invoiceSentEnabled) return

  const supabase = await createClient()
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
    console.log(`[push-notifications] Invoice sent notification for #${invoice.invoice_number}`)
  }
}

async function handleReceiptExtracted(
  payload: EventPayload<'receipt.extracted'>
): Promise<void> {
  const { receipt, userId } = payload

  const settings = await getSettings(userId)
  if (!settings.receiptExtractedEnabled) return

  const supabase = await createClient()
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
    console.log(`[push-notifications] Receipt extracted notification for ${receipt.id}`)
  }
}

async function handleReceiptMatched(
  payload: EventPayload<'receipt.matched'>
): Promise<void> {
  const { receipt, transaction, userId } = payload

  const settings = await getSettings(userId)
  if (!settings.receiptMatchedEnabled) return

  const supabase = await createClient()
  const notificationPayload = createReceiptMatchedPayload(receipt.id, transaction.id)

  const result = await sendNotificationToUser(
    supabase,
    userId,
    notificationPayload,
    'receipt_matched',
    receipt.id
  )

  if (result.sent) {
    console.log(`[push-notifications] Receipt matched notification for ${receipt.id}`)
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
    const supabase = await createClient()

    // Ensure a notification_settings row exists for this user
    await supabase
      .from('notification_settings')
      .upsert(
        {
          user_id: ctx.userId,
          period_locked_enabled: DEFAULT_SETTINGS.periodLockedEnabled,
          period_year_closed_enabled: DEFAULT_SETTINGS.periodYearClosedEnabled,
          invoice_sent_enabled: DEFAULT_SETTINGS.invoiceSentEnabled,
          receipt_extracted_enabled: DEFAULT_SETTINGS.receiptExtractedEnabled,
          receipt_matched_enabled: DEFAULT_SETTINGS.receiptMatchedEnabled,
        },
        { onConflict: 'user_id' }
      )
  },
}
