// Entity types
export type EntityType = 'enskild_firma' | 'aktiebolag'

// Transaction categories
export type TransactionCategory =
  | 'income_services'
  | 'income_products'
  | 'income_other'
  | 'expense_equipment'
  | 'expense_software'
  | 'expense_travel'
  | 'expense_office'
  | 'expense_marketing'
  | 'expense_professional_services'
  | 'expense_education'
  | 'expense_bank_fees'
  | 'expense_card_fees'
  | 'expense_currency_exchange'
  | 'expense_other'
  | 'private'
  | 'uncategorized'

// Customer types for VAT handling
export type CustomerType =
  | 'individual'        // Swedish private person
  | 'swedish_business'  // Swedish company
  | 'eu_business'       // EU company (needs VAT validation)
  | 'non_eu_business'   // Non-EU company

// Invoice status
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'credited'

// VAT treatment
export type VatTreatment =
  | 'standard_25'       // 25% Swedish VAT
  | 'reduced_12'        // 12% reduced rate
  | 'reduced_6'         // 6% reduced rate
  | 'reverse_charge'    // EU reverse charge (0%)
  | 'export'            // Non-EU export (0%)
  | 'exempt'            // VAT exempt

// Moms reporting period
export type MomsPeriod = 'monthly' | 'quarterly' | 'yearly'

// Bank connection status
export type BankConnectionStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'error'

// Salary payment status
export type SalaryPaymentStatus = 'planned' | 'paid' | 'reported'

// Currency types
export type Currency = 'SEK' | 'EUR' | 'USD' | 'GBP' | 'NOK' | 'DKK'

// Profile (extends auth.users)
export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

// Company Settings
export interface CompanySettings {
  id: string
  user_id: string

  // Entity info
  entity_type: EntityType
  company_name: string | null
  org_number: string | null

  // Address
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  city: string | null
  country: string

  // Tax registration
  f_skatt: boolean
  vat_registered: boolean
  vat_number: string | null
  moms_period: MomsPeriod | null

  // Fiscal year
  fiscal_year_start_month: number  // 1-12

  // Preliminary tax
  preliminary_tax_monthly: number | null

  // Bank details for invoices
  bank_name: string | null
  clearing_number: string | null
  account_number: string | null
  iban: string | null
  bic: string | null

  // Onboarding
  onboarding_step: number
  onboarding_complete: boolean

  // Timestamps
  created_at: string
  updated_at: string
}

// Bank Connection
export interface BankConnection {
  id: string
  user_id: string

  bank_name: string
  bank_id: string

  // Enable Banking specific
  session_id: string | null
  authorization_id: string | null

  // Account info
  accounts: BankAccount[]

  // Status
  status: BankConnectionStatus

  // Consent
  consent_expires_at: string | null
  last_synced_at: string | null

  created_at: string
  updated_at: string
}

export interface BankAccount {
  uid: string  // Enable Banking account UID
  iban: string | null
  name: string | null
  currency: Currency
  balance: number | null
}

// Transaction
export interface Transaction {
  id: string
  user_id: string

  // Source
  bank_connection_id: string | null
  external_id: string | null  // For deduplication

  // Details
  date: string
  description: string
  amount: number  // Positive = income, negative = expense
  currency: Currency

  // For non-SEK transactions
  amount_sek: number | null
  exchange_rate: number | null
  exchange_rate_date: string | null

  // Categorization
  category: TransactionCategory
  is_business: boolean | null  // null = uncategorized

  // Linked invoice (for matching)
  invoice_id: string | null

  // Potential invoice match (suggested, not confirmed)
  potential_invoice_id: string | null

  // Bookkeeping
  journal_entry_id: string | null
  mcc_code: number | null
  merchant_name: string | null

  // Receipt link
  receipt_id: string | null

  // Notes
  notes: string | null

  created_at: string
  updated_at: string
}

// Customer
export interface Customer {
  id: string
  user_id: string

  // Basic info
  name: string
  customer_type: CustomerType

  // Contact
  email: string | null
  phone: string | null

  // Address
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  city: string | null
  country: string

  // Tax info
  org_number: string | null
  vat_number: string | null
  vat_number_validated: boolean
  vat_number_validated_at: string | null

  // Payment
  default_payment_terms: number  // Days

  // Notes
  notes: string | null

  created_at: string
  updated_at: string
}

// Invoice
export interface Invoice {
  id: string
  user_id: string
  customer_id: string

  // Invoice number (auto-generated)
  invoice_number: string

  // Dates
  invoice_date: string
  due_date: string

  // Status
  status: InvoiceStatus

  // Currency
  currency: Currency

  // Exchange rate (if non-SEK)
  exchange_rate: number | null
  exchange_rate_date: string | null

  // Amounts
  subtotal: number
  subtotal_sek: number | null

