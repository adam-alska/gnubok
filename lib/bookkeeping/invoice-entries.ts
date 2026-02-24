import { createJournalEntry, findFiscalPeriod } from './engine'
import { generateSalesVatLines, generateReverseChargeLines } from './vat-entries'
import { getVatTreatmentForRate } from '@/lib/invoices/vat-rules'
import { createLogger } from '@/lib/logger'
import type {
  CreateJournalEntryInput,
  CreateJournalEntryLineInput,
  EntityType,
  Invoice,
  InvoiceItem,
  JournalEntry,
  VatTreatment,
} from '@/types'

const log = createLogger('invoice-entries')

/**
 * Group invoice items by VAT rate and generate per-rate revenue + VAT lines.
 * Returns credit lines only (revenue + VAT). The caller adds the debit side.
 */
function generatePerRateLines(
  items: InvoiceItem[],
  invoiceVatTreatment: VatTreatment,
  entityType: EntityType,
  invoiceNumber: string
): CreateJournalEntryLineInput[] {
  const lines: CreateJournalEntryLineInput[] = []

  // Check if items have per-line vat_rate set (new invoices)
  const hasPerLineVat = items.some((item) => item.vat_rate !== undefined && item.vat_rate !== null)

  if (!hasPerLineVat) {
    // Legacy fallback: single rate from invoice level
    const revenueAccount = getRevenueAccount(invoiceVatTreatment, entityType)
    const subtotal = items.reduce((sum, item) => sum + item.line_total, 0)
    lines.push({
      account_number: revenueAccount,
      debit_amount: 0,
      credit_amount: subtotal,
      line_description: `Försäljning faktura ${invoiceNumber}`,
    })

    const totalVat = items.reduce((sum, item) => sum + (item.vat_amount || 0), 0)
    if (totalVat > 0) {
      const vatLines = generateSalesVatLines({
        vatTreatment: invoiceVatTreatment,
        baseAmount: subtotal,
        direction: 'sales',
      })
      lines.push(...vatLines)
    }
    return lines
  }

  // Group items by vat_rate
  const rateGroups = new Map<number, { subtotal: number; vatAmount: number }>()
  for (const item of items) {
    const rate = item.vat_rate ?? 0
    const group = rateGroups.get(rate) || { subtotal: 0, vatAmount: 0 }
    group.subtotal += item.line_total
    group.vatAmount += item.vat_amount || 0
    rateGroups.set(rate, group)
  }

  // Generate revenue + VAT lines per rate group
  for (const [rate, group] of rateGroups) {
    const treatment = rate === 0 && (invoiceVatTreatment === 'reverse_charge' || invoiceVatTreatment === 'export')
      ? invoiceVatTreatment
      : getVatTreatmentForRate(rate)
    const revenueAccount = getRevenueAccount(treatment, entityType)
    const roundedSubtotal = Math.round(group.subtotal * 100) / 100

    lines.push({
      account_number: revenueAccount,
      debit_amount: 0,
      credit_amount: roundedSubtotal,
      line_description: `Försäljning faktura ${invoiceNumber}`,
    })

    const roundedVat = Math.round(group.vatAmount * 100) / 100
    if (roundedVat !== 0) {
      const vatAccount = getOutputVatAccount(treatment)
      lines.push({
        account_number: vatAccount,
        debit_amount: 0,
        credit_amount: roundedVat,
        line_description: `Utgående moms ${rate}%`,
      })
    }
  }

  return lines
}

/**
 * Create journal entry when an invoice is created (status != draft)
 *
 * Supports mixed VAT rates per line item. Groups items by vat_rate
 * and creates separate revenue + VAT lines per rate.
 *
 * Standard domestic invoice (25% VAT):
 *   Debit  1510 Kundfordringar     [total incl VAT]
 *   Credit 30xx Försäljning         [subtotal per rate]
 *   Credit 26xx Utgående moms       [vat per rate]
 *
 * EU reverse charge:
 *   Debit  1510 Kundfordringar     [subtotal]
 *   Credit 3308 Försäljning tjänst EU [subtotal]
 *
 * Export (non-EU):
 *   Debit  1510 Kundfordringar     [subtotal]
 *   Credit 3305 Försäljning tjänst Export [subtotal]
 */
