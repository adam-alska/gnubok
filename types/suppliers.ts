// =============================================================
// Supplier & Accounts Payable Types
// =============================================================

// Supplier invoice status
export type SupplierInvoiceStatus =
  | 'draft'
  | 'received'
  | 'attested'
  | 'approved'
  | 'scheduled'
  | 'paid'
  | 'disputed'
  | 'credited'

// Supplier payment method
export type SupplierPaymentMethod =
  | 'bankgiro'
  | 'plusgiro'
  | 'bank_transfer'
  | 'swish'
  | 'cash'

// Supplier payment batch status
export type SupplierPaymentStatus = 'draft' | 'approved' | 'sent' | 'confirmed'

// Attestation action
export type AttestationAction = 'attested' | 'rejected' | 'commented'

// Supplier
export interface Supplier {
  id: string
  user_id: string
  name: string
  org_number: string | null
  vat_number: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  postal_code: string | null
  city: string | null
  country: string
  bankgiro: string | null
  plusgiro: string | null
  iban: string | null
  bic: string | null
  clearing_number: string | null
  account_number: string | null
  default_payment_terms: number
  category: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// Supplier Invoice
export interface SupplierInvoice {
  id: string
  user_id: string
  supplier_id: string | null
  invoice_number: string
  ocr_number: string | null
  invoice_date: string | null
  due_date: string | null
  received_date: string | null
  status: SupplierInvoiceStatus
  currency: string
  exchange_rate: number | null
  subtotal: number
  vat_amount: number
  total: number
  total_sek: number
  vat_treatment: string | null
  vat_rate: number
  payment_method: SupplierPaymentMethod | null
  payment_reference: string | null
  paid_at: string | null
  paid_amount: number | null
  journal_entry_id: string | null
  attachment_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Relations
  supplier?: Supplier
  items?: SupplierInvoiceItem[]
  attestations?: SupplierInvoiceAttestation[]
}

// Supplier Invoice Item
export interface SupplierInvoiceItem {
  id: string
  supplier_invoice_id: string
  sort_order: number
  description: string | null
  quantity: number
  unit: string
  unit_price: number
  line_total: number
  account_number: string | null
  vat_rate: number
  vat_amount: number
  cost_center: string | null
  project: string | null
  created_at: string
}

// Supplier Invoice Attestation
export interface SupplierInvoiceAttestation {
  id: string
  supplier_invoice_id: string
  user_id: string
  action: AttestationAction
  comment: string | null
  attested_at: string
}

// Supplier Payment (batch)
export interface SupplierPayment {
  id: string
  user_id: string
  payment_date: string
  status: SupplierPaymentStatus
  total_amount: number
  payment_count: number
  file_content: string | null
  created_at: string
  updated_at: string
  // Relations
  items?: SupplierPaymentItem[]
}

// Supplier Payment Item
export interface SupplierPaymentItem {
  id: string
  payment_id: string
  supplier_invoice_id: string | null
  amount: number
  payment_method: string | null
  reference: string | null
  created_at: string
  // Relations
  supplier_invoice?: SupplierInvoice
}

// =============================================================
// Input types
// =============================================================

export interface CreateSupplierInput {
  name: string
  org_number?: string
  vat_number?: string
  email?: string
  phone?: string
  address_line1?: string
  postal_code?: string
  city?: string
  country?: string
  bankgiro?: string
  plusgiro?: string
  iban?: string
  bic?: string
  clearing_number?: string
  account_number?: string
  default_payment_terms?: number
  category?: string
  notes?: string
  is_active?: boolean
}

export interface UpdateSupplierInput {
  name?: string
  org_number?: string | null
  vat_number?: string | null
  email?: string | null
  phone?: string | null
  address_line1?: string | null
  postal_code?: string | null
  city?: string | null
  country?: string
  bankgiro?: string | null
  plusgiro?: string | null
  iban?: string | null
  bic?: string | null
  clearing_number?: string | null
  account_number?: string | null
  default_payment_terms?: number
  category?: string | null
  notes?: string | null
  is_active?: boolean
}

export interface CreateSupplierInvoiceInput {
  supplier_id: string
  invoice_number: string
  ocr_number?: string
  invoice_date?: string
  due_date?: string
  received_date?: string
  currency?: string
  exchange_rate?: number
  subtotal: number
  vat_amount: number
  total: number
  vat_rate?: number
  payment_method?: SupplierPaymentMethod
  payment_reference?: string
  attachment_url?: string
  notes?: string
  items: CreateSupplierInvoiceItemInput[]
}

export interface CreateSupplierInvoiceItemInput {
  description: string
  quantity: number
  unit?: string
  unit_price: number
  account_number?: string
  vat_rate?: number
  cost_center?: string
  project?: string
}

export interface CreateSupplierPaymentInput {
  payment_date: string
  invoice_ids: string[]
}

export interface AttestSupplierInvoiceInput {
  action: AttestationAction
  comment?: string
}

// =============================================================
// Swedish labels
// =============================================================

export const SUPPLIER_INVOICE_STATUS_LABELS: Record<SupplierInvoiceStatus, string> = {
  draft: 'Utkast',
  received: 'Mottagen',
  attested: 'Attesterad',
  approved: 'Godkänd',
  scheduled: 'Schemalagd',
  paid: 'Betald',
  disputed: 'Bestridd',
  credited: 'Krediterad',
}

export const SUPPLIER_INVOICE_STATUS_COLORS: Record<SupplierInvoiceStatus, string> = {
  draft: 'secondary',
  received: 'default',
  attested: 'outline',
  approved: 'default',
  scheduled: 'default',
  paid: 'success',
  disputed: 'destructive',
  credited: 'secondary',
}

export const SUPPLIER_PAYMENT_STATUS_LABELS: Record<SupplierPaymentStatus, string> = {
  draft: 'Utkast',
  approved: 'Godkänd',
  sent: 'Skickad',
  confirmed: 'Bekräftad',
}

export const SUPPLIER_PAYMENT_METHOD_LABELS: Record<SupplierPaymentMethod, string> = {
  bankgiro: 'Bankgiro',
  plusgiro: 'Plusgiro',
  bank_transfer: 'Banköverföring',
  swish: 'Swish',
  cash: 'Kontant',
}

export const ATTESTATION_ACTION_LABELS: Record<AttestationAction, string> = {
  attested: 'Attesterad',
  rejected: 'Avslagen',
  commented: 'Kommenterad',
}
