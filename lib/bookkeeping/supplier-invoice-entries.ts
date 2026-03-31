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
 * Build a BFL-compliant verifikation description with event type, counterparty, and suffix.
 * Falls back to prefix + invoiceNumber + suffix if name is not provided (backward compat).
 */
function buildSupplierDescription(
  prefix: string, invoiceNumber: string, supplierName?: string, suffix?: string
): string {
  const base = supplierName
    ? `${prefix} ${invoiceNumber}, ${supplierName}`
    : `${prefix} ${invoiceNumber}`
  return suffix ? `${base} ${suffix}` : base
}

/**
 * Create journal entry when a supplier invoice is registered (accrual method)
 *
 * Swedish domestic (25% VAT):
 *   Debit  5xxx/6xxx (per item's account_number)   [item line_total]
 *   Debit  2641 Ingående moms (per rate)            [VAT per rate group]
 *   Credit 2440 Leverantörsskulder                  [total incl VAT]
 *
 * EU/non-EU reverse charge (services):
 *   Debit  5xxx/6xxx (per item)                     [total]
 *   Debit  2645 Beräknad ingående moms (per rate)   [fiktiv VAT per rate]
 *   Credit 26x4 Utgående moms omvänd (per rate)     [fiktiv VAT per rate]
 *   Credit 2440 Leverantörsskulder                  [total]
 *
 * Note: Goods imports via Tullverket (customs) use a different accounting path
 * (2615/2645) and are not handled here — only services use reverse charge.
 */
