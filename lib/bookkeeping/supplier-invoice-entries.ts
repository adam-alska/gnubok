import { createJournalEntry, findFiscalPeriod } from './engine'
import { generateReverseChargeLines } from './vat-entries'
import type {
  CreateJournalEntryInput,
  CreateJournalEntryLineInput,
  JournalEntry,
  SupplierInvoice,
  SupplierInvoiceItem,
} from '@/types'

/**
 * Create journal entry when a supplier invoice is registered (accrual method)
 *
 * Swedish domestic (25% VAT):
 *   Debit  5xxx/6xxx (per item's account_number)   [item line_total]
 *   Debit  2641 Ingående moms                      [total VAT]
 *   Credit 2440 Leverantörsskulder                  [total incl VAT]
 *
 * EU reverse charge (supplier_type = 'eu_business'):
 *   Debit  5xxx/6xxx (per item)                     [total]
 *   Debit  2645 Beräknad ingående moms              [fiktiv VAT]
 *   Credit 2614 Utgående moms omvänd                [fiktiv VAT]
 *   Credit 2440 Leverantörsskulder                  [total]
 */
export async function createSupplierInvoiceRegistrationEntry(
  userId: string,
  invoice: SupplierInvoice,
  items: SupplierInvoiceItem[],
  supplierType: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, invoice.invoice_date)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period found for invoice date:', invoice.invoice_date)
    return null
  }

  const lines: CreateJournalEntryLineInput[] = []
  const desc = `Lev.faktura ${invoice.supplier_invoice_number} (ankomst ${invoice.arrival_number})`

  // Aggregate expense amounts by account number
  const expenseByAccount = new Map<string, number>()
  for (const item of items) {
    const current = expenseByAccount.get(item.account_number) || 0
    expenseByAccount.set(item.account_number, current + item.line_total)
  }

  // Debit: Expense accounts
  for (const [accountNumber, amount] of expenseByAccount) {
    lines.push({
      account_number: accountNumber,
      debit_amount: Math.round(amount * 100) / 100,
      credit_amount: 0,
      line_description: desc,
    })
  }

  if (supplierType === 'eu_business' && invoice.reverse_charge) {
    // EU reverse charge: fiktiv moms entries
    const vatRate = getDefaultVatRate(invoice.vat_treatment)
    const reverseChargeLines = generateReverseChargeLines(invoice.subtotal, vatRate)
    lines.push(...reverseChargeLines)
  } else if (invoice.vat_amount > 0) {
    // Domestic: Debit ingående moms
    lines.push({
      account_number: '2641',
      debit_amount: Math.round(invoice.vat_amount * 100) / 100,
      credit_amount: 0,
      line_description: `Ingående moms ${desc}`,
    })
  }

  // Credit: Leverantörsskulder
  lines.push({
    account_number: '2440',
    debit_amount: 0,
    credit_amount: Math.round(invoice.total * 100) / 100,
    line_description: desc,
    currency: invoice.currency !== 'SEK' ? invoice.currency : undefined,
    amount_in_currency: invoice.currency !== 'SEK' ? invoice.total : undefined,
    exchange_rate: invoice.exchange_rate || undefined,
  })

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: invoice.invoice_date,
    description: desc,
    source_type: 'supplier_invoice_registered',
    source_id: invoice.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Create journal entry when a supplier invoice is paid (accrual method)
 *
 *   Debit  2440 Leverantörsskulder   [payment amount]
 *   Credit 1930 Företagskonto        [payment amount]
 *
 * With exchange rate difference:
 *   Debit  2440 Leverantörsskulder   [original SEK amount]
 *   Credit 1930 Företagskonto        [actual SEK paid]
 *   Credit/Debit 3960/7960           [difference]
 */
export async function createSupplierInvoicePaymentEntry(
  userId: string,
  invoice: SupplierInvoice,
  paymentAmount: number,
  paymentDate: string,
  exchangeRateDifference?: number
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, paymentDate)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period found for payment date:', paymentDate)
    return null
  }

  const desc = `Betalning lev.faktura ${invoice.supplier_invoice_number} (ankomst ${invoice.arrival_number})`
  const lines: CreateJournalEntryLineInput[] = []

  if (exchangeRateDifference && exchangeRateDifference !== 0) {
    // Foreign currency with exchange rate difference
    const originalSekAmount = paymentAmount
    const actualSekPaid = paymentAmount - exchangeRateDifference

    // Debit: Clear leverantörsskulder at original booked SEK amount
    lines.push({
      account_number: '2440',
      debit_amount: Math.round(originalSekAmount * 100) / 100,
      credit_amount: 0,
      line_description: desc,
    })

    // Credit: Bank at actual SEK paid
    lines.push({
      account_number: '1930',
      debit_amount: 0,
      credit_amount: Math.round(actualSekPaid * 100) / 100,
      line_description: desc,
    })

    // Exchange rate difference
    if (exchangeRateDifference > 0) {
      // Gain: Credit 3960
      lines.push({
        account_number: '3960',
        debit_amount: 0,
        credit_amount: Math.round(Math.abs(exchangeRateDifference) * 100) / 100,
        line_description: 'Valutakursvinst',
      })
    } else {
      // Loss: Debit 7960
      lines.push({
        account_number: '7960',
        debit_amount: Math.round(Math.abs(exchangeRateDifference) * 100) / 100,
        credit_amount: 0,
        line_description: 'Valutakursförlust',
      })
    }
  } else {
    // Standard SEK payment
    lines.push({
      account_number: '2440',
      debit_amount: Math.round(paymentAmount * 100) / 100,
      credit_amount: 0,
      line_description: desc,
    })

    lines.push({
      account_number: '1930',
      debit_amount: 0,
      credit_amount: Math.round(paymentAmount * 100) / 100,
      line_description: desc,
    })
  }

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: paymentDate,
    description: desc,
    source_type: 'supplier_invoice_paid',
    source_id: invoice.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Create journal entry for cash method (kontantmetoden)
 * Combined entry at payment time:
 *
 *   Debit  5xxx/6xxx (per item)      [line_total]
 *   Debit  2641 Ingående moms        [total VAT]
 *   Credit 1930 Företagskonto        [total incl VAT]
 */
