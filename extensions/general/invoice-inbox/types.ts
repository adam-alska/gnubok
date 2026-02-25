/**
 * Invoice Inbox extension types.
 *
 * InvoiceExtractionResult, ExtractedInvoiceLineItem, and VatBreakdownItem
 * now live in types/index.ts (used by core). Re-exported here for backward compat.
 */
export type {
  InvoiceExtractionResult,
  ExtractedInvoiceLineItem,
  VatBreakdownItem,
} from '@/types'

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
