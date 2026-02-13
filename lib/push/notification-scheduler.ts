/**
 * Notification scheduling and quiet hours handling
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  sendPushToMultiple,
  createTaxDeadlinePayload,
  createInvoicePayload,
  createCampaignDeadlinePayload,
  type PushSubscriptionKeys,
} from './web-push'
import type { NotificationSettings, NotificationType } from '@/types'

/**
 * Check if current time is within quiet hours (Sweden timezone)
 */
export function isWithinQuietHours(
  settings: NotificationSettings,
  now: Date = new Date()
): boolean {
  // Convert to Sweden timezone
  const swedenTime = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)

  const [hours, minutes] = swedenTime.split(':').map(Number)
  const currentMinutes = hours * 60 + minutes

  // Parse quiet hours
  const [startHours, startMinutes] = settings.quiet_start.split(':').map(Number)
  const [endHours, endMinutes] = settings.quiet_end.split(':').map(Number)

  const quietStartMinutes = startHours * 60 + startMinutes
  const quietEndMinutes = endHours * 60 + endMinutes

  // Handle overnight quiet hours (e.g., 21:00 to 08:00)
  if (quietStartMinutes > quietEndMinutes) {
    // Quiet if after start OR before end
    return currentMinutes >= quietStartMinutes || currentMinutes < quietEndMinutes
  }

  // Normal range (e.g., 01:00 to 06:00)
  return currentMinutes >= quietStartMinutes && currentMinutes < quietEndMinutes
}

/**
 * Check if a notification has already been sent (prevent duplicates)
 */
async function wasNotificationSent(
  supabase: SupabaseClient,
  userId: string,
  notificationType: NotificationType,
  referenceId: string,
  daysBefore: number
): Promise<boolean> {
  const { data } = await supabase
    .from('notification_log')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', notificationType)
    .eq('reference_id', referenceId)
    .eq('days_before', daysBefore)
    .single()

  return !!data
}

/**
 * Log a sent notification
 */
async function logNotification(
  supabase: SupabaseClient,
  userId: string,
  notificationType: NotificationType,
  referenceId: string,
  daysBefore: number
): Promise<void> {
  await supabase.from('notification_log').insert({
    user_id: userId,
    notification_type: notificationType,
    reference_id: referenceId,
    days_before: daysBefore,
    delivery_status: 'sent',
  })
}

/**
 * Get user's push subscriptions
 */
async function getUserSubscriptions(
  supabase: SupabaseClient,
  userId: string
): Promise<PushSubscriptionKeys[]> {
  const { data } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('is_active', true)

  return data || []
}

/**
 * Get user's notification settings
 */
async function getUserNotificationSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<NotificationSettings | null> {
  const { data } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  return data
}

/**
 * Disable gone (unsubscribed) push subscriptions
 */
async function disableGoneSubscriptions(
  supabase: SupabaseClient,
  endpoints: string[]
): Promise<void> {
  if (endpoints.length === 0) return

  await supabase
    .from('push_subscriptions')
    .update({ is_active: false })
    .in('endpoint', endpoints)
}

/**
 * Send tax deadline notifications
 */