  vat_amount: number
  vat_amount_sek: number | null

  total: number
  total_sek: number | null

  // VAT
  vat_treatment: VatTreatment
  vat_rate: number
  moms_ruta: string | null  // For Swedish VAT reporting (05, 39, 40, etc.)

  // Reference
  your_reference: string | null
  our_reference: string | null

  // Notes
  notes: string | null

  // Reverse charge text (auto-added for EU B2B)
  reverse_charge_text: string | null

  // Credit note reference
  credited_invoice_id: string | null

  // Payment tracking
  paid_at: string | null
  paid_amount: number | null

  created_at: string
  updated_at: string

  // Relations (populated when fetched)
  customer?: Customer
  items?: InvoiceItem[]
}

// Invoice Item
export interface InvoiceItem {
  id: string
  invoice_id: string

  // Order
  sort_order: number

  // Description
  description: string

  // Quantity
  quantity: number
  unit: string  // 'st', 'tim', 'dag', etc.

  // Price
  unit_price: number

  // Calculated
  line_total: number

  created_at: string
}

// Salary Payment (for AB)
export interface SalaryPayment {
  id: string
  user_id: string

  // Payment details
  gross_amount: number
  net_amount: number

  // Employer costs
  employer_tax: number  // Arbetsgivaravgifter (31.42%)
  preliminary_tax: number  // Employee preliminary tax

  // Dates
  payment_date: string
  period_start: string
  period_end: string

  // Status
  status: SalaryPaymentStatus

  // Notes
  notes: string | null

  created_at: string
  updated_at: string
}

// Tax Rates (reference table)
export interface TaxRate {
  id: string

  // Type
  rate_type: 'egenavgifter' | 'bolagsskatt' | 'arbetsgivaravgifter' | 'vat' | 'municipal'

  // Rate
  rate: number

  // Validity
  valid_from: string
  valid_to: string | null

  // Description
  description: string
}

// Form types for creating/updating

export interface CreateCustomerInput {
  name: string
  customer_type: CustomerType
  email?: string
  phone?: string
  address_line1?: string
  address_line2?: string
  postal_code?: string
  city?: string
  country?: string
  org_number?: string
  vat_number?: string
  default_payment_terms?: number
  notes?: string
}

export interface CreateInvoiceInput {
  customer_id: string
  invoice_date: string
  due_date: string
  currency: Currency
  your_reference?: string
  our_reference?: string
  notes?: string
  items: CreateInvoiceItemInput[]
}

export interface CreateInvoiceItemInput {
  description: string
  quantity: number
  unit: string
  unit_price: number
}

export interface CreateTransactionInput {
  date: string
  description: string
  amount: number
  currency: Currency
  category?: TransactionCategory
  is_business?: boolean
  notes?: string
}

// API Response types
export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
  totalPages: number
}

// VAT validation response
export interface VatValidationResult {
  valid: boolean
  name?: string
  address?: string
  country_code?: string
  vat_number?: string
  error?: string
}

// Exchange rate response
export interface ExchangeRate {
  currency: Currency
  rate: number
  date: string
}

// Dashboard summary types
export interface DashboardSummary {
  // Income
  total_income_ytd: number
  total_income_mtd: number

  // Expenses
  total_expenses_ytd: number
  total_expenses_mtd: number

  // Net
  net_income_ytd: number
  net_income_mtd: number

  // Tax estimates
  estimated_tax: TaxEstimate

  // Alerts
  uncategorized_count: number
  unpaid_invoices_count: number
  unpaid_invoices_total: number
  overdue_invoices_count: number

  // Bank
  bank_balance: number | null
  available_balance: number | null  // After tax reservations
}

export interface TaxEstimate {
  // For EF
  egenavgifter?: number
  income_tax?: number // Municipal tax (kommunalskatt)
  state_tax?: number // State tax (statlig skatt) - 20% on high incomes
  grundavdrag?: number // Basic deduction applied

  // For AB
  bolagsskatt?: number

  // Common
  moms_to_pay: number
  total_tax_liability: number

  // Comparison with preliminary
  preliminary_paid_ytd: number
  difference: number  // Positive = underpaying

  // Schablonavdrag (if applied)
  schablonavdrag_deduction?: number
}

// ============================================================
// BAS Kontoplan & Bookkeeping Types
// ============================================================

// Risk levels for mapping rules
export type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH'

// Account types
export type AccountType = 'asset' | 'equity' | 'liability' | 'revenue' | 'expense'
export type NormalBalance = 'debit' | 'credit'
export type PlanType = 'k1' | 'full_bas'

// Journal entry source
export type JournalEntrySourceType =
  | 'manual'
  | 'bank_transaction'
  | 'invoice_created'
  | 'invoice_paid'
  | 'credit_note'
  | 'salary_payment'
  | 'opening_balance'
  | 'year_end'
  | 'storno'
  | 'correction'
  | 'import'
  | 'system'

