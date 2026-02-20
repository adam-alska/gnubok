import { createJournalEntry, findFiscalPeriod } from './engine'
import { generateSalesVatLines, generateReverseChargeLines } from './vat-entries'
import type {
  CreateJournalEntryInput,
  CreateJournalEntryLineInput,
  Invoice,
  JournalEntry,
  VatTreatment,
} from '@/types'

/**
 * Create journal entry when an invoice is created (status != draft)
 *
 * Standard domestic invoice (25% VAT):
 *   Debit  1510 Kundfordringar     [total incl VAT]
 *   Credit 30xx Försäljning         [subtotal]
 *   Credit 2611 Utgående moms 25%   [vat_amount]
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
  invoice: Invoice
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, invoice.invoice_date)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period found for invoice date:', invoice.invoice_date)
    return null
  }

  const lines: CreateJournalEntryLineInput[] = []

  // Determine revenue account based on VAT treatment
  const revenueAccount = getRevenueAccount(invoice.vat_treatment)

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

  // Credit: Revenue account (subtotal, excl VAT)
  lines.push({
    account_number: revenueAccount,
    debit_amount: 0,
    credit_amount: invoice.subtotal,
    line_description: `Försäljning faktura ${invoice.invoice_number}`,
  })

  // VAT lines (if applicable)
  if (invoice.vat_amount > 0) {
    const vatLines = generateSalesVatLines({
      vatTreatment: invoice.vat_treatment,
      baseAmount: invoice.subtotal,
      direction: 'sales',
    })
    lines.push(...vatLines)
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
    console.warn('No open fiscal period found for payment date:', paymentDate)
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
 *
 *   Debit  30xx Försäljning         [subtotal]
 *   Debit  26xx Utgående moms       [vat_amount]
 *   Credit 1510 Kundfordringar      [total]
 */
export async function createCreditNoteJournalEntry(
  userId: string,
  creditNote: Invoice
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, creditNote.invoice_date)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period found for credit note date:', creditNote.invoice_date)
    return null
  }

  const revenueAccount = getRevenueAccount(creditNote.vat_treatment)
  const absSubtotal = Math.abs(creditNote.subtotal)
  const absVat = Math.abs(creditNote.vat_amount)
  const absTotal = Math.abs(creditNote.total)

  const lines: CreateJournalEntryLineInput[] = []

  // Debit: Revenue account (reverse the credit)
  lines.push({
    account_number: revenueAccount,
    debit_amount: absSubtotal,
    credit_amount: 0,
    line_description: `Kreditfaktura ${creditNote.invoice_number}`,
  })

  // Debit: VAT account (reverse the credit, if applicable)
  if (absVat > 0) {
    const vatAccount = getOutputVatAccount(creditNote.vat_treatment)
    lines.push({
      account_number: vatAccount,
      debit_amount: absVat,
      credit_amount: 0,
      line_description: `Moms kreditfaktura ${creditNote.invoice_number}`,
    })
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
 * Combined entry: revenue + VAT recognised at payment.
 *
 *   Debit  1930 Företagskonto       [total]
 *   Credit 30xx Försäljning         [subtotal]
 *   Credit 26xx Utgående moms       [vat_amount]  (if applicable)
 */
export async function createInvoiceCashEntry(
  userId: string,
  invoice: Invoice,
  paymentDate: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, paymentDate)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period found for payment date:', paymentDate)
    return null
  }

  const revenueAccount = getRevenueAccount(invoice.vat_treatment)
  const lines: CreateJournalEntryLineInput[] = []

  // Debit: Företagskonto (total received)
  lines.push({
    account_number: '1930',
    debit_amount: invoice.total,
    credit_amount: 0,
    line_description: `Betalning faktura ${invoice.invoice_number}`,
  })

  // Credit: Revenue account (subtotal excl VAT)
  lines.push({
    account_number: revenueAccount,
    debit_amount: 0,
    credit_amount: invoice.subtotal,
    line_description: `Försäljning faktura ${invoice.invoice_number}`,
  })

  // Credit: Output VAT (if applicable)
  if (invoice.vat_amount > 0) {
    const vatAccount = getOutputVatAccount(invoice.vat_treatment)
    lines.push({
      account_number: vatAccount,
      debit_amount: 0,
      credit_amount: invoice.vat_amount,
      line_description: `Utgående moms faktura ${invoice.invoice_number}`,
    })
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
 */
export function getRevenueAccount(vatTreatment: VatTreatment): string {
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
      return '3100' // Momsfria intäkter
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
