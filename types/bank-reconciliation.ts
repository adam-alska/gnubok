import type { Transaction, Invoice, Customer, MappingRule } from '@/types'

// =============================================================================
// Match types
// =============================================================================

export type ReconciliationMatchType =
  | 'auto_invoice'
  | 'auto_rule'
  | 'manual'
  | 'split'
  | 'unmatched'

export type ReconciliationSessionStatus = 'in_progress' | 'completed' | 'cancelled'

export type PaymentMethodType =
  | 'bankgiro'
  | 'plusgiro'
  | 'swish'
  | 'bank_transfer'
  | 'cash'
  | 'card'

// =============================================================================
// Database record types
// =============================================================================

export interface BankReconciliationSession {
  id: string
  user_id: string
  bank_connection_id: string | null
  account_name: string | null
  account_iban: string | null
  period_start: string
  period_end: string
  opening_balance: number
  closing_balance: number
  status: ReconciliationSessionStatus
  matched_count: number
  unmatched_count: number
  total_transactions: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface BankReconciliationItem {
  id: string
  session_id: string
  transaction_id: string
  match_type: ReconciliationMatchType
  matched_invoice_id: string | null
  matched_supplier_invoice_id: string | null
  journal_entry_id: string | null
  confidence_score: number
  is_reconciled: boolean
  reconciled_at: string | null
  notes: string | null
  created_at: string
  // Relations (populated when fetched)
  transaction?: Transaction
  matched_invoice?: Invoice & { customer?: Customer }
}

export interface PaymentMethod {
  id: string
  user_id: string
  method_type: PaymentMethodType
  account_number: string | null
  description: string | null
  is_default: boolean
  linked_bank_account: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// =============================================================================
// Engine types
// =============================================================================

export interface ReconciliationSuggestion {
  transaction: Transaction
  item: BankReconciliationItem
  suggestions: MatchSuggestion[]
}

export interface MatchSuggestion {
  type: 'invoice' | 'supplier_invoice' | 'rule' | 'manual'
  id: string
  label: string
  description: string
  confidence: number
  matchReason: string
  // Populated for invoice matches
  invoice?: Invoice & { customer?: Customer }
  // Populated for supplier invoice matches
  supplierInvoice?: {
    id: string
    invoice_number: string
    supplier_name: string
    total: number
    due_date: string
  }
  // Populated for rule matches
  rule?: MappingRule
}

export interface ReconciliationAction {
  itemId: string
  matchType: ReconciliationMatchType
  matchId?: string
  notes?: string
  // For manual booking
  debitAccount?: string
  creditAccount?: string
  // For split transactions
  splits?: SplitEntry[]
}

export interface SplitEntry {
  amount: number
  description: string
  debitAccount: string
  creditAccount: string
  vatAmount?: number
}

export interface ReconciliationSummary {
  sessionId: string
  totalTransactions: number
  matchedCount: number
  unmatchedCount: number
  autoMatchedCount: number
  manualMatchedCount: number
  splitCount: number
  totalAmount: number
  matchedAmount: number
  unmatchedAmount: number
  progressPercent: number
}

// =============================================================================
// Input types
// =============================================================================

export interface CreateReconciliationSessionInput {
  bank_connection_id?: string
  account_name?: string
  account_iban?: string
  period_start: string
  period_end: string
  opening_balance?: number
  closing_balance?: number
}

export interface ReconcileItemInput {
  match_type: ReconciliationMatchType
  matched_invoice_id?: string
  matched_supplier_invoice_id?: string
  notes?: string
  // For manual booking
  debit_account?: string
  credit_account?: string
  description?: string
}

export interface SplitTransactionInput {
  splits: {
    amount: number
    description: string
    debit_account: string
    credit_account: string
  }[]
}

export interface CreatePaymentMethodInput {
  method_type: PaymentMethodType
  account_number?: string
  description?: string
  is_default?: boolean
  linked_bank_account?: string
}

// =============================================================================
// Filter / view types
// =============================================================================

export type ReconciliationFilter = 'all' | 'unmatched' | 'matched' | 'suggestions'

export interface ReconciliationWorkspaceState {
  sessionId: string
  selectedItemId: string | null
  filter: ReconciliationFilter
  searchQuery: string
}

// =============================================================================
// Bankgiro / Plusgiro types
// =============================================================================

export interface BankgiroPaymentRecord {
  transactionDate: string
  amount: number
  reference: string
  senderName: string
  senderAccount: string
  recordType: string
}

export interface BankgiroFileParseResult {
  records: BankgiroPaymentRecord[]
  totalAmount: number
  recordCount: number
  accountNumber: string
  fileDate: string
}

// =============================================================================
// Labels
// =============================================================================

export const MATCH_TYPE_LABELS: Record<ReconciliationMatchType, string> = {
  auto_invoice: 'Auto (faktura)',
  auto_rule: 'Auto (regel)',
  manual: 'Manuell',
  split: 'Delad',
  unmatched: 'Ej matchad',
}

export const SESSION_STATUS_LABELS: Record<ReconciliationSessionStatus, string> = {
  in_progress: 'Pågår',
  completed: 'Klar',
  cancelled: 'Avbruten',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  bankgiro: 'Bankgiro',
  plusgiro: 'Plusgiro',
  swish: 'Swish',
  bank_transfer: 'Bankoverföring',
  cash: 'Kontant',
  card: 'Kort',
}
