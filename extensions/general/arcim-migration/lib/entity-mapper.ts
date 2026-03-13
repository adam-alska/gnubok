/**
 * Maps Arcim Sync canonical DTOs to gnubok internal types.
 *
 * These mappers transform the normalized data from any Swedish accounting
 * provider into the exact shapes gnubok expects for database insertion.
 */

import type { CustomerType, SupplierType, VatTreatment } from '@/types'
import type {
  CustomerDto,
  SupplierDto,
  SalesInvoiceDto,
  SalesInvoiceLineDto,
  SupplierInvoiceDto,
  SupplierInvoiceLineDto,
  CompanyInformationDto,
  PostalAddress,
  PartyDto,
} from '../types'

// ── Helpers ─────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function formatAddress(addr?: PostalAddress): {
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  city: string | null
  country: string | null
} {
  if (!addr) {
    return { address_line1: null, address_line2: null, postal_code: null, city: null, country: null }
  }
  const line1 = [addr.streetName, addr.buildingNumber].filter(Boolean).join(' ') || null
  return {
    address_line1: line1,
    address_line2: addr.additionalStreetName || null,
    postal_code: addr.postalZone || null,
    city: addr.cityName || null,
    country: addr.countryCode || null,
  }
}

function getOrgNumber(party: PartyDto): string | null {
  // Look for SE:ORGNR scheme first, then companyId in legalEntity
  const seOrg = party.identifications?.find(i => i.schemeId === 'SE:ORGNR')
  if (seOrg) return seOrg.id
  return party.legalEntity?.companyId || null
}

const EU_COUNTRIES = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SI', 'SK']

function inferTypeFromVatOrCountry(
  vatNumber: string | undefined,
  countryCode: string | undefined
): 'swedish_business' | 'eu_business' | 'non_eu_business' {
  // 1. VAT number prefix is the strongest signal
  if (vatNumber) {
    const prefix = vatNumber.substring(0, 2).toUpperCase()
    if (prefix === 'SE') return 'swedish_business'
    if (EU_COUNTRIES.includes(prefix)) return 'eu_business'
    return 'non_eu_business'
  }

  // 2. Fall back to address country
  const country = countryCode?.toUpperCase()
  if (!country || country === 'SE') return 'swedish_business'
  if (EU_COUNTRIES.includes(country)) return 'eu_business'
  return 'non_eu_business'
}

function inferCustomerType(dto: CustomerDto): CustomerType {
  if (dto.type === 'private') return 'individual'
  return inferTypeFromVatOrCountry(dto.vatNumber, dto.party.postalAddress?.countryCode)
}

function inferSupplierType(dto: SupplierDto): SupplierType {
  return inferTypeFromVatOrCountry(dto.vatNumber, dto.party.postalAddress?.countryCode)
}

function inferVatTreatment(taxPercent?: number, currencyCode?: string): VatTreatment {
  if (taxPercent === 25) return 'standard_25'
  if (taxPercent === 12) return 'reduced_12'
  if (taxPercent === 6) return 'reduced_6'
  if (taxPercent === 0 && currencyCode && currencyCode !== 'SEK') return 'export'
  return 'standard_25'
}

function inferVatRate(taxPercent?: number): number {
  if (taxPercent === 25 || taxPercent === 12 || taxPercent === 6) return taxPercent
  if (taxPercent === 0) return 0
  return 25 // Default to standard rate
}

// ── Public mappers ──────────────────────────────────────────────────

export function mapCustomer(dto: CustomerDto, userId: string): Record<string, unknown> {
  const addr = formatAddress(dto.party.postalAddress)
  return {
    user_id: userId,
    name: dto.party.name,
    customer_type: inferCustomerType(dto),
    email: dto.party.contact?.email || null,
    phone: dto.party.contact?.telephone || null,
    ...addr,
    org_number: getOrgNumber(dto.party),
    vat_number: dto.vatNumber || null,
    vat_number_validated: false,
    default_payment_terms: dto.defaultPaymentTermsDays || 30,
    notes: dto.note || null,
  }
}

