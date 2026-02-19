import { createJournalEntry, findFiscalPeriod } from '../bookkeeping/engine'
import type {
  CreateJournalEntryInput,
  CreateJournalEntryLineInput,
  JournalEntry,
} from '@/types'
import type { SupplierInvoice, SupplierInvoiceItem } from '@/types/suppliers'

/**
 * Create journal entry when a supplier invoice is booked (approved)
 *
 * Standard domestic supplier invoice (25% VAT):
 *   Debit  {expense account from line items}  [line_total]
 *   Debit  2640  Ingående moms                [vat_amount]
 *   Credit 2440  Leverantörsskulder            [total]
 *
 * For each line item:
 *   - If account_number is specified, use that account
 *   - Otherwise, use 4000 (Varuinköp) as default
 *
 * The VAT input account is always 2640 (Ingående moms)
 * The supplier debt account is always 2440 (Leverantörsskulder)
 */
export async function createSupplierInvoiceJournalEntry(
  userId: string,
  invoice: SupplierInvoice,
  items: SupplierInvoiceItem[]
): Promise<JournalEntry | null> {
  const entryDate = invoice.invoice_date || invoice.received_date || new Date().toISOString().split('T')[0]

  const fiscalPeriodId = await findFiscalPeriod(userId, entryDate)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period found for supplier invoice date:', entryDate)
    return null
  }

  const lines: CreateJournalEntryLineInput[] = []

  // Group line items by account to consolidate journal entry lines
  const accountTotals = new Map<string, { total: number; descriptions: string[] }>()

  for (const item of items) {
    const account = item.account_number || '4000' // Default to Varuinköp
    const existing = accountTotals.get(account)
    if (existing) {
      existing.total += item.line_total
      if (item.description) {
        existing.descriptions.push(item.description)
      }
    } else {
      accountTotals.set(account, {
        total: item.line_total,
        descriptions: item.description ? [item.description] : [],
      })
    }
  }

  // Debit: Expense accounts (from line items)
  for (const [accountNumber, data] of accountTotals) {
    lines.push({
      account_number: accountNumber,
      debit_amount: data.total,
      credit_amount: 0,
      line_description: data.descriptions.length > 0
        ? data.descriptions.join(', ').slice(0, 200)
        : `Leverantörsfaktura ${invoice.invoice_number}`,
    })
  }

  // Debit: Ingående moms (VAT input)
  if (invoice.vat_amount > 0) {
    const vatAccount = getInputVatAccount(invoice.vat_rate)
    lines.push({
      account_number: vatAccount,
      debit_amount: invoice.vat_amount,
      credit_amount: 0,
      line_description: `Ingående moms faktura ${invoice.invoice_number}`,
    })
  }

  // Credit: Leverantörsskulder (total including VAT)
  lines.push({
    account_number: '2440', // Leverantörsskulder
    debit_amount: 0,
    credit_amount: invoice.total,
    line_description: `Leverantörsfaktura ${invoice.invoice_number}`,
    currency: invoice.currency !== 'SEK' ? invoice.currency : undefined,
    amount_in_currency: invoice.currency !== 'SEK' ? invoice.total : undefined,
    exchange_rate: invoice.exchange_rate || undefined,
  })

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: entryDate,
    description: `Leverantörsfaktura ${invoice.invoice_number} - ${invoice.supplier?.name || 'Leverantör'}`,
    source_type: 'manual',
    source_id: invoice.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Create journal entry when a supplier invoice is paid
 *
 *   Debit  2440  Leverantörsskulder  [total]
 *   Credit 1930  Företagskonto       [total]
 */
export async function createSupplierPaymentJournalEntry(
  userId: string,
  invoice: SupplierInvoice,
  paymentDate: string,
  bankAccount: string = '1930'
): Promise<JournalEntry | null> {
  const fiscalPeriodId = await findFiscalPeriod(userId, paymentDate)
  if (!fiscalPeriodId) {
    console.warn('No open fiscal period found for payment date:', paymentDate)
    return null
  }

  const paymentAmount = invoice.paid_amount || invoice.total

  const lines: CreateJournalEntryLineInput[] = [
    {
      account_number: '2440', // Leverantörsskulder
      debit_amount: paymentAmount,
      credit_amount: 0,
      line_description: `Betalning leverantörsfaktura ${invoice.invoice_number}`,
    },
    {
      account_number: bankAccount, // Företagskonto (or other bank account)
      debit_amount: 0,
      credit_amount: paymentAmount,
      line_description: `Betalning leverantörsfaktura ${invoice.invoice_number}`,
    },
  ]

  const input: CreateJournalEntryInput = {
    fiscal_period_id: fiscalPeriodId,
    entry_date: paymentDate,
    description: `Betalning leverantörsfaktura ${invoice.invoice_number} - ${invoice.supplier?.name || 'Leverantör'}`,
    source_type: 'manual',
    source_id: invoice.id,
    lines,
  }

  return createJournalEntry(userId, input)
}

/**
 * Get the correct input VAT account based on VAT rate
 *
 * BAS accounts:
 *   2640 - Ingående moms (standard, covers all rates)
 *   2641 - Deductible input VAT 25%
 *   2642 - Deductible input VAT 12%
 *   2643 - Deductible input VAT 6%
 */
function getInputVatAccount(vatRate: number): string {
  // Use the general ingående moms account
  // Some companies prefer the broken-out accounts (2641/2642/2643)
  // but 2640 is the most common for small businesses
  switch (vatRate) {
    case 25:
      return '2640'
    case 12:
      return '2640'
    case 6:
      return '2640'
    default:
      return '2640'
  }
}
