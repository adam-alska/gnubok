// Entity types
export type EntityType = 'enskild_firma' | 'aktiebolag' | 'light'

// Shadow Ledger types (Light mode)
export type ShadowLedgerEntryType = 'payout' | 'gift' | 'expense' | 'hobby_income' | 'hobby_expense'
export type ShadowLedgerSource = 'manual' | 'email_parser' | 'gigapay_sync' | 'bank_match'

// Transaction categories
export type TransactionCategory =
  | 'income_services'
  | 'income_products'
  | 'income_sponsorship'
  | 'income_affiliate'
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

  // Light mode fields
  municipal_tax_rate: number | null
  municipality_code: string | null
  church_tax: boolean
  church_tax_rate: number | null
  church_parish_code: string | null
  umbrella_provider: string | null
  umbrella_fee_percent: number | null
  umbrella_pension_percent: number | null
  umbrella_fee_custom: boolean

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

  // Campaign-related (new)
  customer_category: CustomerCategory | null
  average_payment_days: number | null

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

  // Campaign linking (new)
  campaign_id: string | null
  payment_status: PaymentStatus | null
  expected_payment_date: string | null
  actual_payment_date: string | null

  created_at: string
  updated_at: string

  // Relations (populated when fetched)
  customer?: Customer
  items?: InvoiceItem[]
  campaign?: Campaign
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
  | 'gift'

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
  opening_balances_set: boolean
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
// Gift/Benefit Types (Förmånshantering)
// ============================================================

// Booking type determines how the gift affects bookkeeping
export type GiftBookingType = 'income' | 'income_and_expense' | 'tax_free'

// NE-bilaga ruta for income
export type NEIncomeRuta = 'R1' | 'R2'

// NE-bilaga ruta for expenses
export type NEExpenseRuta = 'R6'

// Classification result from the decision tree
export interface GiftClassification {
  taxable: boolean
  marketValue: number
  deductibleAsExpense: boolean
  bookingType: GiftBookingType
  reasoning: string
  // VAT handling (moms)
  vatLiable: boolean              // Ska moms redovisas? (bytestransaktion vid motprestation)
  vatAmount: number               // Momsbelopp (25% av värde exkl moms)
  valueExclVat: number            // Värde exkl moms (för bokföring)
  // NE-bilaga mapping
  neIncomeRuta: NEIncomeRuta | null   // R1 (momspliktig) eller R2 (momsfri)
  neExpenseRuta: NEExpenseRuta | null // R6 om avdragsgill
}

// Input for classifying a gift
export interface GiftInput {
  estimatedValue: number
  hasMotprestation: boolean  // Required post/video/mention?
  usedInBusiness: boolean    // Used as props/equipment?
  usedPrivately: boolean     // Personal use?
  isSimplePromoItem: boolean // Pen, mug, basic merch?
}

// Gift record stored in database
export interface Gift {
  id: string
  user_id: string
  date: string
  brand_name: string
  description: string
  estimated_value: number

  // Decision tree inputs
  has_motprestation: boolean
  used_in_business: boolean
  used_privately: boolean
  is_simple_promo: boolean

  // Classification result
  classification: GiftClassification

  // Bookkeeping link
  journal_entry_id: string | null

  // Light mode / extended fields
  returned: boolean
  campaign_id: string | null
  image_url: string | null

  created_at: string
  updated_at: string
}

// Input for creating a gift
export interface CreateGiftInput {
  date: string
  brand_name: string
  description: string
  estimated_value: number
  has_motprestation: boolean
  used_in_business: boolean
  used_privately: boolean
  is_simple_promo?: boolean
}

// Gift summary for a year (used in dashboard and reports)
export interface GiftSummary {
  year: number
  total_count: number
  total_value: number
  taxable_count: number
  taxable_value: number
  tax_free_count: number
  tax_free_value: number
  deductible_count: number
  deductible_value: number
}

// ============================================================
// Shadow Ledger & Light Mode Types
// ============================================================

export interface ShadowLedgerEntry {
  id: string
  user_id: string
  date: string
  type: ShadowLedgerEntryType
  source: ShadowLedgerSource
  provider: string | null

  // Gross-to-net breakdown
  gross_amount: number
  platform_fee: number
  service_fee: number
  pension_deduction: number
  social_fees: number
  income_tax_withheld: number
  net_amount: number

  // Currency
  currency: string
  amount_sek: number | null
  exchange_rate: number | null