export async function createSupplierInvoiceRegistrationEntry(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
  invoice: SupplierInvoice,
  items: SupplierInvoiceItem[],
  supplierType: string,
  supplierName?: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(supabase, companyId, invoice.invoice_date)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for invoice date:', invoice.invoice_date)
    return null
  }

  const lines: CreateJournalEntryLineInput[] = []
  const desc = buildSupplierDescription('Leverantörsfaktura', invoice.supplier_invoice_number, supplierName, `(ankomst ${invoice.arrival_number})`)
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

  const isReverseCharge = (supplierType === 'eu_business' || supplierType === 'non_eu_business') && invoice.reverse_charge

  if (isReverseCharge) {
    // EU/non-EU reverse charge: fiktiv moms entries per rate group
    const vatByRate = groupVatByRate(items, invoice.currency, invoice.exchange_rate)
    for (const [rate, amount] of vatByRate) {
      if (rate > 0 && amount > 0) {
        const rcLines = generateReverseChargeLines(amount / rate, rate)
        lines.push(...rcLines)
      }
    }
  } else if (invoice.vat_amount > 0) {
    // Domestic: Debit ingående moms per rate group
    const vatByRate = groupVatByRate(items, invoice.currency, invoice.exchange_rate)
    for (const [rate, amount] of vatByRate) {
      if (amount > 0) {
        lines.push({
          account_number: '2641',
          debit_amount: Math.round(amount * 100) / 100,
          credit_amount: 0,
          line_description: `Ingående moms ${Math.round(rate * 100)}% ${desc}`,
        })
      }
    }
  }

  // Credit: Leverantörsskulder — balance guarantee: ensures sum(debits) === sum(credits)
  // For reverse charge, intermediate credits (2614/2624/2634) already exist, so we subtract them
  const totalDebits = lines.reduce((sum, l) => sum + l.debit_amount, 0)
  const totalCredits = lines.reduce((sum, l) => sum + l.credit_amount, 0)
  lines.push({
    account_number: '2440',
    debit_amount: 0,
    credit_amount: Math.round((totalDebits - totalCredits) * 100) / 100,
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

  return createJournalEntry(supabase, companyId, userId, input)
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
  companyId: string,
  userId: string,
  invoice: SupplierInvoice,
  paymentAmount: number,
  paymentDate: string,
  exchangeRateDifference?: number,
  supplierName?: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(supabase, companyId, paymentDate)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for payment date:', paymentDate)
    return null
  }

  const desc = buildSupplierDescription('Utbetalning leverantörsfaktura', invoice.supplier_invoice_number, supplierName, `(ankomst ${invoice.arrival_number})`)
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

  return createJournalEntry(supabase, companyId, userId, input)
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
  companyId: string,
  userId: string,
  invoice: SupplierInvoice,
  items: SupplierInvoiceItem[],
  paymentDate: string,
  supplierType: string,
  supplierName?: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(supabase, companyId, paymentDate)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for payment date:', paymentDate)
    return null
  }

  const desc = buildSupplierDescription('Kontantbetalning leverantörsfaktura', invoice.supplier_invoice_number, supplierName)
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

  const isReverseCharge = (supplierType === 'eu_business' || supplierType === 'non_eu_business') && invoice.reverse_charge

  if (isReverseCharge) {
    // EU/non-EU reverse charge: fiktiv moms entries per rate group
    const vatByRate = groupVatByRate(items, invoice.currency, invoice.exchange_rate)
    for (const [rate, amount] of vatByRate) {
      if (rate > 0 && amount > 0) {
        const rcLines = generateReverseChargeLines(amount / rate, rate)
        lines.push(...rcLines)
      }
    }
  } else if (invoice.vat_amount > 0) {
    // Domestic: Debit ingående moms per rate group
    const vatByRate = groupVatByRate(items, invoice.currency, invoice.exchange_rate)
    for (const [rate, amount] of vatByRate) {
      if (amount > 0) {
        lines.push({
          account_number: '2641',
          debit_amount: Math.round(amount * 100) / 100,
          credit_amount: 0,
          line_description: `Ingående moms ${Math.round(rate * 100)}% ${desc}`,
        })
      }
    }
  }

  // Credit: Företagskonto — balance guarantee: ensures sum(debits) === sum(credits)
  // For reverse charge, intermediate credits (2614/2624/2634) already exist, so we subtract them
  const totalDebits = lines.reduce((sum, l) => sum + l.debit_amount, 0)
  const totalCredits = lines.reduce((sum, l) => sum + l.credit_amount, 0)
  lines.push({
    account_number: '1930',
    debit_amount: 0,
    credit_amount: Math.round((totalDebits - totalCredits) * 100) / 100,
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

  return createJournalEntry(supabase, companyId, userId, input)
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
  companyId: string,
  userId: string,
  creditNote: SupplierInvoice,
  items: SupplierInvoiceItem[],
  supplierType: string,
  supplierName?: string
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(supabase, companyId, creditNote.invoice_date)
  if (!fiscalPeriodId) {
    log.warn('No open fiscal period found for credit note date:', creditNote.invoice_date)
    return null
  }

  const desc = buildSupplierDescription('Kreditfaktura leverantör', creditNote.supplier_invoice_number, supplierName, `(ankomst ${creditNote.arrival_number})`)
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

  const isReverseCharge = (supplierType === 'eu_business' || supplierType === 'non_eu_business') && creditNote.reverse_charge

  if (isReverseCharge) {
    // Reverse the fiktiv moms per rate group (swap debit/credit from registration)
    const vatByRate = groupVatByRate(items, creditNote.currency, creditNote.exchange_rate, true)
    for (const [rate, amount] of vatByRate) {
      if (rate > 0 && amount > 0) {
        // Determine the output account for this rate
        let outputAccount: string
        switch (rate) {
          case 0.12: outputAccount = '2624'; break
          case 0.06: outputAccount = '2634'; break
          default: outputAccount = '2614'; break
        }
        creditLines.push({
          account_number: '2645',
          debit_amount: 0,
          credit_amount: amount,
          line_description: `Omvänd fiktiv ingående moms ${Math.round(rate * 100)}% ${desc}`,
        })
        lines.push({
          account_number: outputAccount,
          debit_amount: amount,
          credit_amount: 0,
          line_description: `Omvänd fiktiv utgående moms ${Math.round(rate * 100)}% ${desc}`,
        })
      }
    }
  } else {
    // Domestic: Credit ingående moms per rate group (reverse)
    const vatByRate = groupVatByRate(items, creditNote.currency, creditNote.exchange_rate, true)
    for (const [rate, amount] of vatByRate) {
      if (amount > 0) {
        creditLines.push({
          account_number: '2641',
          debit_amount: 0,
          credit_amount: amount,
          line_description: `Ingående moms ${Math.round(rate * 100)}% ${desc}`,
        })
      }
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

  return createJournalEntry(supabase, companyId, userId, input)
}

/**
 * Group items by VAT rate and sum the VAT amount per rate.
 * Returns a Map<rate, totalVatAmount> for generating per-rate journal lines.
 */
function groupVatByRate(
  items: SupplierInvoiceItem[],
  currency: string,
  exchangeRate: number | null,
  useAbsoluteValues = false
): Map<number, number> {
  const vatByRate = new Map<number, number>()
  for (const item of items) {
    const rate = item.vat_rate ?? 0.25
    let itemSek = resolveSekAmount(item.line_total, null, currency, exchangeRate)
    if (useAbsoluteValues) itemSek = Math.abs(itemSek)
    const itemVat = Math.round(itemSek * rate * 100) / 100
    vatByRate.set(rate, (vatByRate.get(rate) || 0) + itemVat)
  }
  return vatByRate
}
