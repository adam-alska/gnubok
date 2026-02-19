/**
 * Recurring Invoice Engine
 *
 * Handles scheduling and generation of recurring invoices.
 */

import type { RecurringFrequency, RecurringInvoice } from '@/types/invoices-enhanced'

/**
 * Calculate the next invoice date based on frequency and interval.
 *
 * @param frequency - How often to generate (weekly, monthly, etc.)
 * @param intervalCount - How many units between each generation (e.g., every 2 months)
 * @param lastDate - The last date from which to calculate
 * @returns The next date as a Date object
 */
export function calculateNextDate(
  frequency: RecurringFrequency,
  intervalCount: number,
  lastDate: Date
): Date {
  const next = new Date(lastDate)

  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7 * intervalCount)
      break
    case 'monthly':
      next.setMonth(next.getMonth() + intervalCount)
      break
    case 'quarterly':
      next.setMonth(next.getMonth() + 3 * intervalCount)
      break
    case 'semi_annually':
      next.setMonth(next.getMonth() + 6 * intervalCount)
      break
    case 'annually':
      next.setFullYear(next.getFullYear() + intervalCount)
      break
  }

  return next
}

/**
 * Format a date as YYYY-MM-DD string.
 */
function formatDateStr(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Generate an invoice from a recurring invoice template.
 *
 * Creates a real invoice record in the database using the template data
 * from the recurring invoice, then updates the recurring invoice's
 * next_invoice_date and generated_count.
 *
 * @param recurringInvoice - The recurring invoice template
 * @param supabase - Supabase client instance
 * @returns The created invoice data or null on failure
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateInvoiceFromRecurring(
  recurringInvoice: RecurringInvoice,
  supabase: any
) {
  const today = new Date()
  const invoiceDate = formatDateStr(today)

  // Calculate due date from payment terms
  const dueDate = new Date(today)
  dueDate.setDate(dueDate.getDate() + recurringInvoice.payment_terms_days)
  const dueDateStr = formatDateStr(dueDate)

  // Calculate totals from items
  const items = recurringInvoice.items || []
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const vatRate = recurringInvoice.vat_rate ?? 25
  const vatAmount = subtotal * (vatRate / 100)
  const total = subtotal + vatAmount

  // Prepare invoice data
  const invoiceData = {
    user_id: recurringInvoice.user_id,
    customer_id: recurringInvoice.customer_id,
    invoice_date: invoiceDate,
    due_date: dueDateStr,
    currency: recurringInvoice.currency,
    subtotal,
    vat_amount: vatAmount,
    total,
    vat_treatment: recurringInvoice.vat_treatment || 'standard_25',
    vat_rate: vatRate,
    your_reference: recurringInvoice.your_reference || null,
    our_reference: recurringInvoice.our_reference || null,
    notes: recurringInvoice.notes || null,
    is_recurring: true,
    recurring_invoice_id: recurringInvoice.id,
  }

  // Prepare items data
  const itemsData = items.map((item, index) => ({
    sort_order: index,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    line_total: item.quantity * item.unit_price,
  }))

  // Create invoice using the same RPC as manual invoice creation
  const { data: invoiceResult, error: rpcError } = await supabase.rpc('create_invoice_with_items', {
    p_invoice: invoiceData,
    p_items: itemsData,
  })

  if (rpcError || !invoiceResult) {
    console.error('Failed to generate recurring invoice:', rpcError?.message)
    return null
  }

  // Calculate next invoice date
  const currentNextDate = new Date(recurringInvoice.next_invoice_date)
  const nextDate = calculateNextDate(
    recurringInvoice.frequency,
    recurringInvoice.interval_count,
    currentNextDate
  )

  // Check if next date exceeds end date
  const endDate = recurringInvoice.end_date ? new Date(recurringInvoice.end_date) : null
  const isStillActive = !endDate || nextDate <= endDate

  // Update the recurring invoice
  await supabase
    .from('recurring_invoices')
    .update({
      next_invoice_date: formatDateStr(nextDate),
      last_generated_date: invoiceDate,
      generated_count: recurringInvoice.generated_count + 1,
      is_active: isStillActive,
    })
    .eq('id', recurringInvoice.id)

  return invoiceResult
}

/**
 * Process all due recurring invoices.
 *
 * Finds all active recurring invoices whose next_invoice_date is today or earlier,
 * and generates invoices for each one. Designed to be called from a cron job.
 *
 * @param supabase - Supabase client instance
 * @returns Summary of processing results
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processRecurringInvoices(supabase: any) {
  const today = formatDateStr(new Date())

  // Find all active recurring invoices that are due
  const { data: dueInvoices, error } = await supabase
    .from('recurring_invoices')
    .select('*, customer:customers(*)')
    .eq('is_active', true)
    .lte('next_invoice_date', today)

  if (error) {
    console.error('Failed to fetch due recurring invoices:', error.message)
    return { processed: 0, failed: 0, errors: [error.message] }
  }

  if (!dueInvoices || dueInvoices.length === 0) {
    return { processed: 0, failed: 0, errors: [] }
  }

  let processed = 0
  let failed = 0
  const errors: string[] = []

  for (const recurringInvoice of dueInvoices) {
    try {
      const result = await generateInvoiceFromRecurring(
        recurringInvoice as RecurringInvoice,
        supabase
      )
      if (result) {
        processed++
      } else {
        failed++
        errors.push(`Failed to generate invoice for template: ${recurringInvoice.template_name}`)
      }
    } catch (err) {
      failed++
      errors.push(`Error processing ${recurringInvoice.template_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return { processed, failed, errors }
}