  // Linking
  description: string | null
  bank_transaction_id: string | null
  gift_id: string | null
  campaign_id: string | null
  metadata: Record<string, unknown>

  // Virtual tax debt
  virtual_tax_debt: number

  created_at: string
  updated_at: string
}

export interface CreateShadowLedgerEntryInput {
  date: string
  type: ShadowLedgerEntryType
  source?: ShadowLedgerSource
  provider?: string
  gross_amount: number
  platform_fee?: number
  service_fee?: number
  pension_deduction?: number
  social_fees?: number
  income_tax_withheld?: number
  net_amount: number
  currency?: string
  description?: string
  bank_transaction_id?: string
  gift_id?: string
  campaign_id?: string
  metadata?: Record<string, unknown>
}

export interface ShadowLedgerSummary {
  year: number
  total_gross: number
  total_net: number
  total_fees: number
  total_tax_withheld: number
  total_pension: number
  total_social_fees: number
  total_platform_fees: number
  virtual_tax_debt: number
  entry_count: number
  by_type: Record<ShadowLedgerEntryType, { count: number; gross: number; net: number }>
}

export interface LightTaxEstimate {
  taxable_gift_value: number
  municipal_tax_rate: number
  church_tax_rate: number
  gift_tax: number
  hobby_tax: number
  total_virtual_debt: number
  safe_to_spend: number
  safe_to_spend_percent: number
  safe_to_spend_level: 'green' | 'yellow' | 'red'
}

export interface MunicipalityRate {
  id: number
  municipality_code: string
  municipality_name: string
  parish_code: string | null
  parish_name: string | null
  municipality_rate: number | null
  county_rate: number | null
  burial_fee: number | null
  total_rate: number
  church_rate: number | null
  year: number
}

export interface UmbrellaProviderDefault {
  id: string
  display_name: string
  default_fee_percent: number | null
  pension_percent: number | null
  pension_age_min: number | null
  pension_age_max: number | null
  notes: string | null
}

// ============================================================
// Campaign & Contract Types
// ============================================================

// Campaign status
export type CampaignStatus =
  | 'negotiation'  // Under förhandling
  | 'contracted'   // Avtal signerat, ej startat
  | 'active'       // Pågående
  | 'delivered'    // Alla leverabler klara
  | 'invoiced'     // Faktura skickad
  | 'completed'    // Avslutat och betalt
  | 'cancelled'    // Avbrutet

// Campaign type
export type CampaignType =
  | 'influencer'   // Standard influencer-kampanj
  | 'ugc'          // Endast UGC-material
  | 'ambassador'   // Långsiktigt ambassadörskap

// Deliverable type
export type DeliverableType =
  | 'video'        // Video (YouTube, TikTok-video)
  | 'image'        // Stillbild/foto
  | 'story'        // Instagram/TikTok story
  | 'reel'         // Instagram/TikTok reel
  | 'post'         // Inlägg i flöde
  | 'raw_material' // Råmaterial för varumärkets användning

// Deliverable status
export type DeliverableStatus =
  | 'pending'      // Inte påbörjat
  | 'in_progress'  // Under arbete
  | 'submitted'    // Inskickat för granskning
  | 'revision'     // Behöver ändringar
  | 'approved'     // Godkänt av varumärke
  | 'published'    // Publicerat/live

// Platform type
export type PlatformType =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'blog'
  | 'podcast'
  | 'other'

// Customer category (for campaigns)
export type CustomerCategory = 'brand' | 'agency' | 'platform'

// Payment status (for invoices)
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'partial'

// Date calculation type (for relative dates)
export type DateCalculationType = 'absolute' | 'relative'

// Reference event for relative dates
export type ReferenceEvent = 'publication' | 'delivery' | 'approval' | 'contract'

// Billing frequency
export type BillingFrequency = 'upfront' | 'on_delivery' | 'monthly' | 'split'

// Contract extraction status
export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'

// Campaign record
export interface Campaign {
  id: string
  user_id: string
  customer_id: string | null
  end_customer_id: string | null

  name: string
  description: string | null
  status: CampaignStatus
  campaign_type: CampaignType

  total_value: number | null
  currency: string
  vat_included: boolean
  payment_terms: number | null
  billing_frequency: BillingFrequency | null

  start_date: string | null
  end_date: string | null
  publication_date: string | null
  draft_deadline: string | null
  brand_name: string | null
  contract_signed_at: string | null

