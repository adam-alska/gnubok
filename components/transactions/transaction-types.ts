import type { Transaction, TransactionCategory, Invoice, Customer, VatTreatment } from '@/types'

// Shared transaction type with potential invoice data
export interface TransactionWithInvoice extends Transaction {
  potential_invoice?: Invoice & { customer?: Customer }
}

// Page view modes
export type ViewMode = 'inbox' | 'history'
export type HistoryFilter = 'all' | 'business' | 'private'

// Handler types
// Returns the journal_entry_id on success, null on failure
export type CategorizeHandler = (
  id: string,
  isBusiness: boolean,
  category?: TransactionCategory,
  vatTreatment?: VatTreatment,
  accountOverride?: string
) => Promise<string | null>

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
  { value: 'expense_representation', label: 'Representation' },
  { value: 'expense_equipment', label: 'Utrustning' },
  { value: 'expense_software', label: 'Programvara' },
  { value: 'expense_consumables', label: 'Material' },
  { value: 'expense_travel', label: 'Resor' },
  { value: 'expense_office', label: 'Kontor' },
  { value: 'expense_vehicle', label: 'Bil & drivmedel' },
  { value: 'expense_telecom', label: 'Telefon & internet' },
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

export interface VatTreatmentOption {
  value: VatTreatment | 'none'
  label: string
  description?: string
}

export const VAT_TREATMENT_OPTIONS: VatTreatmentOption[] = [
  { value: 'standard_25', label: 'Moms 25%' },
  { value: 'reduced_12', label: 'Moms 12%', description: 'Livsmedel, hotell, camping' },
  { value: 'reduced_6', label: 'Moms 6%', description: 'Böcker, tidningar, kollektivtrafik' },
  { value: 'reverse_charge', label: 'Omvänd skattskyldighet', description: 'Köparen redovisar momsen (EU-tjänster m.m.)' },
  { value: 'export', label: 'Export', description: 'Försäljning utanför EU (behåller avdragsrätt)' },
  { value: 'exempt', label: 'Momsfri', description: 'Undantaget enligt ML (vård, utbildning, finans)' },
  { value: 'none', label: 'Ingen moms', description: 'Ej momspliktigt (t.ex. lön, privata uttag)' },
]
