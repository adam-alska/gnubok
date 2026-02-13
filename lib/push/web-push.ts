/**
 * Web Push configuration and sending utilities
 */

import webpush from 'web-push'

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@influencer-biz.se'

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

/**
 * Push subscription keys from the browser
 */
export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Notification payload
 */
export interface NotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: {
    url?: string
    type?: string
    id?: string
  }
  actions?: Array<{
    action: string
    title: string
    icon?: string
  }>
}

/**
 * Send a push notification to a subscription
 */
export async function sendPushNotification(
  subscription: PushSubscriptionKeys,
  payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID keys not configured')
    return { success: false, error: 'VAPID keys not configured' }
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  }

  try {
    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 86400, // 24 hours
        urgency: 'normal',
      }
    )
    return { success: true }
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string }

    // Handle subscription gone (user unsubscribed)
    if (err.statusCode === 410) {
      return { success: false, error: 'subscription_gone' }
    }

    console.error('Push notification error:', err)
    return { success: false, error: err.message || 'Unknown error' }
  }
}

/**
 * Send push notifications to multiple subscriptions
 */
export async function sendPushToMultiple(
  subscriptions: PushSubscriptionKeys[],
  payload: NotificationPayload
): Promise<{
  successful: number
  failed: number
  goneSubscriptions: string[]
}> {
  let successful = 0
  let failed = 0
  const goneSubscriptions: string[] = []

  const results = await Promise.allSettled(
    subscriptions.map((sub) => sendPushNotification(sub, payload))
  )

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success) {
      successful++
    } else {
      failed++
      if (result.status === 'fulfilled' && result.value.error === 'subscription_gone') {
        goneSubscriptions.push(subscriptions[index].endpoint)
      }
    }
  })

  return { successful, failed, goneSubscriptions }
}

/**
 * Get the public VAPID key for client-side subscription
 */
export function getVapidPublicKey(): string | null {
  return vapidPublicKey || null
}

/**
 * Create notification payload for tax deadline
 */
export function createTaxDeadlinePayload(
  title: string,
  dueDate: string,
  daysUntil: number,
  deadlineId: string
): NotificationPayload {
  const urgencyText = daysUntil === 0 ? 'IDAG!' : daysUntil === 1 ? 'imorgon' : `om ${daysUntil} dagar`

  return {
    title: `📋 ${title}`,
    body: `Deadline ${urgencyText} (${formatDate(dueDate)})`,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: `tax-deadline-${deadlineId}`,
    data: {
      url: '/calendar',
      type: 'tax_deadline',
      id: deadlineId,
    },
    actions: [
      { action: 'view', title: 'Visa' },
      { action: 'dismiss', title: 'Avfärda' },
    ],
  }
}

/**
 * Create notification payload for invoice reminder
 */
export function createInvoicePayload(
  invoiceNumber: string,
  customerName: string,
  amount: number,
  dueDate: string,
  isOverdue: boolean,
  invoiceId: string
): NotificationPayload {
  const title = isOverdue
    ? `⚠️ Obetald faktura #${invoiceNumber}`
    : `💰 Faktura #${invoiceNumber} förfaller`

  const body = isOverdue
    ? `${customerName} - ${amount.toLocaleString('sv-SE')} kr (förföll ${formatDate(dueDate)})`
    : `${customerName} - ${amount.toLocaleString('sv-SE')} kr (${formatDate(dueDate)})`

  return {
    title,
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: `invoice-${invoiceId}`,
    data: {
      url: `/invoices/${invoiceId}`,
      type: isOverdue ? 'invoice_overdue' : 'invoice_due',
      id: invoiceId,
    },
    actions: [
      { action: 'view', title: 'Visa faktura' },
    ],
  }
}

/**
 * Create notification payload for campaign deadline
 */
export function createCampaignDeadlinePayload(
  campaignName: string,
  deliverableTitle: string,
  dueDate: string,
  daysUntil: number,
  deadlineId: string
): NotificationPayload {
  const urgencyText = daysUntil === 0 ? 'IDAG!' : daysUntil === 1 ? 'imorgon' : `om ${daysUntil} dagar`

  return {
    title: `🎬 ${campaignName}`,
    body: `${deliverableTitle} - leverans ${urgencyText}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: `campaign-deadline-${deadlineId}`,
    data: {
      url: '/calendar',
      type: 'campaign_deadline',
      id: deadlineId,
    },
    actions: [
      { action: 'view', title: 'Visa' },
    ],
  }
}

/**
 * Format date for notifications
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  })
}