  notes: string | null
  created_at: string
  updated_at: string

  // Relations (populated when fetched)
  customer?: Customer
  end_customer?: Customer
  deliverables?: Deliverable[]
  exclusivities?: Exclusivity[]
  contracts?: Contract[]
  invoices?: Invoice[]
  briefings?: Briefing[]
}

// Deliverable record
export interface Deliverable {
  id: string
  campaign_id: string
  user_id: string

  title: string
  deliverable_type: DeliverableType
  platform: PlatformType
  account_handle: string | null

  quantity: number
  description: string | null
  specifications: Record<string, unknown>

  due_date: string | null
  status: DeliverableStatus
  submitted_at: string | null
  approved_at: string | null
  published_at: string | null

  notes: string | null
  created_at: string
  updated_at: string

  // Relations
  campaign?: Campaign
}

// Exclusivity record
export interface Exclusivity {
  id: string
  campaign_id: string
  user_id: string

  categories: string[]
  excluded_brands: string[]

  start_date: string
  end_date: string

  start_calculation_type: DateCalculationType
  end_calculation_type: DateCalculationType
  start_reference: ReferenceEvent | null
  end_reference: ReferenceEvent | null
  start_offset_days: number | null
  end_offset_days: number | null

  notes: string | null
  created_at: string
  updated_at: string

  // Relations
  campaign?: Campaign
}

// Contract record
export interface Contract {
  id: string
  campaign_id: string
  user_id: string

  filename: string
  file_path: string
  file_size: number | null
  mime_type: string | null

  extracted_data: Record<string, unknown>
  extraction_status: ExtractionStatus

  signing_date: string | null
  is_primary: boolean

  notes: string | null
  uploaded_at: string
  created_at: string
  updated_at: string

  // Relations
  campaign?: Campaign
}

// Input types for creating campaigns
export interface CreateCampaignInput {
  customer_id?: string
  end_customer_id?: string
  name: string
  description?: string
  campaign_type?: CampaignType
  total_value?: number
  currency?: string
  vat_included?: boolean
  payment_terms?: number
  billing_frequency?: BillingFrequency
  start_date?: string
  end_date?: string
  publication_date?: string
  draft_deadline?: string
  brand_name?: string
  notes?: string
}

// Input types for creating deliverables
export interface CreateDeliverableInput {
  campaign_id: string
  title: string
  deliverable_type: DeliverableType
  platform: PlatformType
  account_handle?: string
  quantity?: number
  description?: string
  specifications?: Record<string, unknown>
  due_date?: string
  notes?: string
}

// Input types for creating exclusivities
export interface CreateExclusivityInput {
  campaign_id: string
  categories: string[]
  excluded_brands?: string[]
  start_date: string
  end_date: string
  start_calculation_type?: DateCalculationType
  end_calculation_type?: DateCalculationType
  start_reference?: ReferenceEvent
  end_reference?: ReferenceEvent
  start_offset_days?: number
  end_offset_days?: number
  notes?: string
}

// Input types for uploading contracts
export interface CreateContractInput {
  campaign_id: string
  filename: string
  file_path: string
  file_size?: number
  mime_type?: string
  signing_date?: string
  is_primary?: boolean
  notes?: string
}

// Exclusivity conflict detection
export interface ExclusivityConflict {
  existingExclusivity: Exclusivity
  conflictingCampaign: Campaign
  overlappingCategories: string[]
  overlapStart: string
  overlapEnd: string
}

// Workload analysis
export interface WorkloadAnalysis {
  date: string
  deliverables: Deliverable[]
  totalDeliverables: number
  byPlatform: Record<PlatformType, number>
  byType: Record<DeliverableType, number>
  workloadLevel: 'light' | 'normal' | 'heavy' | 'overloaded'
}

// Campaign summary for dashboard
export interface CampaignSummary {
  totalCampaigns: number
  activeCampaigns: number
  totalValue: number
  byStatus: Record<CampaignStatus, number>
  upcomingDeliverables: Deliverable[]
  activeExclusivities: Exclusivity[]
}

// Swedish labels for enums
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  negotiation: 'Förhandling',
  contracted: 'Avtalat',
  active: 'Pågående',
  delivered: 'Levererat',
  invoiced: 'Fakturerat',
  completed: 'Avslutat',
  cancelled: 'Avbrutet'
}

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  influencer: 'Influencer-samarbete',
  ugc: 'UGC',
  ambassador: 'Ambassadör'
}

