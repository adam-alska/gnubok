import { createClient } from '@/lib/supabase/server'
import type {
  VatDeclaration,
  VatDeclarationRutor,
  VatPeriodType,
  Invoice,
  Transaction,
  Receipt,
  TaxCode,
} from '@/types'

/**
 * Calculate VAT declaration (Momsdeklaration) for a given period
 *
 * Aggregates data from:
 * - Invoices: Utgående moms (output VAT) based on moms_ruta
 * - Transactions: Ingående moms (input VAT) from categorized expenses
 * - Receipts: Ingående moms from confirmed receipts
 *
 * Returns VAT rutor according to Swedish tax authority format.
 */

/**
 * Calculate period start and end dates
 */
export function calculatePeriodDates(
  periodType: VatPeriodType,
  year: number,
  period: number
): { start: string; end: string } {
  let startMonth: number
  let endMonth: number

  switch (periodType) {
    case 'monthly':
      // period is 1-12
      startMonth = period
      endMonth = period
      break
    case 'quarterly':
      // period is 1-4
      startMonth = (period - 1) * 3 + 1
      endMonth = period * 3
      break
    case 'yearly':
      // period is 1
      startMonth = 1
      endMonth = 12
      break
    default:
      startMonth = 1
      endMonth = 12
  }

  const startDate = new Date(year, startMonth - 1, 1)
  const endDate = new Date(year, endMonth, 0) // Last day of end month

  return {
    start: formatDate(startDate),
    end: formatDate(endDate),
  }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Round to 2 decimal places
 */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Main function to calculate VAT declaration
 */
export async function calculateVatDeclaration(
  userId: string,
  periodType: VatPeriodType,
  year: number,
  period: number
): Promise<VatDeclaration> {
  const supabase = await createClient()
  const { start, end } = calculatePeriodDates(periodType, year, period)

  // Fetch invoices for the period
  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', userId)
    .gte('invoice_date', start)
    .lte('invoice_date', end)
    .in('status', ['sent', 'paid', 'overdue'])

  if (invoicesError) {
    console.error('Error fetching invoices:', invoicesError)
  }

  // Fetch transactions with business expenses for the period
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)
    .eq('is_business', true)
    .lt('amount', 0) // Expenses are negative

  if (transactionsError) {
    console.error('Error fetching transactions:', transactionsError)
  }

  // Fetch confirmed receipts for the period
  const { data: receipts, error: receiptsError } = await supabase
    .from('receipts')
    .select('*')
    .eq('user_id', userId)
    .gte('receipt_date', start)
    .lte('receipt_date', end)
    .eq('status', 'confirmed')

  if (receiptsError) {
    console.error('Error fetching receipts:', receiptsError)
  }

  // Calculate invoice-based VAT (utgående moms)
  const invoiceVat = calculateInvoiceVat(invoices as Invoice[] || [])

  // Calculate input VAT from transactions
  const transactionVat = calculateTransactionInputVat(transactions as Transaction[] || [])

  // Calculate input VAT from receipts
  const receiptVat = calculateReceiptInputVat(receipts as Receipt[] || [])

  // Total ingående moms (input VAT to deduct)
  const totalInputVat = round(transactionVat + receiptVat)

  // Total utgående moms (output VAT to pay)
  const totalOutputVat = round(invoiceVat.ruta05 + invoiceVat.ruta06 + invoiceVat.ruta07)

  // Moms att betala/återfå (VAT to pay or receive back)
  const vatToPay = round(totalOutputVat - totalInputVat)

  const rutor: VatDeclarationRutor = {
    ruta05: invoiceVat.ruta05,
    ruta06: invoiceVat.ruta06,
    ruta07: invoiceVat.ruta07,
    ruta10: invoiceVat.ruta10,
    ruta11: invoiceVat.ruta11,
    ruta12: invoiceVat.ruta12,
    ruta39: invoiceVat.ruta39,
    ruta40: invoiceVat.ruta40,
    ruta48: totalInputVat,
    ruta49: vatToPay,
  }

  return {
    period: {
      type: periodType,
      year,
      period,
      start,
      end,
    },
    rutor,
    invoiceCount: (invoices || []).length,
    transactionCount: (transactions || []).length,
    breakdown: {
      invoices: {
        ruta05: invoiceVat.ruta05,
        ruta06: invoiceVat.ruta06,
        ruta07: invoiceVat.ruta07,
        ruta10: invoiceVat.ruta10,
        ruta11: invoiceVat.ruta11,
        ruta12: invoiceVat.ruta12,
        ruta39: invoiceVat.ruta39,
        ruta40: invoiceVat.ruta40,
      },
      transactions: {
        ruta48: round(transactionVat),
      },
      receipts: {
        ruta48: round(receiptVat),
      },
    },
  }
}

