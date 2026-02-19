import { createServerClient } from '@supabase/ssr'
import { sendEmail } from '@/lib/email/resend'
import {
  generateReminderEmailHtml,
  generateReminderEmailText,
  generateReminderEmailSubject,
  getReminderDaysConfig
} from '@/lib/email/reminder-templates'
import { logger } from '@/lib/logger'
import type { Invoice, Customer, CompanySettings } from '@/types'

// Create a service client for cron jobs (no cookie access needed)
function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() { }
      }
    }
  )
}

export interface ReminderResult {
  invoiceId: string
  invoiceNumber: string
  customerEmail: string
  reminderLevel: 1 | 2 | 3
  success: boolean
  error?: string
}

export interface ProcessRemindersResult {
  processed: number
  sent: number
  failed: number
  results: ReminderResult[]
}

/**
 * Determine which reminder level should be sent based on days overdue
 * Returns null if no reminder should be sent
 */
export function determineReminderLevel(
  daysOverdue: number,
  existingLevels: number[]
): 1 | 2 | 3 | null {
  const config = getReminderDaysConfig()

  // Check level 3 (45 days)
  if (daysOverdue >= config[3] && !existingLevels.includes(3)) {
    return 3
  }

  // Check level 2 (30 days)
  if (daysOverdue >= config[2] && !existingLevels.includes(2)) {
    return 2
  }

  // Check level 1 (15 days)
  if (daysOverdue >= config[1] && !existingLevels.includes(1)) {
    return 1
  }

  return null
}

/**
 * Calculate days overdue from due date
 */
export function calculateDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate)
  const now = new Date()
  const diffTime = now.getTime() - due.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return diffDays
}

/**
 * Send a single reminder email
 */
export async function sendReminder(
  invoice: Invoice & { customer: Customer },
  company: CompanySettings,
  reminderLevel: 1 | 2 | 3,
  actionToken: string
): Promise<{ success: boolean; error?: string }> {
  const customer = invoice.customer

  if (!customer.email) {
    return { success: false, error: 'Customer has no email' }
  }

  const daysOverdue = calculateDaysOverdue(invoice.due_date)

  // Build action URL (public page for customer response)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.erp-base.se'
  const actionUrl = `${baseUrl}/invoice-action/${actionToken}`

  const emailData = {
    invoice,
    customer,
    company,
    reminderLevel,
    daysOverdue,
    actionUrl
  }

  const result = await sendEmail({
    to: customer.email,
    subject: generateReminderEmailSubject(emailData),
    html: generateReminderEmailHtml(emailData),
    text: generateReminderEmailText(emailData),
    replyTo: (company as CompanySettings & { email?: string }).email || undefined,
    fromName: company.company_name || undefined
  })

  return result
}

/**
 * Process all overdue invoices and send reminders
 * This is the main function called by the cron job
 */
export async function processOverdueReminders(): Promise<ProcessRemindersResult> {
  const supabase = createServiceClient()
  const results: ReminderResult[] = []
  const config = getReminderDaysConfig()

  // Find all sent invoices that are past due date (at least 15 days overdue)
  const minOverdueDays = config[1]
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - minOverdueDays)

  const { data: overdueInvoices, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(*)
    `)
    .eq('status', 'sent')
    .lte('due_date', cutoffDate.toISOString().split('T')[0])
    .order('due_date', { ascending: true })

  if (invoiceError) {
    logger.error('reminder-processor', 'Error fetching overdue invoices', { error: invoiceError.message })
    return { processed: 0, sent: 0, failed: 0, results: [] }
  }

  if (!overdueInvoices || overdueInvoices.length === 0) {
    logger.info('reminder-processor', 'No overdue invoices found')
    return { processed: 0, sent: 0, failed: 0, results: [] }
  }

  logger.info('reminder-processor', 'Found overdue invoices to process', { count: overdueInvoices.length })

  // Process each invoice
  for (const invoice of overdueInvoices) {
    const customer = invoice.customer as Customer

    // Skip if customer has no email
    if (!customer?.email) {
      logger.info('reminder-processor', 'Skipping invoice: customer has no email', { invoiceNumber: invoice.invoice_number })
      continue
    }

    // Get existing reminders for this invoice
    const { data: existingReminders } = await supabase
      .from('invoice_reminders')
      .select('reminder_level')
      .eq('invoice_id', invoice.id)

    const existingLevels = existingReminders?.map(r => r.reminder_level) || []
    const daysOverdue = calculateDaysOverdue(invoice.due_date)
    const reminderLevel = determineReminderLevel(daysOverdue, existingLevels)

    // Skip if no reminder needed
    if (!reminderLevel) {
      logger.info('reminder-processor', 'Skipping invoice: no reminder needed', { invoiceNumber: invoice.invoice_number, daysOverdue, existingLevels })
      continue
    }

    // Get company settings for this user
    const { data: company, error: companyError } = await supabase
      .from('company_settings')
      .select('*')
      .eq('user_id', invoice.user_id)
      .single()

    if (companyError || !company) {
      logger.error('reminder-processor', 'Skipping invoice: company settings not found', { invoiceNumber: invoice.invoice_number })
      results.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerEmail: customer.email,
        reminderLevel,
        success: false,
        error: 'Company settings not found'
      })
      continue
    }

    // Create reminder record first (to get action token)
    const { data: reminderRecord, error: reminderError } = await supabase
      .from('invoice_reminders')
      .insert({
        invoice_id: invoice.id,
        user_id: invoice.user_id,
        reminder_level: reminderLevel,
        email_to: customer.email
      })
      .select('action_token')
      .single()

    if (reminderError || !reminderRecord) {
      logger.error('reminder-processor', 'Failed to create reminder record', { invoiceNumber: invoice.invoice_number, error: reminderError?.message })
      results.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerEmail: customer.email,
        reminderLevel,
        success: false,
        error: 'Failed to create reminder record'
      })
      continue
    }

    // Send the reminder email
    const sendResult = await sendReminder(
      invoice as Invoice & { customer: Customer },
      company as CompanySettings,
      reminderLevel,
      reminderRecord.action_token
    )

    if (sendResult.success) {
      logger.info('reminder-processor', 'Sent reminder', { level: reminderLevel, invoiceNumber: invoice.invoice_number, email: customer.email })

      // Update invoice status to overdue if not already
      if (invoice.status === 'sent') {
        await supabase
          .from('invoices')
          .update({ status: 'overdue' })
          .eq('id', invoice.id)
      }
    } else {
      logger.error('reminder-processor', 'Failed to send reminder', { invoiceNumber: invoice.invoice_number, error: sendResult.error })
    }

    results.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      customerEmail: customer.email,
      reminderLevel,
      success: sendResult.success,
      error: sendResult.error
    })
  }

  const sent = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length

  return {
    processed: results.length,
    sent,
    failed,
    results
  }
}