// Journal entry status
export type JournalEntryStatus = 'draft' | 'posted' | 'reversed'

// Mapping rule type
export type MappingRuleType =
  | 'mcc_code'
  | 'merchant_name'
  | 'description_pattern'
  | 'amount_threshold'
  | 'combined'

// BAS Account
export interface BASAccount {
  id: string
  user_id: string
  account_number: string
  account_name: string
  account_class: number
  account_group: string
  account_type: AccountType
  normal_balance: NormalBalance
  plan_type: PlanType
  is_active: boolean
  is_system_account: boolean
  default_vat_code: string | null
  description: string | null
  sru_code: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// Fiscal Period (Räkenskapsår)
export interface FiscalPeriod {
  id: string
  user_id: string
  name: string
  period_start: string
  period_end: string
  is_closed: boolean
  closed_at: string | null
  locked_at: string | null
  retention_expires_at: string | null
  opening_balances_set: boolean
  closing_entry_id: string | null
  opening_balance_entry_id: string | null
  previous_period_id: string | null
  created_at: string
  updated_at: string
}

// Journal Entry (Verifikation)
export interface JournalEntry {
  id: string
  user_id: string
  fiscal_period_id: string
  voucher_number: number
  voucher_series: string
  entry_date: string
  description: string
  source_type: JournalEntrySourceType
  source_id: string | null
  status: JournalEntryStatus
  committed_at: string | null
  reversed_by_id: string | null
  reverses_id: string | null
  correction_of_id: string | null
  attachment_urls: string[] | null
  created_at: string
  updated_at: string
  // Relations
  lines?: JournalEntryLine[]
}

// Journal Entry Line
export interface JournalEntryLine {
  id: string
  journal_entry_id: string
  account_number: string
  account_id: string | null
  debit_amount: number
  credit_amount: number
  currency: string
  amount_in_currency: number | null
  exchange_rate: number | null
  line_description: string | null
  tax_code: string | null
  cost_center: string | null
  project: string | null
  sort_order: number
  created_at: string
}

// Mapping Rule
export interface MappingRule {
  id: string
  user_id: string | null
  rule_name: string
  rule_type: MappingRuleType
  priority: number
  // Matching
  mcc_codes: number[] | null
  merchant_pattern: string | null
  description_pattern: string | null
  amount_min: number | null
  amount_max: number | null
  // Targets
  debit_account: string | null
  credit_account: string | null
  vat_treatment: string | null
  vat_debit_account: string | null
  vat_credit_account: string | null
  // Risk
  risk_level: RiskLevel
  default_private: boolean
  requires_review: boolean
  confidence_score: number
  // Capitalization
  capitalization_threshold: number | null
  capitalized_debit_account: string | null
  // Meta
  is_active: boolean
  created_at: string
  updated_at: string
}

// Mapping engine result
export interface MappingResult {
  rule: MappingRule | null
  debit_account: string
  credit_account: string
  risk_level: RiskLevel
  confidence: number
  requires_review: boolean
  default_private: boolean
  vat_lines: VatJournalLine[]
  description: string
}

// VAT journal line (auto-generated)
export interface VatJournalLine {
  account_number: string
  debit_amount: number
  credit_amount: number
  description: string
}

// Account Balance (cached)
export interface AccountBalance {
  id: string
  user_id: string
  fiscal_period_id: string
  account_number: string
  account_id: string | null
  opening_debit: number
  opening_credit: number
  period_debit: number
  period_credit: number
  closing_debit: number
  closing_credit: number
  created_at: string
  updated_at: string
}

// Report types
export interface TrialBalanceRow {
  account_number: string
  account_name: string
  account_class: number
  opening_debit: number
  opening_credit: number
  period_debit: number
  period_credit: number
  closing_debit: number
  closing_credit: number
}

export interface IncomeStatementSection {
  title: string
  rows: { account_number: string; account_name: string; amount: number }[]
  subtotal: number
}

export interface IncomeStatementReport {
  revenue_sections: IncomeStatementSection[]
  total_revenue: number
  expense_sections: IncomeStatementSection[]
  total_expenses: number
  financial_sections: IncomeStatementSection[]
  total_financial: number
  net_result: number
  period: { start: string; end: string }
}

export interface BalanceSheetSection {
  title: string
  rows: { account_number: string; account_name: string; amount: number }[]
  subtotal: number
}

export interface BalanceSheetReport {
  asset_sections: BalanceSheetSection[]
  total_assets: number
  equity_liability_sections: BalanceSheetSection[]
  total_equity_liabilities: number
  period: { start: string; end: string }
}

export interface SIEExportOptions {
  fiscal_period_id: string
  company_name: string
  org_number: string | null
  program_name?: string
}

// Input types for creating entries
export interface CreateJournalEntryInput {
  fiscal_period_id: string
  entry_date: string
  description: string
  source_type: JournalEntrySourceType
  source_id?: string
  voucher_series?: string
  lines: CreateJournalEntryLineInput[]
}

export interface CreateJournalEntryLineInput {
  account_number: string
  debit_amount: number
  credit_amount: number
  line_description?: string
  currency?: string
  amount_in_currency?: number
  exchange_rate?: number
  tax_code?: string
  cost_center?: string
  project?: string
}

export interface CreateFiscalPeriodInput {
  name: string
  period_start: string
  period_end: string
}

// ============================================================
// Schablonavdrag (Standard Deductions) Types
// ============================================================

// Housing type for hemmakontor deduction
export type HousingType = 'villa' | 'apartment' // villa = 2000 kr/year, apartment = 4000 kr/year

// Schablonavdrag settings stored in company_settings
export interface SchablonavdragSettings {
  hemmakontor_enabled: boolean
  hemmakontor_housing_type?: HousingType // 'villa' or 'apartment' (default: apartment)
  bil_enabled: boolean
}

// Mileage entry for bil schablonavdrag
export interface MileageEntry {
  id: string
  user_id: string
  date: string
  distance_km: number
  purpose: string
  from_location: string | null
  to_location: string | null
  rate_per_km: number
  total_deduction: number
  created_at: string
  updated_at: string
}

// Input for creating mileage entries
export interface CreateMileageEntryInput {
  date: string
  distance_km: number
  purpose: string
  from_location?: string
  to_location?: string
}

// Schablonavdrag summary for a year
export interface SchablonavdragSummary {
  year: number
  hemmakontor: {
    enabled: boolean
    housing_type: HousingType
    months_active: number
    annual_amount: number // 2000 for villa, 4000 for apartment
    deduction: number
  }
  mileage: {
    enabled: boolean
    total_km: number
    rate_per_km: number // 2.50 kr/km (25 kr/mil)
    total_deduction: number
    entries_count: number
  }
  total_deduction: number
}

// Tax warning levels
export type TaxWarningLevel = 'safe' | 'info' | 'warning' | 'danger'

// Onboarding progress for new user checklist
export interface OnboardingProgress {
  hasCustomers: boolean
  hasInvoices: boolean
  hasReceipts: boolean
  hasBankConnected: boolean
}

// Enhanced tax warning status
export interface TaxWarningStatus {
  level: TaxWarningLevel
  message: string
  percentageDifference: number
  yearEndProjection?: {
    estimatedTotalTax: number
    projectedPreliminaryPayments: number
    projectedDifference: number
  }
  recommendation?: string
}

// Onboarding step data
export interface OnboardingStepData {
  step1?: {
    entity_type: EntityType
  }
  step2?: {
    company_name: string
    org_number?: string
    address_line1?: string
    postal_code?: string
    city?: string
  }
  step3?: {
    f_skatt: boolean
    fiscal_year_start_month: number
    vat_registered: boolean
    vat_number?: string
    moms_period?: MomsPeriod
  }
  step4?: {
    preliminary_tax_monthly?: number
  }
  step5?: {
    bank_name?: string
    clearing_number?: string
    account_number?: string
    iban?: string
    bic?: string
  }
  step6?: {
    bank_connected: boolean
    bank_connection_id?: string
  }
}

// ============================================================
// Calendar & Deadline Types
// ============================================================

// Calendar view mode
export type CalendarViewMode = 'month' | 'week' | 'day'

// Payment calendar day (for invoice due date tracking)
export interface PaymentCalendarDay {
  date: string
  invoices: Invoice[]
  totalExpected: number
  overdueCount: number
}

// Tax deadline types (Swedish Skatteverket)
export type TaxDeadlineType =
  | 'moms_monthly'
  | 'moms_quarterly'
  | 'moms_yearly'
  | 'f_skatt'
  | 'arbetsgivardeklaration'
  | 'inkomstdeklaration_ef'
  | 'inkomstdeklaration_ab'
  | 'arsredovisning'
  | 'periodisk_sammanstallning'
  | 'bokslut'

// Deadline status workflow
export type DeadlineStatus =
  | 'upcoming'       // More than 14 days away
  | 'action_needed'  // Within 14 days, needs attention
  | 'in_progress'    // User is working on it
  | 'submitted'      // Submitted to Skatteverket
  | 'confirmed'      // Confirmed/acknowledged
  | 'overdue'        // Past due date without submission

// Deadline source
export type DeadlineSource = 'system' | 'user'

// Deadline types
export type DeadlineType = 'delivery' | 'invoicing' | 'report' | 'tax' | 'other'
export type DeadlinePriority = 'critical' | 'important' | 'normal'

// Deadline record
export interface Deadline {
  id: string
  user_id: string
  title: string
  due_date: string
  due_time: string | null
  deadline_type: DeadlineType
  priority: DeadlinePriority
  is_completed: boolean
  completed_at: string | null
  customer_id: string | null
  is_auto_generated: boolean
  notes: string | null
  created_at: string
  updated_at: string