/**
 * Calculate VAT from invoices
 */
function calculateInvoiceVat(invoices: Invoice[]): {
  ruta05: number
  ruta06: number
  ruta07: number
  ruta10: number
  ruta11: number
  ruta12: number
  ruta39: number
  ruta40: number
} {
  let ruta05 = 0 // Utgående moms 25%
  let ruta06 = 0 // Utgående moms 12%
  let ruta07 = 0 // Utgående moms 6%
  let ruta10 = 0 // Underlag 25%
  let ruta11 = 0 // Underlag 12%
  let ruta12 = 0 // Underlag 6%
  let ruta39 = 0 // EU tjänster
  let ruta40 = 0 // Export

  for (const invoice of invoices) {
    // Use subtotal_sek if available (for foreign currency invoices), otherwise subtotal
    const subtotal = invoice.subtotal_sek ?? invoice.subtotal
    const vatAmount = invoice.vat_amount_sek ?? invoice.vat_amount

    switch (invoice.moms_ruta) {
      case '05':
        // Standard 25% VAT
        ruta05 += vatAmount
        ruta10 += subtotal
        break
      case '06':
        // Reduced 12% VAT
        ruta06 += vatAmount
        ruta11 += subtotal
        break
      case '07':
        // Reduced 6% VAT
        ruta07 += vatAmount
        ruta12 += subtotal
        break
      case '39':
        // EU reverse charge - no VAT charged, but report the value
        ruta39 += subtotal
        break
      case '40':
        // Export outside EU - no VAT charged, but report the value
        ruta40 += subtotal
        break
      default:
        // Default to 25% if moms_ruta is not set but there's VAT
        if (vatAmount > 0) {
          ruta05 += vatAmount
          ruta10 += subtotal
        }
    }
  }

  return {
    ruta05: round(ruta05),
    ruta06: round(ruta06),
    ruta07: round(ruta07),
    ruta10: round(ruta10),
    ruta11: round(ruta11),
    ruta12: round(ruta12),
    ruta39: round(ruta39),
    ruta40: round(ruta40),
  }
}

/**
 * Calculate input VAT from business expense transactions
 *
 * For Swedish business expenses with 25% VAT, we can deduct the VAT.
 * This is a simplified calculation - in reality, the journal entry
 * would have the exact VAT amounts.
 */
function calculateTransactionInputVat(transactions: Transaction[]): number {
  let inputVat = 0

  for (const transaction of transactions) {
    // Only process business expenses (amount is negative)
    if (!transaction.is_business || transaction.amount >= 0) continue

    // Use amount_sek if available, otherwise amount
    const expenseAmount = Math.abs(transaction.amount_sek ?? transaction.amount)

    // Estimate VAT based on category
    // Most Swedish business expenses have 25% VAT
    // Some categories might have reduced rates or no VAT
    const vatRate = getVatRateForCategory(transaction.category)

    if (vatRate > 0) {
      // Extract VAT from total (VAT-inclusive) amount
      // VAT = total * rate / (1 + rate)
      const vat = (expenseAmount * vatRate) / (1 + vatRate)
      inputVat += vat
    }
  }

  return inputVat
}

/**
 * Get VAT rate for expense category
 */
function getVatRateForCategory(category: string | null): number {
  // Categories that typically have 25% VAT
  const standard25Categories = [
    'expense_equipment',
    'expense_software',
    'expense_office',
    'expense_marketing',
    'expense_professional_services',
    'expense_education',
    'expense_other',
  ]

  // Categories with 12% VAT (e.g., food/restaurants, but only 50% deductible for representation)
  const reduced12Categories = [
    'expense_travel', // Hotels, some transport
  ]

  // Categories with 6% VAT
  const reduced6Categories: string[] = [
    // Books, newspapers, etc.
  ]

  // No VAT deduction
  const noVatCategories = [
    'private',
    'uncategorized',
    'income_services',
    'income_products',
    'income_other',
  ]

  if (!category || noVatCategories.includes(category)) {
    return 0
  }

  if (standard25Categories.includes(category)) {
    return 0.25
  }

  if (reduced12Categories.includes(category)) {
    return 0.12
  }

  if (reduced6Categories.includes(category)) {
    return 0.06
  }

  // Default to 25% for unrecognized expense categories
  return 0.25
}

/**
 * Calculate input VAT from confirmed receipts
 */
function calculateReceiptInputVat(receipts: Receipt[]): number {
  let inputVat = 0

  for (const receipt of receipts) {
    // Only confirmed receipts
    if (receipt.status !== 'confirmed') continue

    // Use the extracted VAT amount if available
    if (receipt.vat_amount && receipt.vat_amount > 0) {
      inputVat += receipt.vat_amount
    }
  }

  return inputVat
}