export async function createSupplierInvoiceCashEntry(
  userId: string,
  invoice: SupplierInvoice,
  items: SupplierInvoiceItem[],
  paymentDate: string,
  supplierType: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, paymentDate)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period found for payment date:', paymentDate)
    return null
  }

  const desc = `Betalning lev.faktura ${invoice.supplier_invoice_number} (kontantmetoden)`
  const lines: CreateJournalEntryLineInput[] = []

  // Aggregate expense amounts by account number
  const expenseByAccount = new Map<string, number>()
  for (const item of items) {
    const current = expenseByAccount.get(item.account_number) || 0
    expenseByAccount.set(item.account_number, current + item.line_total)
  }

  // Debit: Expense accounts
  for (const [accountNumber, amount] of expenseByAccount) {
    lines.push({
      account_number: accountNumber,
      debit_amount: Math.round(amount * 100) / 100,
      credit_amount: 0,
      line_description: desc,
    })
  }

  if (supplierType === 'eu_business' && invoice.reverse_charge) {
    // EU reverse charge: fiktiv moms entries
    const vatRate = getDefaultVatRate(invoice.vat_treatment)
    const reverseChargeLines = generateReverseChargeLines(invoice.subtotal, vatRate)
    lines.push(...reverseChargeLines)
  } else if (invoice.vat_amount > 0) {
    // Domestic: Debit ingående moms
    lines.push({
      account_number: '2641',
      debit_amount: Math.round(invoice.vat_amount * 100) / 100,
      credit_amount: 0,
      line_description: `Ingående moms ${desc}`,
    })
  }

  // Credit: Företagskonto
  lines.push({
    account_number: '1930',
    debit_amount: 0,
    credit_amount: Math.round(invoice.total * 100) / 100,
    line_description: desc,
  })

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: paymentDate,
    description: desc,
    source_type: 'supplier_invoice_cash_payment',
    source_id: invoice.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Create journal entry for a supplier credit note (reversal of registration)
 *
 *   Debit  2440 Leverantörsskulder                 [total]
 *   Credit 5xxx/6xxx (per item)                    [line_total]
 *   Credit 2641 Ingående moms                      [total VAT]
 */
export async function createSupplierCreditNoteEntry(
  userId: string,
  creditNote: SupplierInvoice,
  items: SupplierInvoiceItem[],
  supplierType: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, creditNote.invoice_date)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period found for credit note date:', creditNote.invoice_date)
    return null
  }

  const desc = `Kreditfaktura lev. ${creditNote.supplier_invoice_number} (ankomst ${creditNote.arrival_number})`
  const lines: CreateJournalEntryLineInput[] = []

  const absTotal = Math.abs(creditNote.total)
  const absVat = Math.abs(creditNote.vat_amount)

  // Debit: Leverantörsskulder
  lines.push({
    account_number: '2440',
    debit_amount: Math.round(absTotal * 100) / 100,
    credit_amount: 0,
    line_description: desc,
  })

  // Credit: Expense accounts (reverse)
  const expenseByAccount = new Map<string, number>()
  for (const item of items) {
    const current = expenseByAccount.get(item.account_number) || 0
    expenseByAccount.set(item.account_number, current + Math.abs(item.line_total))
  }

  for (const [accountNumber, amount] of expenseByAccount) {
    lines.push({
      account_number: accountNumber,
      debit_amount: 0,
      credit_amount: Math.round(amount * 100) / 100,
      line_description: desc,
    })
  }

  if (supplierType === 'eu_business' && creditNote.reverse_charge) {
    // Reverse the fiktiv moms (swap debit/credit from registration)
    const vatRate = getDefaultVatRate(creditNote.vat_treatment)
    const vatAmount = Math.round(Math.abs(creditNote.subtotal) * vatRate * 100) / 100
    lines.push({
      account_number: '2645',
      debit_amount: 0,
      credit_amount: vatAmount,
      line_description: `Omvänd fiktiv ingående moms ${desc}`,
    })
    lines.push({
      account_number: '2614',
      debit_amount: vatAmount,
      credit_amount: 0,
      line_description: `Omvänd fiktiv utgående moms ${desc}`,
    })
  } else if (absVat > 0) {
    // Credit: Ingående moms (reverse)
    lines.push({
      account_number: '2641',
      debit_amount: 0,
      credit_amount: Math.round(absVat * 100) / 100,
      line_description: `Ingående moms ${desc}`,
    })
  }

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: creditNote.invoice_date,
    description: desc,
    source_type: 'supplier_credit_note',
    source_id: creditNote.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Get default VAT rate from treatment string
 */
function getDefaultVatRate(vatTreatment: string): number {
  switch (vatTreatment) {
    case 'standard_25': return 0.25
    case 'reduced_12': return 0.12
    case 'reduced_6': return 0.06
    default: return 0.25
  }
}
