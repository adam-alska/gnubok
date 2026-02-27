import { createJournalEntry, findFiscalPeriod } from './engine'
import { resolveSekAmount, buildCurrencyMetadata } from './currency-utils'
import { generateReverseChargeLines } from './vat-entries'
import { createLogger } from '@/lib/logger'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CreateJournalEntryInput,
  CreateJournalEntryLineInput,
  JournalEntry,
  SupplierInvoice,
  SupplierInvoiceItem,
} from '@/types'

const log = createLogger('supplier-invoice-entries')

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
  supabase: SupabaseClient,
  userId: string,
  invoice: SupplierInvoice,
  items: SupplierInvoiceItem[],
  supplierType: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(supabase, userId, invoice.invoice_date)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for invoice date:', invoice.invoice_date)
    return null
  }

  const lines: CreateJournalEntryLineInput[] = []
  const desc = `Lev.faktura ${invoice.supplier_invoice_number} (ankomst ${invoice.arrival_number})`
  const isForeign = invoice.currency !== 'SEK'

  // Aggregate expense amounts by account number and convert to SEK
  const expenseByAccount = new Map<string, number>()
  for (const item of items) {
    const current = expenseByAccount.get(item.account_number) || 0
    const itemSek = resolveSekAmount(item.line_total, null, invoice.currency, invoice.exchange_rate)
    expenseByAccount.set(item.account_number, current + itemSek)
  }

  // Debit: Expense accounts (in SEK)
  const debitLines: CreateJournalEntryLineInput[] = []
  for (const [accountNumber, amount] of expenseByAccount) {
    debitLines.push({
      account_number: accountNumber,
      debit_amount: Math.round(amount * 100) / 100,
      credit_amount: 0,
      line_description: desc,
    })
  }
  lines.push(...debitLines)

  if (supplierType === 'eu_business' && invoice.reverse_charge) {
    // EU reverse charge: fiktiv moms entries (computed on SEK subtotal)
    const vatRate = getDefaultVatRate(invoice.vat_treatment)
    const subtotalSek = resolveSekAmount(invoice.subtotal, invoice.subtotal_sek, invoice.currency, invoice.exchange_rate)
    const reverseChargeLines = generateReverseChargeLines(subtotalSek, vatRate)
    lines.push(...reverseChargeLines)
  } else if (invoice.vat_amount > 0) {
    // Domestic: Debit ingående moms (in SEK)
    const vatSek = resolveSekAmount(invoice.vat_amount, invoice.vat_amount_sek, invoice.currency, invoice.exchange_rate)
    lines.push({
      account_number: '2641',
      debit_amount: Math.round(vatSek * 100) / 100,
      credit_amount: 0,
      line_description: `Ingående moms ${desc}`,
    })
  }

  // Credit: Leverantörsskulder — balance guarantee: credit = sum of all debit lines
  const totalDebits = lines.reduce((sum, l) => sum + l.debit_amount, 0)
  lines.push({
    account_number: '2440',
    debit_amount: 0,
    credit_amount: Math.round(totalDebits * 100) / 100,
    line_description: desc,
    ...buildCurrencyMetadata(invoice.currency, isForeign ? invoice.total : undefined, invoice.exchange_rate),
  })

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: invoice.invoice_date,
    description: desc,
    source_type: 'supplier_invoice_registered',
    source_id: invoice.id,
    lines,
  }

  return createJournalEntry(supabase, userId, input)
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
  supabase: SupabaseClient,
  userId: string,
  invoice: SupplierInvoice,
  paymentAmount: number,
  paymentDate: string,
  exchangeRateDifference?: number
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(supabase, userId, paymentDate)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for payment date:', paymentDate)
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

  return createJournalEntry(supabase, userId, input)
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
  supabase: SupabaseClient,
  userId: string,
  invoice: SupplierInvoice,
  items: SupplierInvoiceItem[],
  paymentDate: string,
  supplierType: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(supabase, userId, paymentDate)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for payment date:', paymentDate)
    return null
  }

  const desc = `Betalning lev.faktura ${invoice.supplier_invoice_number} (kontantmetoden)`
  const lines: CreateJournalEntryLineInput[] = []

  // Aggregate expense amounts by account number and convert to SEK
  const expenseByAccount = new Map<string, number>()
  for (const item of items) {
    const current = expenseByAccount.get(item.account_number) || 0
    const itemSek = resolveSekAmount(item.line_total, null, invoice.currency, invoice.exchange_rate)
    expenseByAccount.set(item.account_number, current + itemSek)
  }

  // Debit: Expense accounts (in SEK)
  for (const [accountNumber, amount] of expenseByAccount) {
    lines.push({
      account_number: accountNumber,
      debit_amount: Math.round(amount * 100) / 100,
      credit_amount: 0,
      line_description: desc,
    })
  }

  if (supplierType === 'eu_business' && invoice.reverse_charge) {
    // EU reverse charge: fiktiv moms entries (computed on SEK subtotal)
    const vatRate = getDefaultVatRate(invoice.vat_treatment)
    const subtotalSek = resolveSekAmount(invoice.subtotal, invoice.subtotal_sek, invoice.currency, invoice.exchange_rate)
    const reverseChargeLines = generateReverseChargeLines(subtotalSek, vatRate)
    lines.push(...reverseChargeLines)
  } else if (invoice.vat_amount > 0) {
    // Domestic: Debit ingående moms (in SEK)
    const vatSek = resolveSekAmount(invoice.vat_amount, invoice.vat_amount_sek, invoice.currency, invoice.exchange_rate)
    lines.push({
      account_number: '2641',
      debit_amount: Math.round(vatSek * 100) / 100,
      credit_amount: 0,
      line_description: `Ingående moms ${desc}`,
    })
  }

  // Credit: Företagskonto — balance guarantee: credit = sum of all debit lines
  const totalDebits = lines.reduce((sum, l) => sum + l.debit_amount, 0)
  lines.push({
    account_number: '1930',
    debit_amount: 0,
    credit_amount: Math.round(totalDebits * 100) / 100,
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

  return createJournalEntry(supabase, userId, input)
}

/**
 * Create journal entry for a supplier credit note (reversal of registration)
 *
 *   Debit  2440 Leverantörsskulder                 [total]
 *   Credit 5xxx/6xxx (per item)                    [line_total]
 *   Credit 2641 Ingående moms                      [total VAT]
 */
export async function createSupplierCreditNoteEntry(
  supabase: SupabaseClient,
  userId: string,
  creditNote: SupplierInvoice,
  items: SupplierInvoiceItem[],
  supplierType: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(supabase, userId, creditNote.invoice_date)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for credit note date:', creditNote.invoice_date)
    return null
  }

  const desc = `Kreditfaktura lev. ${creditNote.supplier_invoice_number} (ankomst ${creditNote.arrival_number})`
  const lines: CreateJournalEntryLineInput[] = []

  // Credit: Expense accounts (reverse, in SEK)
  const creditLines: CreateJournalEntryLineInput[] = []
  const expenseByAccount = new Map<string, number>()
  for (const item of items) {
    const current = expenseByAccount.get(item.account_number) || 0
    const itemSek = Math.abs(resolveSekAmount(item.line_total, null, creditNote.currency, creditNote.exchange_rate))
    expenseByAccount.set(item.account_number, current + itemSek)
  }

  for (const [accountNumber, amount] of expenseByAccount) {
    creditLines.push({
      account_number: accountNumber,
      debit_amount: 0,
      credit_amount: Math.round(amount * 100) / 100,
      line_description: desc,
    })
  }

  if (supplierType === 'eu_business' && creditNote.reverse_charge) {
    // Reverse the fiktiv moms (swap debit/credit from registration)
    const vatRate = getDefaultVatRate(creditNote.vat_treatment)
    const absSubtotalSek = Math.abs(resolveSekAmount(creditNote.subtotal, creditNote.subtotal_sek, creditNote.currency, creditNote.exchange_rate))
    const vatAmount = Math.round(absSubtotalSek * vatRate * 100) / 100
    creditLines.push({
      account_number: '2645',
      debit_amount: 0,
      credit_amount: vatAmount,
      line_description: `Omvänd fiktiv ingående moms ${desc}`,
    })
    // 2614 is a debit (reversal of the output VAT credit)
    lines.push({
      account_number: '2614',
      debit_amount: vatAmount,
      credit_amount: 0,
      line_description: `Omvänd fiktiv utgående moms ${desc}`,
    })
  } else {
    const absVat = Math.abs(resolveSekAmount(creditNote.vat_amount, creditNote.vat_amount_sek, creditNote.currency, creditNote.exchange_rate))
    if (absVat > 0) {
      // Credit: Ingående moms (reverse)
      creditLines.push({
        account_number: '2641',
        debit_amount: 0,
        credit_amount: Math.round(absVat * 100) / 100,
        line_description: `Ingående moms ${desc}`,
      })
    }
  }

  lines.push(...creditLines)

  // Debit: Leverantörsskulder — balance guarantee: debit = sum of credits minus other debits
  const totalCredits = lines.reduce((sum, l) => sum + l.credit_amount, 0)
  const totalDebits = lines.reduce((sum, l) => sum + l.debit_amount, 0)
  lines.unshift({
    account_number: '2440',
    debit_amount: Math.round((totalCredits - totalDebits) * 100) / 100,
    credit_amount: 0,
    line_description: desc,
  })

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: creditNote.invoice_date,
    description: desc,
    source_type: 'supplier_credit_note',
    source_id: creditNote.id,
    lines,
  }

  return createJournalEntry(supabase, userId, input)
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