export const DELIVERABLE_TYPE_LABELS: Record<DeliverableType, string> = {
  video: 'Video',
  image: 'Bild',
  story: 'Story',
  reel: 'Reel',
  post: 'Inlägg',
  raw_material: 'Råmaterial'
}

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  pending: 'Väntar',
  in_progress: 'Pågår',
  submitted: 'Inskickat',
  revision: 'Revision',
  approved: 'Godkänt',
  published: 'Publicerat'
}

export const PLATFORM_LABELS: Record<PlatformType, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  blog: 'Blogg',
  podcast: 'Podcast',
  other: 'Övrigt'
}

export const CUSTOMER_CATEGORY_LABELS: Record<CustomerCategory, string> = {
  brand: 'Varumärke',
  agency: 'Byrå',
  platform: 'Plattform'
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Väntar',
  paid: 'Betald',
  overdue: 'Försenad',
  partial: 'Delbetalad'
}

export const BILLING_FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  upfront: 'I förskott',
  on_delivery: 'Vid leverans',
  monthly: 'Månadsvis',
  split: 'Delbetalning'
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

// Deadline types (extended for campaigns and tax)
export type DeadlineType = 'delivery' | 'approval' | 'invoicing' | 'report' | 'revision' | 'assets' | 'spark_ad' | 'statistics' | 'tax' | 'other'
export type DeadlinePriority = 'critical' | 'important' | 'normal'

// Deadline record (extended for campaigns and tax)
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
  campaign_id: string | null
  deliverable_id: string | null
  is_auto_generated: boolean
  date_calculation_type: DateCalculationType | null
  reference_event: ReferenceEvent | null
  offset_days: number | null
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
  campaign?: Campaign
  deliverable?: Deliverable
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
  campaign_deadlines_enabled: boolean
  quiet_start: string // time format "HH:MM"
  quiet_end: string   // time format "HH:MM"
  email_enabled: boolean
  push_enabled: boolean
  created_at: string
  updated_at: string
}

// Notification type for logging
export type NotificationType = 'tax_deadline' | 'invoice_due' | 'invoice_overdue' | 'campaign_deadline'

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
  include_campaigns: boolean
  include_exclusivity: boolean
  last_accessed_at: string | null
  access_count: number
  created_at: string
  updated_at: string
}

// Input for creating/updating calendar feed
export interface UpdateCalendarFeedInput {
  include_tax_deadlines?: boolean
  include_invoices?: boolean
  include_campaigns?: boolean
  include_exclusivity?: boolean
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
// Contract Extraction Types (AI-driven)
// ============================================================

// Confidence level for extracted fields
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'missing'

// Extracted party (brand or agency) from contract
export interface ExtractedParty {
  name: string
  orgNumber: string | null
  email: string | null
  contactPerson: string | null
}

// Extracted deliverable from contract
export interface ExtractedDeliverable {
  type: DeliverableType
  quantity: number
  platform: PlatformType | null
  account: string | null
  dueDate: string | null
  description: string | null
}

// Extracted deadline from contract
export interface ExtractedDeadline {
  description: string
  type: DeadlineType
  absoluteDate: string | null
  isRelative: boolean
  referenceEvent: ReferenceEvent | null
  offsetDays: number | null
}

// Complete extraction result from AI analysis
export interface ContractExtractionResult {
  parties: {
    brand: ExtractedParty | null
    agency: ExtractedParty | null
  }
  financials: {
    amount: number | null
    currency: string
    vatIncluded: boolean | null
    paymentTerms: number | null
    billingFrequency: BillingFrequency | null
  }
  deliverables: ExtractedDeliverable[]
  period: {
    startDate: string | null
    endDate: string | null
    publicationDate: string | null
    draftDeadline: string | null
  }
  exclusivity: {
    categories: string[]
    excludedBrands: string[]
    prePeriodDays: number | null
    postPeriodDays: number | null
    postReference: ReferenceEvent | null
  }
  deadlines: ExtractedDeadline[]
  rights: {
    usageType: 'organic' | 'paid' | 'both' | null
    usagePeriodMonths: number | null
    ownership: 'influencer' | 'client' | null
  }
  campaignName: string | null
  signingDate: string | null
  confidence: Record<string, ConfidenceLevel>
}

// Customer matching result
export type CustomerMatchType = 'exact' | 'probable' | 'none'

export interface CustomerMatchResult {
  matchType: CustomerMatchType
  customer: Customer | null
  confidence: number
  matchedOn: ('org_number' | 'name' | 'email')[]
  suggestedNewCustomer?: Partial<CreateCustomerInput>
}

// Contract import wizard state
export interface ContractImportState {
  step: number
  contractId: string | null
  extractionResult: ContractExtractionResult | null
  extractionStatus: ExtractionStatus
  customerMatch: {
    brand: CustomerMatchResult | null
    agency: CustomerMatchResult | null
  }
  selectedCustomerId: string | null
  selectedAgencyId: string | null
  editedData: Partial<ContractExtractionResult>
  exclusivityConflicts: ExclusivityConflict[]
}

// Labels for confidence levels
export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: 'Hög säkerhet',
  medium: 'Medel säkerhet',
  low: 'Låg säkerhet',
  missing: 'Saknas'
}