  // Tax deadline fields
  tax_deadline_type: TaxDeadlineType | null
  tax_period: string | null
  source: DeadlineSource
  reminder_offsets: number[] | null
  status: DeadlineStatus
  status_changed_at: string
  linked_report_type: string | null
  linked_report_period: Record<string, unknown> | null

  // Relations
  customer?: Customer
}

// Input for creating a deadline
export interface CreateDeadlineInput {
  title: string
  due_date: string
  due_time?: string
  deadline_type: DeadlineType
  priority?: DeadlinePriority
  customer_id?: string
  notes?: string
  // Tax deadline fields
  tax_deadline_type?: TaxDeadlineType
  tax_period?: string
  source?: DeadlineSource
  linked_report_type?: string
  linked_report_period?: Record<string, unknown>
}

// ============================================================
// Push Notification Types
// ============================================================

// Push subscription for Web Push API
export interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

// Notification settings per user
export interface NotificationSettings {
  id: string
  user_id: string
  tax_deadlines_enabled: boolean
  invoice_reminders_enabled: boolean
  quiet_start: string // time format "HH:MM"
  quiet_end: string   // time format "HH:MM"
  email_enabled: boolean
  push_enabled: boolean
  created_at: string
  updated_at: string
}

// Notification type for logging
export type NotificationType = 'tax_deadline' | 'invoice_due' | 'invoice_overdue'

// Notification log entry
export interface NotificationLog {
  id: string
  user_id: string
  notification_type: NotificationType
  reference_id: string
  days_before: number
  sent_at: string
  delivery_status: 'sent' | 'delivered' | 'failed'
}

// ============================================================
// Calendar Feed Types (ICS)
// ============================================================

// Calendar feed for Apple Calendar / Google Calendar sync
export interface CalendarFeed {
  id: string
  user_id: string
  feed_token: string
  is_active: boolean
  include_tax_deadlines: boolean
  include_invoices: boolean
  last_accessed_at: string | null
  access_count: number
  created_at: string
  updated_at: string
}

// Input for creating/updating calendar feed
export interface UpdateCalendarFeedInput {
  include_tax_deadlines?: boolean
  include_invoices?: boolean
}

// Swedish labels for deadline status
export const DEADLINE_STATUS_LABELS: Record<DeadlineStatus, string> = {
  upcoming: 'Kommande',
  action_needed: 'Åtgärd krävs',
  in_progress: 'Pågår',
  submitted: 'Inskickad',
  confirmed: 'Bekräftad',
  overdue: 'Försenad'
}

// Swedish labels for tax deadline types
export const TAX_DEADLINE_TYPE_LABELS: Record<TaxDeadlineType, string> = {
  moms_monthly: 'Momsdeklaration (månad)',
  moms_quarterly: 'Momsdeklaration (kvartal)',
  moms_yearly: 'Momsdeklaration (år)',
  f_skatt: 'F-skatt',
  arbetsgivardeklaration: 'Arbetsgivardeklaration',
  inkomstdeklaration_ef: 'Inkomstdeklaration EF',
  inkomstdeklaration_ab: 'Inkomstdeklaration AB',
  arsredovisning: 'Årsredovisning',
  periodisk_sammanstallning: 'Periodisk sammanställning',
  bokslut: 'Bokslut'
}

// ============================================================
// SIE Import Types
// ============================================================

// SIE import status
export type SIEImportStatus = 'pending' | 'mapped' | 'completed' | 'failed'

// SIE import record
export interface SIEImport {
  id: string
  user_id: string
  filename: string
  file_hash: string
  org_number: string | null
  company_name: string | null
  sie_type: number
  fiscal_year_start: string | null
  fiscal_year_end: string | null
  accounts_count: number
  transactions_count: number
  opening_balance_total: number | null
  status: SIEImportStatus
  error_message: string | null
  fiscal_period_id: string | null
  opening_balance_entry_id: string | null
  imported_at: string | null
  created_at: string
  updated_at: string
}

// SIE account mapping record
export interface SIEAccountMapping {
  id: string
  user_id: string
  source_account: string
  source_name: string | null
  target_account: string
  confidence: number
  match_type: 'exact' | 'name' | 'class' | 'manual'
  created_at: string
  updated_at: string
}

// ============================================================
// Receipt Types (Kvittohantering)
// ============================================================

// Receipt extraction status
export type ReceiptStatus = 'pending' | 'processing' | 'extracted' | 'confirmed' | 'error'

// Receipt record
export interface Receipt {
  id: string
  user_id: string

