/**
 * Payment Tracker for Campaigns
 *
 * Tracks invoice payments and expected payment dates.
 */

import type { Invoice, Campaign, Customer, PaymentStatus } from '@/types'

/**
 * Calculate expected payment date based on invoice and customer history
 */
export function calculateExpectedPaymentDate(
  invoice: Invoice,
  customer?: Customer
): string {
  // Start with the invoice due date
  const dueDate = new Date(invoice.due_date)

  // If customer has average payment days, adjust
  if (customer?.average_payment_days) {
    // Calculate difference from standard terms
    const standardDays = customer.default_payment_terms || 30
    const extraDays = customer.average_payment_days - standardDays

    // Add the typical "extra" days the customer usually takes
    if (extraDays > 0) {
      dueDate.setDate(dueDate.getDate() + extraDays)
    }
  }

  return dueDate.toISOString().split('T')[0]
}

/**
 * Determine payment status based on dates and existing status
 */
export function determinePaymentStatus(
  invoice: Invoice
): PaymentStatus {
  const today = new Date().toISOString().split('T')[0]

  // Already paid
  if (invoice.status === 'paid') return 'paid'

  // Check if overdue
  if (invoice.due_date < today && invoice.status === 'sent') {
    return 'overdue'
  }

  // Pending payment
  return 'pending'
}

/**
 * Calculate customer's average payment days based on history
 */
export function calculateAveragePaymentDays(
  invoices: Invoice[]
): number | null {
  const paidInvoices = invoices.filter(inv =>
    inv.status === 'paid' &&
    inv.paid_at &&
    inv.invoice_date
  )

  if (paidInvoices.length === 0) return null

  const paymentDays = paidInvoices.map(inv => {
    const invoiceDate = new Date(inv.invoice_date)
    const paidDate = new Date(inv.paid_at!)
    return Math.ceil((paidDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24))
  })

  const sum = paymentDays.reduce((a, b) => a + b, 0)
  return Math.round(sum / paymentDays.length)
}

/**
 * Get payment forecast for upcoming invoices
 */
export function getPaymentForecast(
  invoices: Invoice[],
  customers: Map<string, Customer>,
  daysAhead: number = 30
): {
  date: string
  invoices: Invoice[]
  expectedAmount: number
}[] {
  const today = new Date()
  const endDate = new Date()
  endDate.setDate(endDate.getDate() + daysAhead)

  const forecast: Map<string, { invoices: Invoice[]; expectedAmount: number }> = new Map()

  // Get unpaid invoices
  const unpaidInvoices = invoices.filter(inv =>
    inv.status === 'sent' || inv.status === 'overdue'
  )

  for (const invoice of unpaidInvoices) {
    const customer = customers.get(invoice.customer_id)
    const expectedDate = calculateExpectedPaymentDate(invoice, customer)

    // Only include if within forecast range
    if (expectedDate > endDate.toISOString().split('T')[0]) continue

    if (!forecast.has(expectedDate)) {
      forecast.set(expectedDate, { invoices: [], expectedAmount: 0 })
    }

    const entry = forecast.get(expectedDate)!
    entry.invoices.push(invoice)
    entry.expectedAmount += invoice.total
  }

  // Convert to sorted array
  return Array.from(forecast.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Calculate campaign invoicing status
 */
export function getCampaignInvoicingStatus(
  campaign: Campaign,
  invoices: Invoice[]
): {
  totalValue: number
  invoiced: number
  paid: number
  pending: number
  overdue: number
  invoicedPercentage: number
  paidPercentage: number
  remainingToInvoice: number
} {
  const totalValue = campaign.total_value || 0

  const invoiced = invoices.reduce((sum, inv) => sum + inv.total, 0)

  const paid = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.total, 0)

  const pending = invoices
    .filter(inv => inv.status === 'sent')
    .reduce((sum, inv) => sum + inv.total, 0)

  const overdue = invoices
    .filter(inv => inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.total, 0)

  return {
    totalValue,
    invoiced,
    paid,
    pending,
    overdue,
    invoicedPercentage: totalValue > 0 ? (invoiced / totalValue) * 100 : 0,
    paidPercentage: totalValue > 0 ? (paid / totalValue) * 100 : 0,
    remainingToInvoice: Math.max(0, totalValue - invoiced),
  }
}

/**
 * Get overdue invoices with days overdue
 */
export function getOverdueInvoices(
  invoices: Invoice[]
): (Invoice & { daysOverdue: number })[] {
  const today = new Date()

  return invoices
    .filter(inv => inv.status === 'overdue' || (inv.status === 'sent' && inv.due_date < today.toISOString().split('T')[0]))
    .map(inv => {
      const dueDate = new Date(inv.due_date)
      const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      return { ...inv, daysOverdue }
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
}

/**
 * Generate payment reminder message
 */
export function generatePaymentReminder(
  invoice: Invoice,
  daysOverdue: number
): string {
  if (daysOverdue <= 0) {
    return `Påminnelse: Faktura ${invoice.invoice_number} förfaller ${invoice.due_date}`
  }

  if (daysOverdue <= 7) {
    return `Vänlig påminnelse: Faktura ${invoice.invoice_number} förföll för ${daysOverdue} dagar sedan`
  }

  if (daysOverdue <= 14) {
    return `Betalningspåminnelse: Faktura ${invoice.invoice_number} är ${daysOverdue} dagar försenad`
  }

  return `Sista påminnelse: Faktura ${invoice.invoice_number} är ${daysOverdue} dagar försenad. Vänligen betala omgående.`
}

/**
 * Calculate cash flow impact of pending payments
 */
export function calculatePendingCashFlow(
  invoices: Invoice[]
): {
  next7Days: number
  next30Days: number
  overdue: number
  total: number
} {
  const today = new Date()
  const in7Days = new Date()
  in7Days.setDate(in7Days.getDate() + 7)
  const in30Days = new Date()
  in30Days.setDate(in30Days.getDate() + 30)

  const unpaid = invoices.filter(inv =>
    inv.status === 'sent' || inv.status === 'overdue'
  )

  const todayStr = today.toISOString().split('T')[0]
  const in7DaysStr = in7Days.toISOString().split('T')[0]
  const in30DaysStr = in30Days.toISOString().split('T')[0]

  const overdue = unpaid
    .filter(inv => inv.due_date < todayStr)
    .reduce((sum, inv) => sum + inv.total, 0)

  const next7Days = unpaid
    .filter(inv => inv.due_date >= todayStr && inv.due_date <= in7DaysStr)
    .reduce((sum, inv) => sum + inv.total, 0)

  const next30Days = unpaid
    .filter(inv => inv.due_date >= todayStr && inv.due_date <= in30DaysStr)
    .reduce((sum, inv) => sum + inv.total, 0)

  const total = unpaid.reduce((sum, inv) => sum + inv.total, 0)

  return {
    next7Days,
    next30Days,
    overdue,
    total,
  }
}
