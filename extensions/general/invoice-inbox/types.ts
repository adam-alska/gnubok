/**
 * Invoice Inbox extension-specific types
 */

export interface InvoiceExtractionResult {
  supplier: {
    name: string | null
    orgNumber: string | null
    vatNumber: string | null
    address: string | null
    bankgiro: string | null
    plusgiro: string | null
  }
  invoice: {
    invoiceNumber: string | null
    invoiceDate: string | null
    dueDate: string | null
    paymentReference: string | null // OCR number or reference
    currency: string
  }
  lineItems: ExtractedInvoiceLineItem[]
  totals: {
    subtotal: number | null
    vatAmount: number | null
    total: number | null
  }
  vatBreakdown: VatBreakdownItem[]
  confidence: number
}

export interface ExtractedInvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number | null
  lineTotal: number
  vatRate: number | null
  accountSuggestion: string | null
}

export interface VatBreakdownItem {
  rate: number
  base: number
  amount: number
}

export interface SupplierMatchResult {
  supplierId: string
  supplierName: string
  confidence: number
  matchMethod: 'org_number' | 'vat_number' | 'bankgiro' | 'fuzzy_name'
}

export interface InvoiceInboxSettings {
  autoProcessEnabled: boolean
  autoMatchSupplierEnabled: boolean
  supplierMatchThreshold: number
  inboxEmail: string | null
}

export interface ResendInboundPayload {
  from: string
  to: string
  subject: string
  html: string | null
  text: string | null
  attachments: ResendAttachment[]
  created_at: string
}

export interface ResendAttachment {
  filename: string
  content_type: string
  content: string // base64-encoded
}