  // Image storage
  image_url: string
  image_thumbnail_url: string | null

  // Extraction status
  status: ReceiptStatus
  extraction_confidence: number | null

  // Extracted header data
  merchant_name: string | null
  merchant_org_number: string | null
  merchant_vat_number: string | null
  receipt_date: string | null
  receipt_time: string | null
  total_amount: number | null
  currency: string
  vat_amount: number | null

  // Special flags
  is_restaurant: boolean
  is_systembolaget: boolean
  is_foreign_merchant: boolean

  // Restaurant representation data
  representation_persons: number | null
  representation_purpose: string | null

  // Transaction matching
  matched_transaction_id: string | null
  match_confidence: number | null

  // Raw extraction data
  raw_extraction: ReceiptExtractionResult | null

  created_at: string
  updated_at: string

  // Relations (populated when fetched)
  line_items?: ReceiptLineItem[]
  matched_transaction?: Transaction
}

// Receipt line item record
export interface ReceiptLineItem {
  id: string
  receipt_id: string

  // Extracted data
  description: string
  quantity: number
  unit_price: number | null
  line_total: number
  vat_rate: number | null
  vat_amount: number | null

  // Classification
  is_business: boolean | null
  category: TransactionCategory | null
  bas_account: string | null

  // Confidence
  extraction_confidence: number | null
  suggested_category: string | null