export async function createInvoiceJournalEntry(
  userId: string,
  invoice: Invoice,
  entityType: EntityType = 'enskild_firma'
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, invoice.invoice_date)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for invoice date:', invoice.invoice_date)
    return null
  }

  const lines: CreateJournalEntryLineInput[] = []

  // Debit: Kundfordringar (total including VAT)
  lines.push({
    account_number: '1510',
    debit_amount: invoice.total,
    credit_amount: 0,
    line_description: `Faktura ${invoice.invoice_number}`,
    currency: invoice.currency,
    amount_in_currency: invoice.currency !== 'SEK' ? invoice.total : undefined,
    exchange_rate: invoice.exchange_rate || undefined,
  })

  // Credit lines: revenue + VAT per rate group
  if (invoice.items && invoice.items.length > 0) {
    lines.push(...generatePerRateLines(invoice.items, invoice.vat_treatment, entityType, invoice.invoice_number))
  } else {
    // Fallback: no items available, use invoice-level amounts
    const revenueAccount = getRevenueAccount(invoice.vat_treatment, entityType)
    lines.push({
      account_number: revenueAccount,
      debit_amount: 0,
      credit_amount: invoice.subtotal,
      line_description: `Försäljning faktura ${invoice.invoice_number}`,
    })

    if (invoice.vat_amount > 0) {
      const vatLines = generateSalesVatLines({
        vatTreatment: invoice.vat_treatment,
        baseAmount: invoice.subtotal,
        direction: 'sales',
      })
      lines.push(...vatLines)
    }
  }

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: invoice.invoice_date,
    description: `Faktura ${invoice.invoice_number}`,
    source_type: 'invoice_created',
    source_id: invoice.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Create journal entry when an invoice is marked as paid
 *
 *   Debit  1930 Företagskonto       [total]
 *   Credit 1510 Kundfordringar      [total]
 */
export async function createInvoicePaymentJournalEntry(
  userId: string,
  invoice: Invoice,
  paymentDate: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, paymentDate)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for payment date:', paymentDate)
    return null
  }

  const lines: CreateJournalEntryLineInput[] = [
    {
      account_number: '1930', // Företagskonto
      debit_amount: invoice.total,
      credit_amount: 0,
      line_description: `Betalning faktura ${invoice.invoice_number}`,
    },
    {
      account_number: '1510', // Kundfordringar
      debit_amount: 0,
      credit_amount: invoice.total,
      line_description: `Betalning faktura ${invoice.invoice_number}`,
    },
  ]

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: paymentDate,
    description: `Betalning faktura ${invoice.invoice_number}`,
    source_type: 'invoice_paid',
    source_id: invoice.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Create journal entry for a credit note (reversed version of original invoice entry)
 * Supports per-item VAT rates with reversed debit/credit sides.
 *
 *   Debit  30xx Försäljning         [subtotal per rate]
 *   Debit  26xx Utgående moms       [vat per rate]
 *   Credit 1510 Kundfordringar      [total]
 */
