// Push subscription for Web Push API
export interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

// Notification settings per user
export interface NotificationSettings {
  id: string
  user_id: string
  tax_deadlines_enabled: boolean
  invoice_reminders_enabled: boolean
  quiet_start: string // time format "HH:MM"
  quiet_end: string   // time format "HH:MM"
  email_enabled: boolean
  push_enabled: boolean
  period_locked_enabled: boolean
  period_year_closed_enabled: boolean
  invoice_sent_enabled: boolean
  receipt_extracted_enabled: boolean
  receipt_matched_enabled: boolean
  created_at: string
  updated_at: string
}

// Notification type for logging
export type NotificationType =
  | 'tax_deadline'
  | 'invoice_due'
  | 'invoice_overdue'
  | 'period_locked'
  | 'period_year_closed'
  | 'receipt_extracted'
  | 'receipt_matched'
  | 'invoice_sent'

// Notification log entry
export interface NotificationLog {
  id: string
  user_id: string
  notification_type: NotificationType
  reference_id: string
  days_before: number
  sent_at: string
  delivery_status: 'sent' | 'delivered' | 'failed'
}