  sort_order: number
  created_at: string
}

// AI extraction result from Claude Vision
export interface ReceiptExtractionResult {
  merchant: {
    name: string | null
    orgNumber: string | null
    vatNumber: string | null
    isForeign: boolean
  }
  receipt: {
    date: string | null
    time: string | null
    currency: string
  }
  lineItems: ExtractedLineItem[]
  totals: {
    subtotal: number | null
    vatAmount: number | null
    total: number | null
  }
  flags: {
    isRestaurant: boolean
    isSystembolaget: boolean
    isForeignMerchant: boolean
  }
  confidence: number
}

// Extracted line item from AI
export interface ExtractedLineItem {
  description: string
  quantity: number
  unitPrice: number | null
  lineTotal: number
  vatRate: number | null
  suggestedCategory: string | null
  confidence?: number
}

// Match candidate for receipt-to-transaction matching
export interface ReceiptMatchCandidate {
  transaction: Transaction
  confidence: number
  matchReasons: string[]
  dateVariance: number
  amountVariance: number
}

// Input for creating a receipt
export interface CreateReceiptInput {
  image_url: string
  image_thumbnail_url?: string
}

// Input for confirming receipt line items
export interface ConfirmReceiptInput {
  line_items: ConfirmLineItemInput[]
  matched_transaction_id?: string
  representation_persons?: number
  representation_purpose?: string
}

export interface ConfirmLineItemInput {
  id: string
  is_business: boolean
  category?: TransactionCategory
  bas_account?: string
}

// Receipt queue summary
export interface ReceiptQueueSummary {
  unmatched_receipts_count: number
  unmatched_transactions_count: number
  pending_review_count: number
  streak_count: number
}

// Camera quality feedback
export interface CameraQualityFeedback {
  lightingOk: boolean
  distanceOk: boolean
  focusOk: boolean
  readyToCapture: boolean
  message?: string
}

// Swedish labels for receipt status
export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  pending: 'Väntar',
  processing: 'Analyserar',
  extracted: 'Extraherat',
  confirmed: 'Bekräftat',
  error: 'Fel'
}

// ============================================================
// VAT Declaration Types (Momsdeklaration)
// ============================================================

// VAT period type
export type VatPeriodType = 'monthly' | 'quarterly' | 'yearly'

// VAT declaration rutor (boxes) according to Swedish tax authority
export interface VatDeclarationRutor {
  // Utgående moms (Output VAT)
  ruta05: number  // Utgående moms 25%
  ruta06: number  // Utgående moms 12%
  ruta07: number  // Utgående moms 6%

  // Momspliktigt underlag (VAT-liable base amounts)
  ruta10: number  // Momspliktigt underlag 25%
  ruta11: number  // Momspliktigt underlag 12%
  ruta12: number  // Momspliktigt underlag 6%

  // EU och export
  ruta39: number  // Försäljning av tjänster till annat EU-land (reverse charge)
  ruta40: number  // Export utanför EU

  // Ingående moms (Input VAT)
  ruta48: number  // Ingående moms att dra av

  // Moms att betala eller få tillbaka
  ruta49: number  // Moms att betala (positive) eller återfå (negative)
}