export async function createCreditNoteJournalEntry(
  userId: string,
  creditNote: Invoice,
  entityType: EntityType = 'enskild_firma'
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, creditNote.invoice_date)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for credit note date:', creditNote.invoice_date)
    return null
  }

  const absTotal = Math.abs(creditNote.total)
  const lines: CreateJournalEntryLineInput[] = []

  // Generate reversed revenue + VAT lines per rate group
  if (creditNote.items && creditNote.items.length > 0) {
    const creditLines = generatePerRateLines(creditNote.items, creditNote.vat_treatment, entityType, creditNote.invoice_number)
    // Swap debit/credit for credit note reversal (make amounts absolute first)
    for (const line of creditLines) {
      lines.push({
        ...line,
        debit_amount: Math.abs(line.credit_amount),
        credit_amount: Math.abs(line.debit_amount),
        line_description: `Kreditfaktura ${creditNote.invoice_number}`,
      })
    }
  } else {
    // Fallback: invoice-level amounts
    const revenueAccount = getRevenueAccount(creditNote.vat_treatment, entityType)
    const absSubtotal = Math.abs(creditNote.subtotal)
    const absVat = Math.abs(creditNote.vat_amount)

    lines.push({
      account_number: revenueAccount,
      debit_amount: absSubtotal,
      credit_amount: 0,
      line_description: `Kreditfaktura ${creditNote.invoice_number}`,
    })

    if (absVat > 0) {
      const vatAccount = getOutputVatAccount(creditNote.vat_treatment)
      lines.push({
        account_number: vatAccount,
        debit_amount: absVat,
        credit_amount: 0,
        line_description: `Moms kreditfaktura ${creditNote.invoice_number}`,
      })
    }
  }

  // Credit: Kundfordringar (reverse the debit)
  lines.push({
    account_number: '1510',
    debit_amount: 0,
    credit_amount: absTotal,
    line_description: `Kreditfaktura ${creditNote.invoice_number}`,
  })

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: creditNote.invoice_date,
    description: `Kreditfaktura ${creditNote.invoice_number}`,
    source_type: 'credit_note',
    source_id: creditNote.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Create journal entry for kontantmetoden (cash method) when payment is received.
 * Supports per-item VAT rates. Revenue + VAT recognised at payment.
 *
 *   Debit  1930 Företagskonto       [total]
 *   Credit 30xx Försäljning         [subtotal per rate]
 *   Credit 26xx Utgående moms       [vat per rate]  (if applicable)
 */
export async function createInvoiceCashEntry(
  userId: string,
  invoice: Invoice,
  paymentDate: string,
  entityType: EntityType = 'enskild_firma'
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, paymentDate)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for payment date:', paymentDate)
    return null
  }

  const lines: CreateJournalEntryLineInput[] = []

  // Debit: Företagskonto (total received)
  lines.push({
    account_number: '1930',
    debit_amount: invoice.total,
    credit_amount: 0,
    line_description: `Betalning faktura ${invoice.invoice_number}`,
  })

  // Credit lines: revenue + VAT per rate group
  if (invoice.items && invoice.items.length > 0) {
    lines.push(...generatePerRateLines(invoice.items, invoice.vat_treatment, entityType, invoice.invoice_number))
  } else {
    // Fallback: invoice-level amounts
    const revenueAccount = getRevenueAccount(invoice.vat_treatment, entityType)
    lines.push({
      account_number: revenueAccount,
      debit_amount: 0,
      credit_amount: invoice.subtotal,
      line_description: `Försäljning faktura ${invoice.invoice_number}`,
    })

    if (invoice.vat_amount > 0) {
      const vatAccount = getOutputVatAccount(invoice.vat_treatment)
      lines.push({
        account_number: vatAccount,
        debit_amount: 0,
        credit_amount: invoice.vat_amount,
        line_description: `Utgående moms faktura ${invoice.invoice_number}`,
      })
    }
  }

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: paymentDate,
    description: `Betalning faktura ${invoice.invoice_number} (kontantmetoden)`,
    source_type: 'invoice_cash_payment',
    source_id: invoice.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Get the appropriate revenue account based on VAT treatment
 *
 * For 'exempt': AB uses 3004 (Försäljning inom Sverige, momsfri),
 * EF uses 3100 (Momsfria intäkter, mapped to R2 in NE engine).
 */
export function getRevenueAccount(vatTreatment: VatTreatment, entityType: EntityType = 'enskild_firma'): string {
  switch (vatTreatment) {
    case 'standard_25':
      return '3001' // Försäljning 25%
    case 'reduced_12':
      return '3002' // Försäljning 12%
    case 'reduced_6':
      return '3003' // Försäljning 6%
    case 'reverse_charge':
      return '3308' // Försäljning tjänst EU
    case 'export':
      return '3305' // Försäljning tjänst Export
    case 'exempt':
      return entityType === 'aktiebolag' ? '3004' : '3100'
    default:
      return '3001'
  }
}

/**
 * Get the output VAT account based on VAT treatment
 */
export function getOutputVatAccount(vatTreatment: VatTreatment): string {
  switch (vatTreatment) {
    case 'standard_25':
      return '2611'
    case 'reduced_12':
      return '2621'
    case 'reduced_6':
      return '2631'
    default:
      return '2611'
  }
}