// Labels for extraction status
export const EXTRACTION_STATUS_LABELS: Record<ExtractionStatus, string> = {
  pending: 'Väntar',
  processing: 'Analyserar',
  completed: 'Klar',
  failed: 'Misslyckades',
  skipped: 'Hoppade över'
}

// ============================================================
// TikTok Integration Types
// ============================================================

// TikTok account status
export type TikTokAccountStatus = 'active' | 'expired' | 'revoked' | 'error'

// TikTok sync type
export type TikTokSyncType = 'stats' | 'videos' | 'full' | 'token_refresh'

// TikTok sync status
export type TikTokSyncStatus = 'started' | 'success' | 'partial' | 'failed'

// TikTok account record
export interface TikTokAccount {
  id: string
  user_id: string

  // TikTok user info
  tiktok_user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null

  // Token expiration (encrypted tokens not exposed to frontend)
  token_expires_at: string
  refresh_token_expires_at: string

  // Account status
  status: TikTokAccountStatus

  // Sync tracking
  last_synced_at: string | null
  last_stats_sync_at: string | null
  last_video_sync_at: string | null

  // Error tracking
  last_error: string | null
  error_count: number

  // Timestamps
  created_at: string
  updated_at: string
}

// TikTok daily stats record
export interface TikTokDailyStats {
  id: string
  tiktok_account_id: string
  user_id: string

  // Date of snapshot
  stats_date: string

  // Follower metrics
  follower_count: number
  following_count: number

  // Content metrics
  likes_count: number
  video_count: number

  // Calculated change
  follower_change: number | null

  // Timestamps
  created_at: string
}

// TikTok video record
export interface TikTokVideo {
  id: string
  tiktok_account_id: string
  user_id: string

  // TikTok video identification
  tiktok_video_id: string

  // Video metadata
  title: string | null
  share_url: string | null
  cover_image_url: string | null

  // Performance metrics
  view_count: number
  like_count: number
  comment_count: number
  share_count: number

  // Video duration in seconds
  duration: number | null

  // Publication date
  published_at: string | null

  // Campaign/deliverable linking
  campaign_id: string | null
  deliverable_id: string | null

  // Timestamps
  created_at: string
  updated_at: string

  // Relations
  campaign?: Campaign
  deliverable?: Deliverable
}

// TikTok sync log record
export interface TikTokSyncLog {
  id: string
  tiktok_account_id: string
  user_id: string

  // Sync type
  sync_type: TikTokSyncType

  // Sync result
  status: TikTokSyncStatus

  // Details
  stats_synced: boolean
  videos_synced: number
  new_videos: number

  // Error info
  error_message: string | null
  error_code: string | null

  // Duration
  started_at: string
  completed_at: string | null

  // Timestamps
  created_at: string
}

// TikTok OAuth state (for CSRF protection)
export interface TikTokOAuthState {
  user_id: string
  redirect_url: string
  created_at: number
}

// TikTok API response types
export interface TikTokUserInfo {
  open_id: string
  union_id: string
  avatar_url: string
  avatar_url_100: string
  avatar_large_url: string
  display_name: string
  bio_description: string
  profile_deep_link: string
  is_verified: boolean
  follower_count: number
  following_count: number
  likes_count: number
  video_count: number
}

export interface TikTokVideoInfo {
  id: string
  title: string
  video_description: string
  duration: number
  cover_image_url: string
  share_url: string
  embed_link: string
  create_time: number
  like_count: number
  comment_count: number
  share_count: number
  view_count: number
}

