/**
 * Types for the Arcim Sync migration extension.
 *
 * These mirror the canonical DTOs from the Arcim Sync gateway
 * (packages/core/src/types/dto/) so we don't take a runtime dependency.
 */

// ── Arcim Sync canonical DTOs (subset we consume) ──────────────────

export interface AmountType {
  value: number
  currencyCode: string
}

export interface PostalAddress {
  streetName?: string
  additionalStreetName?: string
  buildingNumber?: string
  cityName?: string
  postalZone?: string
  countrySubentity?: string
  countryCode?: string
}

export interface Contact {
  name?: string
  telephone?: string
  email?: string
  website?: string
}

export interface PartyIdentification {
  id: string
  schemeId?: string
}

export interface PartyLegalEntity {
  registrationName: string
  companyId?: string
  companyIdSchemeId?: string
}

export interface PartyDto {
  name: string
  identifications: PartyIdentification[]
  postalAddress?: PostalAddress
  legalEntity?: PartyLegalEntity
  contact?: Contact
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  totalCount: number
  hasMore: boolean
}

export interface TaxSubtotalDto {
  taxableAmount: AmountType
  taxAmount: AmountType
  taxCategory?: string
  percent?: number
}

export interface TaxTotalDto {
  taxAmount: AmountType
  taxSubtotals?: TaxSubtotalDto[]
}

export interface LegalMonetaryTotalDto {
  lineExtensionAmount: AmountType
  taxExclusiveAmount?: AmountType
  taxInclusiveAmount?: AmountType
  payableAmount: AmountType
}

export interface PaymentStatusDto {
  paid: boolean
  balance: AmountType
  lastPaymentDate?: string
}

// ── Company Information ─────────────────────────────────────────────

export interface CompanyInformationDto {
  companyName: string
  organizationNumber?: string
  legalEntity?: PartyLegalEntity
  address?: PostalAddress
  contact?: Contact
  vatNumber?: string
  fiscalYearStart?: string // MM-DD
  baseCurrency?: string
}

// ── Customer ────────────────────────────────────────────────────────

export type ArcimCustomerType = 'company' | 'private'

export interface CustomerDto {
  id: string
  customerNumber: string
  type?: ArcimCustomerType
  party: PartyDto
  active: boolean
  vatNumber?: string
  defaultPaymentTermsDays?: number
  note?: string
}

// ── Supplier ────────────────────────────────────────────────────────

export interface SupplierDto {
  id: string
  supplierNumber: string
  party: PartyDto
  active: boolean
  vatNumber?: string
  bankAccount?: string
  bankGiro?: string
  plusGiro?: string
  defaultPaymentTermsDays?: number
  note?: string
}

// ── Sales Invoice ───────────────────────────────────────────────────

export type InvoiceStatusCode = 'draft' | 'sent' | 'booked' | 'paid' | 'overdue' | 'cancelled' | 'credited'

export interface SalesInvoiceLineDto {
  id: string
  description?: string
  quantity?: number
  unitCode?: string
  unitPrice?: AmountType
  lineExtensionAmount: AmountType
  taxPercent?: number
  taxAmount?: AmountType
  accountNumber?: string
  itemName?: string
}

export interface SalesInvoiceDto {
  id: string
  invoiceNumber: string
  issueDate: string
  dueDate?: string
  deliveryDate?: string
  invoiceTypeCode?: string
  currencyCode: string
  status: InvoiceStatusCode
  supplier: PartyDto
  customer: PartyDto
  lines: SalesInvoiceLineDto[]
  taxTotal?: TaxTotalDto
  legalMonetaryTotal: LegalMonetaryTotalDto
  paymentStatus: PaymentStatusDto
  paymentTerms?: string
  note?: string
}

// ── Supplier Invoice ────────────────────────────────────────────────

export interface SupplierInvoiceLineDto {
  id: string
  description?: string
  quantity?: number
  unitCode?: string
  unitPrice?: AmountType
  lineExtensionAmount: AmountType
  taxPercent?: number
  taxAmount?: AmountType
  accountNumber?: string
  itemName?: string
}

export interface SupplierInvoiceDto {
  id: string
  invoiceNumber: string
  issueDate: string
  dueDate?: string
  deliveryDate?: string
  invoiceTypeCode?: string
  currencyCode: string
  status: InvoiceStatusCode
  supplier: PartyDto
  buyer: PartyDto
  lines: SupplierInvoiceLineDto[]
  taxTotal?: TaxTotalDto
  legalMonetaryTotal: LegalMonetaryTotalDto
  paymentStatus: PaymentStatusDto
  ocrNumber?: string
  note?: string
}

// ── Supported providers ─────────────────────────────────────────────

export type ArcimProvider = 'fortnox' | 'visma' | 'briox' | 'bokio' | 'bjornlunden'

export const ARCIM_PROVIDERS: { id: ArcimProvider; name: string; authType: 'oauth' | 'token' }[] = [
  { id: 'fortnox', name: 'Fortnox', authType: 'oauth' },
  { id: 'visma', name: 'Visma eEkonomi', authType: 'oauth' },
  { id: 'bokio', name: 'Bokio', authType: 'token' },
  { id: 'bjornlunden', name: 'Björn Lundén', authType: 'token' },
  { id: 'briox', name: 'Briox', authType: 'token' },
]

// ── Migration state ─────────────────────────────────────────────────

export interface MigrationProgress {
  status: 'idle' | 'connecting' | 'fetching' | 'importing' | 'completed' | 'failed'
  currentStep?: string
  progress: number // 0-100
  results?: MigrationResults
  error?: string
}

export interface MigrationResults {
  companyInfo?: { imported: boolean }
  customers?: { total: number; imported: number; skipped: number }
  suppliers?: { total: number; imported: number; skipped: number }
  salesInvoices?: { total: number; imported: number; skipped: number }
  supplierInvoices?: { total: number; imported: number; skipped: number }
}

// ── Consent flow ────────────────────────────────────────────────────

export interface ConsentRecord {
  id: string
  name: string
  provider: ArcimProvider
  status: 0 | 1 | 2 | 3 // Created | Accepted | Revoked | Inactive
  orgNumber?: string
  companyName?: string
  etag?: string
  createdAt?: string
  updatedAt?: string
}

export interface OtcResponse {
  code: string
  consentId: string
  expiresAt: string
}