/**
 * Get a summary of the VAT declaration for display
 */
export function getVatDeclarationSummary(declaration: VatDeclaration): {
  totalOutputVat: number
  totalInputVat: number
  vatToPay: number
  isRefund: boolean
} {
  const totalOutputVat = round(
    declaration.rutor.ruta05 +
    declaration.rutor.ruta06 +
    declaration.rutor.ruta07
  )

  const totalInputVat = declaration.rutor.ruta48
  const vatToPay = declaration.rutor.ruta49

  return {
    totalOutputVat,
    totalInputVat,
    vatToPay,
    isRefund: vatToPay < 0,
  }
}

/**
 * Format period label for display
 */
export function formatPeriodLabel(
  periodType: VatPeriodType,
  year: number,
  period: number
): string {
  switch (periodType) {
    case 'monthly':
      const monthNames = [
        'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
        'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'
      ]
      return `${monthNames[period - 1]} ${year}`
    case 'quarterly':
      return `Kvartal ${period} ${year}`
    case 'yearly':
      return `Helår ${year}`
    default:
      return `${year}`
  }
}

// ============================================================
// Tax-code-driven VAT declaration (new approach)
// ============================================================

/**
 * Calculate VAT declaration using tax codes from journal entry lines.
 *
 * This is the new, tax-code-driven approach that sums journal_entry_lines
 * grouped by tax_code, then maps via the tax_codes table to moms boxes.
 * Falls back to the legacy invoice/transaction/receipt approach for
 * lines without tax codes.
 */
export async function calculateVatDeclarationFromTaxCodes(
  userId: string,
  periodType: VatPeriodType,
  year: number,
  period: number
): Promise<VatDeclaration> {
  const supabase = await createClient()
  const { start, end } = calculatePeriodDates(periodType, year, period)

  // Fetch tax codes for this user (including system codes)
  const { data: taxCodesData } = await supabase
    .from('tax_codes')
    .select('*')
    .or(`user_id.eq.${userId},user_id.is.null`)

  const taxCodes = (taxCodesData as TaxCode[]) || []
  const taxCodeMap = new Map<string, TaxCode>()
  for (const tc of taxCodes) {
    if (!taxCodeMap.has(tc.code) || tc.user_id) {
      taxCodeMap.set(tc.code, tc)
    }
  }

  // Fetch posted journal entry lines with tax_code in the period
  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select(`
      tax_code,
      debit_amount,
      credit_amount,
      journal_entry_id,
      journal_entries!inner (
        user_id,
        entry_date,
        status
      )
    `)
    .not('tax_code', 'is', null)
    .eq('journal_entries.user_id', userId)
    .eq('journal_entries.status', 'posted')
    .gte('journal_entries.entry_date', start)
    .lte('journal_entries.entry_date', end)

  // Aggregate amounts by moms box
  const boxTotals = new Map<string, number>()

  for (const line of lines || []) {
    if (!line.tax_code) continue

    const taxCode = taxCodeMap.get(line.tax_code)
    if (!taxCode) continue

    const amount = Math.abs(Number(line.debit_amount || 0) - Number(line.credit_amount || 0))

    // Map to all relevant boxes
    for (const box of [...taxCode.moms_basis_boxes, ...taxCode.moms_tax_boxes, ...taxCode.moms_input_boxes]) {
      const current = boxTotals.get(box) || 0
      boxTotals.set(box, current + amount)
    }
  }

  // Build rutor from box totals
  const rutor: VatDeclarationRutor = {
    ruta05: round(boxTotals.get('05') || 0),
    ruta06: round(boxTotals.get('06') || 0),
    ruta07: round(boxTotals.get('07') || 0),
    ruta10: round(boxTotals.get('10') || 0),
    ruta11: round(boxTotals.get('11') || 0),
    ruta12: round(boxTotals.get('12') || 0),
    ruta39: round(boxTotals.get('39') || 0),
    ruta40: round(boxTotals.get('40') || 0),
    ruta48: round(boxTotals.get('48') || 0),
    ruta49: 0,
  }

  const totalOutputVat = round(rutor.ruta05 + rutor.ruta06 + rutor.ruta07)
  rutor.ruta49 = round(totalOutputVat - rutor.ruta48)

  return {
    period: {
      type: periodType,
      year,
      period,
      start,
      end,
    },
    rutor,
    invoiceCount: 0,
    transactionCount: (lines || []).length,
    breakdown: {
      invoices: {
        ruta05: 0,
        ruta06: 0,
        ruta07: 0,
        ruta10: 0,
        ruta11: 0,
        ruta12: 0,
        ruta39: 0,
        ruta40: 0,
      },
      transactions: {
        ruta48: 0,
      },
      receipts: {
        ruta48: 0,
      },
    },
  }
}