export function mapSupplier(dto: SupplierDto, userId: string): Record<string, unknown> {
  const addr = formatAddress(dto.party.postalAddress)
  return {
    user_id: userId,
    name: dto.party.name,
    supplier_type: inferSupplierType(dto),
    email: dto.party.contact?.email || null,
    phone: dto.party.contact?.telephone || null,
    ...addr,
    org_number: getOrgNumber(dto.party),
    vat_number: dto.vatNumber || null,
    bankgiro: dto.bankGiro || null,
    plusgiro: dto.plusGiro || null,
    bank_account: dto.bankAccount || null,
    iban: null,
    bic: null,
    default_expense_account: null,
    default_payment_terms: dto.defaultPaymentTermsDays || 30,
    default_currency: 'SEK',
    notes: dto.note || null,
  }
}

export function mapSalesInvoice(
  dto: SalesInvoiceDto,
  userId: string,
  customerId: string
): { invoice: Record<string, unknown>; items: Record<string, unknown>[] } {
  const subtotal = round2(dto.legalMonetaryTotal.lineExtensionAmount.value)
  const total = round2(dto.legalMonetaryTotal.payableAmount.value)
  const vatAmount = round2(dto.taxTotal?.taxAmount.value ?? (total - subtotal))

  // Determine primary VAT treatment from first line with tax
  const primaryTaxPercent = dto.lines.find(l => l.taxPercent != null)?.taxPercent
  const vatTreatment = inferVatTreatment(primaryTaxPercent, dto.currencyCode)

  // Map Arcim status to gnubok status
  const statusMap: Record<string, string> = {
    draft: 'draft',
    sent: 'sent',
    booked: 'sent', // gnubok has no 'booked' status — treat as sent
    paid: 'paid',
    overdue: 'overdue',
    cancelled: 'cancelled',
    credited: 'credited',
  }

  const isCreditNote = dto.invoiceTypeCode === '381'

  const invoice: Record<string, unknown> = {
    user_id: userId,
    customer_id: customerId,
    invoice_number: dto.invoiceNumber,
    invoice_date: dto.issueDate,
    due_date: dto.dueDate || dto.issueDate,
    status: statusMap[dto.status] || 'sent',
    currency: dto.currencyCode || 'SEK',
    exchange_rate: dto.currencyCode === 'SEK' ? null : null,
    subtotal,
    subtotal_sek: dto.currencyCode === 'SEK' ? subtotal : null,
    vat_amount: vatAmount,
    vat_amount_sek: dto.currencyCode === 'SEK' ? vatAmount : null,
    total,
    total_sek: dto.currencyCode === 'SEK' ? total : null,
    vat_treatment: vatTreatment,
    vat_rate: inferVatRate(primaryTaxPercent),
    your_reference: null,
    our_reference: null,
    notes: dto.note || null,
    document_type: isCreditNote ? 'invoice' : 'invoice',
    paid_at: dto.paymentStatus.paid ? dto.paymentStatus.lastPaymentDate || dto.issueDate : null,
    paid_amount: dto.paymentStatus.paid ? total : round2(total - dto.paymentStatus.balance.value),
  }

  const items = dto.lines.map((line, idx) => mapSalesInvoiceLine(line, idx))

  return { invoice, items }
}

function mapSalesInvoiceLine(line: SalesInvoiceLineDto, index: number): Record<string, unknown> {
  return {
    sort_order: index + 1,
    description: line.description || line.itemName || '',
    quantity: line.quantity || 1,
    unit: line.unitCode || 'st',
    unit_price: round2(line.unitPrice?.value ?? line.lineExtensionAmount.value),
    line_total: round2(line.lineExtensionAmount.value),
    vat_rate: inferVatRate(line.taxPercent),
    vat_amount: round2(line.taxAmount?.value ?? 0),
  }
}

