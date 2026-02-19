// ============================================================
// Enhanced Invoice Types
// ============================================================

import type { Currency, VatTreatment, Customer, Invoice, InvoiceItem } from './index'

// ============================================================
// Payment Types
// ============================================================

export type PaymentType = 'bankgiro' | 'plusgiro' | 'bank_transfer' | 'swish'

// ============================================================
// Recurring Invoice Types
// ============================================================

export type RecurringFrequency =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annually'
  | 'annually'

export interface RecurringInvoiceItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
}

export interface RecurringInvoice {
  id: string
  user_id: string
  customer_id: string

  template_name: string
  description: string | null

  frequency: RecurringFrequency
  interval_count: number

  start_date: string
  end_date: string | null
  next_invoice_date: string
  last_generated_date: string | null

  is_active: boolean

  items: RecurringInvoiceItem[]

  vat_treatment: VatTreatment | null
  vat_rate: number | null
  currency: Currency

  your_reference: string | null
  our_reference: string | null
  notes: string | null

  payment_terms_days: number
  generated_count: number

  created_at: string
  updated_at: string

  // Relations
  customer?: Customer
}

export interface CreateRecurringInvoiceInput {
  customer_id: string
  template_name: string
  description?: string
  frequency: RecurringFrequency
  interval_count?: number
  start_date: string
  end_date?: string
  items: RecurringInvoiceItem[]
  currency?: Currency
  your_reference?: string
  our_reference?: string
  notes?: string
  payment_terms_days?: number
}

export interface UpdateRecurringInvoiceInput {
  template_name?: string
  description?: string
  frequency?: RecurringFrequency
  interval_count?: number
  end_date?: string | null
  is_active?: boolean
  items?: RecurringInvoiceItem[]
  currency?: Currency
  your_reference?: string
  our_reference?: string
  notes?: string
  payment_terms_days?: number
}

// ============================================================
// Quote Types
// ============================================================

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted'

export interface Quote {
  id: string
  user_id: string
  customer_id: string

  quote_number: string
  quote_date: string
  valid_until: string

  status: QuoteStatus

  currency: Currency
  exchange_rate: number | null

  subtotal: number
  vat_amount: number
  total: number

  vat_treatment: VatTreatment | null
  vat_rate: number | null

  your_reference: string | null
  our_reference: string | null
  notes: string | null

  converted_to_order_id: string | null
  converted_to_invoice_id: string | null

  created_at: string
  updated_at: string

  // Relations
  customer?: Customer
  items?: QuoteItem[]
}

export interface QuoteItem {
  id: string
  quote_id: string
  sort_order: number
  description: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
  created_at: string
}

export interface CreateQuoteInput {
  customer_id: string
  quote_date: string
  valid_until: string
  currency?: Currency
  your_reference?: string
  our_reference?: string
  notes?: string
  items: CreateQuoteItemInput[]
}

export interface CreateQuoteItemInput {
  description: string
  quantity: number
  unit: string
  unit_price: number
}

// ============================================================
// Order Types
// ============================================================

export type OrderStatus = 'draft' | 'confirmed' | 'in_progress' | 'delivered' | 'invoiced' | 'cancelled'

export interface Order {
  id: string
  user_id: string
  customer_id: string
  quote_id: string | null

  order_number: string
  order_date: string
  delivery_date: string | null

  status: OrderStatus

  currency: Currency
  exchange_rate: number | null

  subtotal: number
  vat_amount: number
  total: number

  vat_treatment: VatTreatment | null
  vat_rate: number | null

  your_reference: string | null
  our_reference: string | null
  delivery_address: string | null
  notes: string | null

  converted_to_invoice_id: string | null

  created_at: string
  updated_at: string

  // Relations
  customer?: Customer
  items?: OrderItem[]
  quote?: Quote
}

export interface OrderItem {
  id: string
  order_id: string
  sort_order: number
  description: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
  created_at: string
}

export interface CreateOrderInput {
  customer_id: string
  quote_id?: string
  order_date: string
  delivery_date?: string
  currency?: Currency
  your_reference?: string
  our_reference?: string
  delivery_address?: string
  notes?: string
  items: CreateOrderItemInput[]
}

export interface CreateOrderItemInput {
  description: string
  quantity: number
  unit: string
  unit_price: number
}

// ============================================================
// Conversion Types
// ============================================================

export type ConversionTarget = 'order' | 'invoice'

export interface ConversionResult {
  success: boolean
  id?: string
  number?: string
  error?: string
}

// ============================================================
// Pipeline Stage Type
// ============================================================

export type PipelineStage = 'quote' | 'order' | 'invoice'

export interface PipelineDocument {
  stage: PipelineStage
  id: string | null
  number: string | null
  status: string | null
  date: string | null
}

// ============================================================
// Swedish Status Labels
// ============================================================

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Utkast',
  sent: 'Skickad',
  accepted: 'Accepterad',
  rejected: 'Avvisad',
  expired: 'Utgången',
  converted: 'Konverterad',
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Utkast',
  confirmed: 'Bekräftad',
  in_progress: 'Pågående',
  delivered: 'Levererad',
  invoiced: 'Fakturerad',
  cancelled: 'Makulerad',
}

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Veckovis',
  monthly: 'Månadsvis',
  quarterly: 'Kvartalsvis',
  semi_annually: 'Halvårsvis',
  annually: 'Årsvis',
}

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  bankgiro: 'Bankgiro',
  plusgiro: 'Plusgiro',
  bank_transfer: 'Banköverföring',
  swish: 'Swish',
}

export const QUOTE_STATUS_VARIANT: Record<QuoteStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  draft: 'secondary',
  sent: 'default',
  accepted: 'success',
  rejected: 'destructive',
  expired: 'warning',
  converted: 'success',
}

export const ORDER_STATUS_VARIANT: Record<OrderStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  draft: 'secondary',
  confirmed: 'default',
  in_progress: 'warning',
  delivered: 'success',
  invoiced: 'success',
  cancelled: 'destructive',
}