// VAT declaration response
export interface VatDeclaration {
  period: {
    type: VatPeriodType
    year: number
    period: number  // 1-12 for monthly, 1-4 for quarterly, 1 for yearly
    start: string   // YYYY-MM-DD
    end: string     // YYYY-MM-DD
  }
  rutor: VatDeclarationRutor
  // Supporting data
  invoiceCount: number
  transactionCount: number
  // Breakdown by source
  breakdown: {
    invoices: {
      ruta05: number
      ruta06: number
      ruta07: number
      ruta10: number
      ruta11: number
      ruta12: number
      ruta39: number
      ruta40: number
    }
    transactions: {
      ruta48: number  // Ingående moms from categorized expenses
    }
    receipts: {
      ruta48: number  // Ingående moms from receipts
    }
  }
}

// VAT declaration request parameters
export interface VatDeclarationRequest {
  periodType: VatPeriodType
  year: number
  period: number
}

// ============================================================
// NE Declaration Types (Enskild Firma - Sole Proprietorship)
// ============================================================

// NE-bilaga rutor (NE appendix boxes)
export interface NEDeclarationRutor {
  R1: number   // Försäljning med 25% moms (3000-3499 excl 3100)
  R2: number   // Momsfria intäkter (3100, 3970, 3980)
  R3: number   // Bil/bostadsförmån (3200)
  R4: number   // Ränteintäkter (8310-8330)
  R5: number   // Varuinköp (4000-4990)
  R6: number   // Övriga kostnader (5000-6990, 7970)
  R7: number   // Lönekostnader (7000-7699)
  R8: number   // Räntekostnader (8400-8499)
  R9: number   // Avskrivningar fastighet (7820)
  R10: number  // Avskrivningar övrigt (7700-7899 excl 7820)
  R11: number  // Årets resultat (beräknat)
}

// NE account mapping configuration
export interface NEAccountMapping {
  ruta: keyof NEDeclarationRutor
  description: string
  accountRanges: Array<{
    start: string
    end: string
    exclude?: string[]
  }>
  isExpense: boolean  // true = debit normal, false = credit normal
}

// NE declaration response
export interface NEDeclaration {
  fiscalYear: {
    id: string
    name: string
    start: string
    end: string
    isClosed: boolean
  }
  rutor: NEDeclarationRutor
  // Detailed breakdown per ruta
  breakdown: Record<keyof NEDeclarationRutor, {
    accounts: Array<{
      accountNumber: string
      accountName: string
      amount: number
    }>
    total: number
  }>
  // Company info for SRU
  companyInfo: {
    companyName: string
    orgNumber: string | null
  }
  // Warnings
  warnings: string[]
}

// SRU file format types
export interface SRURecord {
  fieldCode: string
  value: string | number
}

export interface SRUFile {
  records: SRURecord[]
  generatedAt: string
}

// Labels for NE rutor
export const NE_RUTA_LABELS: Record<keyof NEDeclarationRutor, string> = {
  R1: 'Försäljning med moms (25%)',
  R2: 'Momsfria intäkter',
  R3: 'Bil/bostadsförmån',
  R4: 'Ränteintäkter',
  R5: 'Varuinköp',
  R6: 'Övriga kostnader',
  R7: 'Lönekostnader',
  R8: 'Räntekostnader',
  R9: 'Avskrivningar fastighet',
  R10: 'Avskrivningar övriga tillgångar',
  R11: 'Årets resultat'
}

// Labels for VAT rutor
export const VAT_RUTA_LABELS: Record<keyof VatDeclarationRutor, string> = {
  ruta05: 'Utgående moms 25%',
  ruta06: 'Utgående moms 12%',
  ruta07: 'Utgående moms 6%',
  ruta10: 'Momspliktigt underlag 25%',
  ruta11: 'Momspliktigt underlag 12%',
  ruta12: 'Momspliktigt underlag 6%',
  ruta39: 'Försäljning av tjänster till EU-land',
  ruta40: 'Export utanför EU',
  ruta48: 'Ingående moms att dra av',
  ruta49: 'Moms att betala/återfå'
}

// ============================================================
// Event Payload Placeholder Types
// ============================================================

/** Credit note is an invoice with a credited_invoice_id */
export interface CreditNote extends Invoice {
  credited_invoice_id: string
}

/** CAMT.053 bank statement (placeholder — CAMT parsing not yet implemented) */
export interface CAMT053Statement {
  messageId: string
  statements: unknown[]
}

/** CAMT.054 payment notification (placeholder — CAMT parsing not yet implemented) */
export interface CAMT054Notification {
  messageId: string
  notifications: unknown[]
}

/** Security event payload for audit events */
export interface AuditSecurityEvent {
  eventType: string
  description: string
  metadata: Record<string, unknown>
}