export function mapSupplierInvoice(
  dto: SupplierInvoiceDto,
  userId: string,
  supplierId: string
): { invoice: Record<string, unknown>; items: Record<string, unknown>[] } {
  const subtotal = round2(dto.legalMonetaryTotal.lineExtensionAmount.value)
  const total = round2(dto.legalMonetaryTotal.payableAmount.value)
  const vatAmount = round2(dto.taxTotal?.taxAmount.value ?? (total - subtotal))

  const primaryTaxPercent = dto.lines.find(l => l.taxPercent != null)?.taxPercent
  const vatTreatment = inferVatTreatment(primaryTaxPercent, dto.currencyCode)

  const statusMap: Record<string, string> = {
    draft: 'registered',
    sent: 'registered',
    booked: 'registered',
    paid: 'paid',
    overdue: 'overdue',
    cancelled: 'credited',
    credited: 'credited',
  }

  const isCreditNote = dto.invoiceTypeCode === '381'

  const invoice: Record<string, unknown> = {
    user_id: userId,
    supplier_id: supplierId,
    supplier_invoice_number: dto.invoiceNumber,
    invoice_date: dto.issueDate,
    due_date: dto.dueDate || dto.issueDate,
    received_date: dto.issueDate,
    delivery_date: dto.deliveryDate || null,
    status: statusMap[dto.status] || 'registered',
    currency: dto.currencyCode || 'SEK',
    exchange_rate: dto.currencyCode === 'SEK' ? null : null,
    subtotal,
    subtotal_sek: dto.currencyCode === 'SEK' ? subtotal : null,
    vat_amount: vatAmount,
    vat_amount_sek: dto.currencyCode === 'SEK' ? vatAmount : null,
    total,
    total_sek: dto.currencyCode === 'SEK' ? total : null,
    vat_treatment: vatTreatment,
    reverse_charge: vatTreatment === 'reverse_charge',
    payment_reference: dto.ocrNumber || null,
    paid_at: dto.paymentStatus.paid ? dto.paymentStatus.lastPaymentDate || dto.issueDate : null,
    paid_amount: dto.paymentStatus.paid ? total : round2(total - dto.paymentStatus.balance.value),
    remaining_amount: round2(dto.paymentStatus.balance.value),
    is_credit_note: isCreditNote,
    notes: dto.note || null,
  }

  const items = dto.lines.map((line, idx) => mapSupplierInvoiceLine(line, idx))

  return { invoice, items }
}

function mapSupplierInvoiceLine(line: SupplierInvoiceLineDto, index: number): Record<string, unknown> {
  return {
    sort_order: index + 1,
    description: line.description || line.itemName || '',
    quantity: line.quantity || 1,
    unit: line.unitCode || 'st',
    unit_price: round2(line.unitPrice?.value ?? line.lineExtensionAmount.value),
    line_total: round2(line.lineExtensionAmount.value),
    account_number: line.accountNumber || '4000', // Default to purchases
    vat_rate: inferVatRate(line.taxPercent),
    vat_amount: round2(line.taxAmount?.value ?? 0),
  }
}

export function mapCompanyInfo(dto: CompanyInformationDto): {
  company_name: string | null
  org_number: string | null
  vat_number: string | null
  fiscal_year_start_month: number
  address_line1: string | null
  postal_code: string | null
  city: string | null
  phone: string | null
  email: string | null
} {
  const addr = formatAddress(dto.address)
  // Parse fiscal year start month from "MM-DD" format
  let fiscalYearStartMonth = 1
  if (dto.fiscalYearStart) {
    const month = parseInt(dto.fiscalYearStart.split('-')[0], 10)
    if (month >= 1 && month <= 12) fiscalYearStartMonth = month
  }

  return {
    company_name: dto.companyName || null,
    org_number: dto.organizationNumber || null,
    vat_number: dto.vatNumber || null,
    fiscal_year_start_month: fiscalYearStartMonth,
    address_line1: addr.address_line1,
    postal_code: addr.postal_code,
    city: addr.city,
    phone: dto.contact?.telephone || null,
    email: dto.contact?.email || null,
  }
}
