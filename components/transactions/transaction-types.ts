import type { Transaction, TransactionCategory, Invoice, Customer, VatTreatment } from '@/types'

// Shared transaction type with potential invoice data
export interface TransactionWithInvoice extends Transaction {
  potential_invoice?: Invoice & { customer?: Customer }
}

// Page view modes
export type ViewMode = 'inbox' | 'history'
export type HistoryFilter = 'all' | 'business' | 'private'

// Handler types
export type CategorizeHandler = (
  id: string,
  isBusiness: boolean,
  category?: TransactionCategory,
  vatTreatment?: VatTreatment,
  accountOverride?: string
) => Promise<boolean>

export type MatchInvoiceHandler = (
  transactionId: string,
  invoiceId: string
) => Promise<boolean>

// Category option type
export interface CategoryOption {
  value: TransactionCategory
  label: string
}

// Shared category arrays
export const EXPENSE_CATEGORIES: CategoryOption[] = [
  { value: 'expense_equipment', label: 'Utrustning' },
  { value: 'expense_software', label: 'Programvara' },
  { value: 'expense_travel', label: 'Resor' },
  { value: 'expense_office', label: 'Kontor' },
  { value: 'expense_marketing', label: 'Marknadsföring' },
  { value: 'expense_professional_services', label: 'Konsulter' },
  { value: 'expense_education', label: 'Utbildning' },
  { value: 'expense_bank_fees', label: 'Bankavgift' },
  { value: 'expense_card_fees', label: 'Kortavgift' },
  { value: 'expense_currency_exchange', label: 'Valutaväxling' },
  { value: 'expense_other', label: 'Övrigt' },
]

export const INCOME_CATEGORIES: CategoryOption[] = [
  { value: 'income_services', label: 'Tjänster' },
  { value: 'income_products', label: 'Produkter' },
  { value: 'income_other', label: 'Övrigt' },
]

export const VAT_TREATMENT_OPTIONS: { value: VatTreatment | 'none'; label: string }[] = [
  { value: 'standard_25', label: 'Moms 25%' },
  { value: 'reduced_12', label: 'Moms 12%' },
  { value: 'reduced_6', label: 'Moms 6%' },
  { value: 'reverse_charge', label: 'Omvänd skattskyldighet' },
  { value: 'export', label: 'Export' },
  { value: 'exempt', label: 'Momsfri' },
  { value: 'none', label: 'Ingen moms' },
]