// TikTok engagement metrics
export interface TikTokEngagementMetrics {
  views: number
  likes: number
  comments: number
  shares: number
  engagementRate: number
  averageViewDuration?: number
}

// TikTok campaign ROI
export interface TikTokCampaignROI {
  campaignId: string
  campaignName: string
  totalCost: number
  totalViews: number
  totalEngagements: number
  costPerView: number
  costPerEngagement: number
  videos: TikTokVideo[]
}

// TikTok follower growth
export interface TikTokFollowerGrowth {
  period: '7d' | '30d' | '90d' | '1y'
  startCount: number
  endCount: number
  change: number
  changePercent: number
  dailyAverage: number
}

// TikTok stats summary for dashboard
export interface TikTokStatsSummary {
  currentFollowers: number
  followerChange7d: number
  followerChange30d: number
  totalLikes: number
  totalVideos: number
  recentVideos: TikTokVideo[]
  engagementRate: number
  lastSynced: string | null
}

// Input types for TikTok operations
export interface LinkVideoToCampaignInput {
  video_id: string
  campaign_id?: string
  deliverable_id?: string
}

export interface TikTokSyncInput {
  account_id: string
  sync_type?: TikTokSyncType
}

// TikTok status labels
export const TIKTOK_STATUS_LABELS: Record<TikTokAccountStatus, string> = {
  active: 'Aktiv',
  expired: 'Utgången',
  revoked: 'Återkallad',
  error: 'Fel'
}

export const TIKTOK_SYNC_TYPE_LABELS: Record<TikTokSyncType, string> = {
  stats: 'Statistik',
  videos: 'Videor',
  full: 'Fullständig',
  token_refresh: 'Token-förnyelse'
}

export const TIKTOK_SYNC_STATUS_LABELS: Record<TikTokSyncStatus, string> = {
  started: 'Startad',
  success: 'Lyckad',
  partial: 'Delvis',
  failed: 'Misslyckad'
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

// Product registration (gift without receipt)
export interface ProductRegistration {
  image_url: string
  estimated_value: number
  brand_name: string
  description: string
  // Gift classification inputs
  has_motprestation: boolean
  used_in_business: boolean
  used_privately: boolean
  is_simple_promo: boolean
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
// Briefing Types (Campaign Briefing Materials)
// ============================================================

// Briefing type
export type BriefingType = 'pdf' | 'link' | 'text'

// Briefing record
export interface Briefing {
  id: string
  campaign_id: string
  user_id: string

  briefing_type: BriefingType
  title: string

  // Content based on type:
  // For 'pdf': file path in Supabase Storage
  // For 'link': URL to external resource
  // For 'text': null (use text_content instead)
  content: string | null

  // For 'text' type: the actual text content
  text_content: string | null

  // PDF metadata (only for 'pdf' type)
  filename: string | null
  file_size: number | null
  mime_type: string | null

  // Optional notes
  notes: string | null

  // Timestamps
  created_at: string
  updated_at: string

  // Relations
  campaign?: Campaign
}

// Input for creating a briefing
export interface CreateBriefingInput {
  campaign_id: string
  briefing_type: BriefingType
  title: string
  content?: string // File path or URL
  text_content?: string // For text type
  filename?: string
  file_size?: number
  mime_type?: string
  notes?: string
}

// Swedish labels for briefing types
export const BRIEFING_TYPE_LABELS: Record<BriefingType, string> = {
  pdf: 'PDF-dokument',
  link: 'Länk',
  text: 'Text'
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

// Gift item for NE declaration
export interface NEGiftItem {
  id: string
  date: string
  brandName: string
  description: string
  marketValue: number
  vatLiable: boolean
  vatAmount: number
  deductibleAsExpense: boolean
  neIncomeRuta: NEIncomeRuta | null
  neExpenseRuta: NEExpenseRuta | null
}

// Gift breakdown for NE declaration
export interface NEGiftBreakdown {
  gifts: NEGiftItem[]
  summary: {
    r1Total: number  // Gåvor med moms (motprestation)
    r2Total: number  // Gåvor utan moms
    r6Total: number  // Avdragsgilla gåvor
    totalTaxable: number
    totalDeductible: number
    netTaxableIncome: number
  }
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
  // Gift breakdown (included in rutor via journal entries)
  giftBreakdown?: NEGiftBreakdown
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