/** Generic key-value store record for extensions */
export interface ExtensionDataRecord {
  id: string
  user_id: string
  extension_id: string
  key: string
  value: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ============================================================
// Tax Code Types
// ============================================================

// Tax code identifiers (standard Swedish codes)
export type TaxCodeId =
  | 'MP1' | 'MP2' | 'MP3'       // Output VAT 25%, 12%, 6%
  | 'MPI' | 'MPI12' | 'MPI6'    // Input VAT 25%, 12%, 6%
  | 'IV'                          // Intra-EU acquisition
  | 'EUS'                         // EU sale (reverse charge)
  | 'IP'                          // Import
  | 'EXP'                         // Export outside EU
  | 'OSS'                         // One Stop Shop
  | 'NONE'                        // VAT exempt

export interface TaxCode {
  id: string
  user_id: string | null
  code: string
  description: string
  rate: number
  moms_basis_boxes: string[]
  moms_tax_boxes: string[]
  moms_input_boxes: string[]
  is_output_vat: boolean
  is_reverse_charge: boolean
  is_eu: boolean
  is_export: boolean
  is_oss: boolean
  is_system: boolean
  created_at: string
  updated_at: string
}

// ============================================================
// Document Archive Types
// ============================================================

export type DocumentUploadSource =
  | 'camera'
  | 'file_upload'
  | 'email'
  | 'e_invoice'
  | 'scan'
  | 'api'
  | 'system'

export interface DocumentAttachment {
  id: string
  user_id: string
  storage_path: string
  file_name: string
  file_size_bytes: number | null
  mime_type: string | null
  sha256_hash: string
  version: number
  original_id: string | null
  superseded_by_id: string | null
  is_current_version: boolean
  uploaded_by: string | null
  upload_source: DocumentUploadSource | null
  digitization_date: string | null
  journal_entry_id: string | null
  journal_entry_line_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateDocumentAttachmentInput {
  storage_path: string
  file_name: string
  file_size_bytes?: number
  mime_type?: string
  sha256_hash: string
  upload_source?: DocumentUploadSource
  journal_entry_id?: string
  journal_entry_line_id?: string
}

// ============================================================
// Audit Log Types
// ============================================================

export type AuditAction =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'COMMIT'
  | 'REVERSE'
  | 'CORRECT'
  | 'LOCK_PERIOD'
  | 'CLOSE_PERIOD'
  | 'DOCUMENT_DELETE_BLOCKED'
  | 'RETENTION_BLOCK'
  | 'SECURITY_EVENT'

export interface AuditLogEntry {
  id: string
  user_id: string
  action: AuditAction
  table_name: string | null
  record_id: string | null
  actor_id: string | null
  old_state: Record<string, unknown> | null
  new_state: Record<string, unknown> | null
  description: string | null
  created_at: string
}

// ============================================================
// Dimension Types (Kostnadsställen & Projekt)
// ============================================================

export interface CostCenter {
  id: string
  user_id: string
  code: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  code: string
  name: string
  is_active: boolean
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Voucher Gap Detection
// ============================================================

export interface VoucherGap {
  gap_start: number
  gap_end: number
}

// ============================================================
// Year-End Closing Types (Årsbokslut)
// ============================================================

export interface YearEndValidation {
  ready: boolean
  errors: string[]
  warnings: string[]
  draftCount: number
  voucherGaps: VoucherGap[]
  trialBalanceBalanced: boolean
}

export interface YearEndPreview {
  netResult: number
  closingAccount: string
  closingAccountName: string
  closingLines: CreateJournalEntryLineInput[]
  resultAccountSummary: { account_number: string; account_name: string; amount: number }[]
}

export interface YearEndResult {
  closingEntry: JournalEntry
  nextPeriod: FiscalPeriod
  openingBalanceEntry: JournalEntry
}

export interface PeriodStatus {
  is_locked: boolean
  is_closed: boolean
  has_closing_entry: boolean
  has_opening_balances: boolean
  draft_count: number
  next_period_exists: boolean
}

// ============================================================
// Invoice Reminder Types (Betalningspåminnelser)
// ============================================================

// Response type from customer action
export type ReminderResponseType = 'marked_paid' | 'disputed'

// Invoice reminder record
export interface InvoiceReminder {
  id: string
  invoice_id: string
  user_id: string
  reminder_level: 1 | 2 | 3
  sent_at: string
  email_to: string
  response_type: ReminderResponseType | null
  response_at: string | null
  action_token: string
  action_token_used: boolean
  created_at: string
}

// Swedish labels for reminder levels
export const REMINDER_LEVEL_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Vänlig påminnelse',
  2: 'Andra påminnelsen',
  3: 'Slutlig påminnelse'
}

// Reminder level descriptions
export const REMINDER_LEVEL_DESCRIPTIONS: Record<1 | 2 | 3, string> = {
  1: '15 dagar efter förfallodatum',
  2: '30 dagar efter förfallodatum',
  3: '45 dagar efter förfallodatum'
}