export async function sendTaxDeadlineNotifications(
  supabase: SupabaseClient
): Promise<{ sent: number; skipped: number }> {
  let sent = 0
  let skipped = 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  // Calculate dates for 7 days and 1 day before
  const in7Days = new Date(today)
  in7Days.setDate(in7Days.getDate() + 7)
  const in7DaysStr = in7Days.toISOString().split('T')[0]

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // Fetch tax deadlines due in 7 days or 1 day
  const { data: deadlines } = await supabase
    .from('deadlines')
    .select('id, user_id, title, due_date')
    .eq('deadline_type', 'tax')
    .eq('is_completed', false)
    .in('status', ['upcoming', 'action_needed'])
    .in('due_date', [in7DaysStr, tomorrowStr, todayStr])

  if (!deadlines || deadlines.length === 0) {
    return { sent: 0, skipped: 0 }
  }

  // Group by user
  const userDeadlines = new Map<string, typeof deadlines>()
  for (const deadline of deadlines) {
    const list = userDeadlines.get(deadline.user_id) || []
    list.push(deadline)
    userDeadlines.set(deadline.user_id, list)
  }

  for (const [userId, userDls] of userDeadlines) {
    // Get user settings
    const settings = await getUserNotificationSettings(supabase, userId)

    // Skip if tax deadlines disabled
    if (settings && !settings.tax_deadlines_enabled) {
      skipped += userDls.length
      continue
    }

    // Skip if push disabled
    if (settings && !settings.push_enabled) {
      skipped += userDls.length
      continue
    }

    // Skip if within quiet hours
    if (settings && isWithinQuietHours(settings)) {
      skipped += userDls.length
      continue
    }

    // Get subscriptions
    const subscriptions = await getUserSubscriptions(supabase, userId)
    if (subscriptions.length === 0) {
      skipped += userDls.length
      continue
    }

    for (const deadline of userDls) {
      const daysUntil = Math.ceil(
        (new Date(deadline.due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Check if already sent for this day count
      const alreadySent = await wasNotificationSent(
        supabase,
        userId,
        'tax_deadline',
        deadline.id,
        daysUntil
      )

      if (alreadySent) {
        skipped++
        continue
      }

      // Create and send notification
      const payload = createTaxDeadlinePayload(
        deadline.title,
        deadline.due_date,
        daysUntil,
        deadline.id
      )

      const result = await sendPushToMultiple(subscriptions, payload)

      // Log the notification
      await logNotification(supabase, userId, 'tax_deadline', deadline.id, daysUntil)

      // Disable gone subscriptions
      if (result.goneSubscriptions.length > 0) {
        await disableGoneSubscriptions(supabase, result.goneSubscriptions)
      }

      if (result.successful > 0) {
        sent++
      } else {
        skipped++
      }
    }
  }

  return { sent, skipped }
}

/**
 * Send invoice reminder notifications
 */
export async function sendInvoiceNotifications(
  supabase: SupabaseClient
): Promise<{ sent: number; skipped: number }> {
  let sent = 0
  let skipped = 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  // Calculate dates
  const in3Days = new Date(today)
  in3Days.setDate(in3Days.getDate() + 3)
  const in3DaysStr = in3Days.toISOString().split('T')[0]

  const daysAgo3 = new Date(today)
  daysAgo3.setDate(daysAgo3.getDate() - 3)
  const daysAgo3Str = daysAgo3.toISOString().split('T')[0]

  const daysAgo7 = new Date(today)
  daysAgo7.setDate(daysAgo7.getDate() - 7)
  const daysAgo7Str = daysAgo7.toISOString().split('T')[0]

  // Fetch invoices: due soon (3d, 0d) or overdue (+3d, +7d)
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, user_id, invoice_number, total, due_date, customer:customers(name)')
    .in('status', ['sent', 'overdue'])
    .in('due_date', [in3DaysStr, todayStr, daysAgo3Str, daysAgo7Str])

  if (!invoices || invoices.length === 0) {
    return { sent: 0, skipped: 0 }
  }

  // Group by user
  const userInvoices = new Map<string, typeof invoices>()
  for (const invoice of invoices) {
    const list = userInvoices.get(invoice.user_id) || []
    list.push(invoice)
    userInvoices.set(invoice.user_id, list)
  }

  for (const [userId, userInvs] of userInvoices) {
    const settings = await getUserNotificationSettings(supabase, userId)

    if (settings && !settings.invoice_reminders_enabled) {
      skipped += userInvs.length
      continue
    }

    if (settings && !settings.push_enabled) {
      skipped += userInvs.length
      continue
    }

    if (settings && isWithinQuietHours(settings)) {
      skipped += userInvs.length
      continue
    }

    const subscriptions = await getUserSubscriptions(supabase, userId)
    if (subscriptions.length === 0) {
      skipped += userInvs.length
      continue
    }

    for (const invoice of userInvs) {
      const dueDate = new Date(invoice.due_date)
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      const isOverdue = daysUntil < 0

      const notificationType: NotificationType = isOverdue ? 'invoice_overdue' : 'invoice_due'

      const alreadySent = await wasNotificationSent(
        supabase,
        userId,
        notificationType,
        invoice.id,
        Math.abs(daysUntil)
      )

      if (alreadySent) {
        skipped++
        continue
      }

      // customer is a single object from the join, but TypeScript sees it as an array from select()
      const customer = invoice.customer as unknown as { name: string } | null
      const customerName = customer?.name || 'Okänd kund'

      const payload = createInvoicePayload(
        invoice.invoice_number,
        customerName,
        invoice.total,
        invoice.due_date,
        isOverdue,
        invoice.id
      )

      const result = await sendPushToMultiple(subscriptions, payload)

      await logNotification(supabase, userId, notificationType, invoice.id, Math.abs(daysUntil))

      if (result.goneSubscriptions.length > 0) {
        await disableGoneSubscriptions(supabase, result.goneSubscriptions)
      }

      if (result.successful > 0) {
        sent++
      } else {
        skipped++
      }
    }
  }

  return { sent, skipped }
}

/**
 * Send campaign deadline notifications
 */
export async function sendCampaignNotifications(
  supabase: SupabaseClient
): Promise<{ sent: number; skipped: number }> {
  let sent = 0
  let skipped = 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const in3Days = new Date(today)
  in3Days.setDate(in3Days.getDate() + 3)
  const in3DaysStr = in3Days.toISOString().split('T')[0]

  // Fetch campaign deadlines due in 3 days or today
  const { data: deadlines } = await supabase
    .from('deadlines')
    .select('id, user_id, title, due_date, campaign:campaigns(name)')
    .neq('deadline_type', 'tax')
    .not('campaign_id', 'is', null)
    .eq('is_completed', false)
    .in('due_date', [in3DaysStr, todayStr])

  if (!deadlines || deadlines.length === 0) {
    return { sent: 0, skipped: 0 }
  }

  // Group by user
  const userDeadlines = new Map<string, typeof deadlines>()
  for (const deadline of deadlines) {
    const list = userDeadlines.get(deadline.user_id) || []
    list.push(deadline)
    userDeadlines.set(deadline.user_id, list)
  }

  for (const [userId, userDls] of userDeadlines) {
    const settings = await getUserNotificationSettings(supabase, userId)

    if (settings && !settings.campaign_deadlines_enabled) {
      skipped += userDls.length
      continue
    }

    if (settings && !settings.push_enabled) {
      skipped += userDls.length
      continue
    }

    if (settings && isWithinQuietHours(settings)) {
      skipped += userDls.length
      continue
    }

    const subscriptions = await getUserSubscriptions(supabase, userId)
    if (subscriptions.length === 0) {
      skipped += userDls.length
      continue
    }

    for (const deadline of userDls) {
      const daysUntil = Math.ceil(
        (new Date(deadline.due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )

      const alreadySent = await wasNotificationSent(
        supabase,
        userId,
        'campaign_deadline',
        deadline.id,
        daysUntil
      )

      if (alreadySent) {
        skipped++
        continue
      }

      // campaign is a single object from the join, but TypeScript sees it as an array from select()
      const campaign = deadline.campaign as unknown as { name: string } | null
      const campaignName = campaign?.name || 'Kampanj'

      const payload = createCampaignDeadlinePayload(
        campaignName,
        deadline.title,
        deadline.due_date,
        daysUntil,
        deadline.id
      )

      const result = await sendPushToMultiple(subscriptions, payload)

      await logNotification(supabase, userId, 'campaign_deadline', deadline.id, daysUntil)

      if (result.goneSubscriptions.length > 0) {
        await disableGoneSubscriptions(supabase, result.goneSubscriptions)
      }

      if (result.successful > 0) {
        sent++
      } else {
        skipped++
      }
    }
  }

  return { sent, skipped }
}
