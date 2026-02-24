/**
 * EU Sales List / Periodisk Sammanställning Engine
 *
 * Core business logic for generating EC Sales List reports.
 * Pure functions — no Supabase, no React, no side effects.
 *
 * Aggregates intra-community B2B sales by customer VAT number,
 * separating goods (account 3108, box 35) from services (account 3308, box 39).
 *
 * Reference: Skatteverket SKV 5740
 * Filing: Monthly for goods, quarterly for services
 * Deadline: 25th of the month following the reporting period
 */

import { isEUCountry, toCountryCode } from '@/extensions/export/shared/eu-countries'

// ── Types ────────────────────────────────────────────────────

/** Invoice data needed for EC Sales List generation */
export interface ECSalesListInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  status: string
  currency: string
  total: number
  total_sek: number | null
  subtotal: number
  subtotal_sek: number | null
  vat_treatment: string
  moms_ruta: string | null
  document_type: string
  credited_invoice_id: string | null
  customer_id: string
}

/** Customer data needed for EC Sales List */
export interface ECSalesListCustomer {
  id: string
  name: string
  country: string
  customer_type: string
  vat_number: string | null
  vat_number_validated: boolean
}

/** Journal entry line data for cross-checking */
export interface GLAccountTotal {
  account_number: string
  credit: number
}

/** Aggregated line in the EC Sales List report */
export interface ECSalesListLine {
  customerVatNumber: string
  customerName: string
  customerCountry: string
  customerId: string
  goodsAmount: number
  servicesAmount: number
  triangulationAmount: number
  invoiceCount: number
}

/** Warning about data quality */
export interface ECSalesListWarning {
  type:
    | 'missing_vat_number'
    | 'unvalidated_vat_number'
    | 'missing_moms_ruta'
    | 'non_eu_country'
    | 'cross_check_mismatch'
  severity: 'error' | 'warning'
  invoiceId?: string
  invoiceNumber?: string
  customerId?: string
  customerName?: string
  message: string
}

/** Cross-check result comparing report totals vs GL */
export interface CrossCheckResult {
  box35Match: boolean
  box35ReportTotal: number
  box35GLTotal: number
  box39Match: boolean
  box39ReportTotal: number
  box39GLTotal: number
}

/** Complete EC Sales List report */
export interface ECSalesListReport {
  period: {
    year: number
    month?: number
    quarter?: number
  }
  filingType: 'monthly' | 'quarterly'
  reporterVatNumber: string
  reporterName: string
  lines: ECSalesListLine[]
  totals: {
    goods: number
    services: number
    triangulation: number
    total: number
  }
  warnings: ECSalesListWarning[]
  crossCheck: CrossCheckResult | null
  invoiceCount: number
  customerCount: number
}

/** Options for generating the report */
export interface GenerateReportOptions {
  invoices: ECSalesListInvoice[]
  customers: ECSalesListCustomer[]
  glTotals?: GLAccountTotal[]
  reporterVatNumber: string
  reporterName: string
  year: number
  month?: number
  quarter?: number
}

// ── Revenue account classification ─────────────────────────

/** Accounts that represent EU goods sales (box 35) */
const GOODS_ACCOUNTS = ['3108', '3521']

/** Accounts that represent EU service sales (box 39) */
const SERVICE_ACCOUNTS = ['3308']

/** Accounts for triangular trade (box 38) */
const TRIANGULATION_ACCOUNTS = ['3109']

// ── Core engine ──────────────────────────────────────────────

/**
 * Generate an EC Sales List report from invoice and customer data.
 *
 * Steps:
 * 1. Filter invoices to EU B2B reverse charge only
 * 2. Join with customers
 * 3. Validate data quality (VAT numbers, country codes)
 * 4. Group by customer VAT number
 * 5. Classify as goods or services based on moms_ruta / vat_treatment
 * 6. Cross-check against GL account totals if provided
 */
export function generateECSalesListReport(options: GenerateReportOptions): ECSalesListReport {
  const {
    invoices,
    customers,
    glTotals,
    reporterVatNumber,
    reporterName,
    year,
    month,
    quarter,
  } = options

  const warnings: ECSalesListWarning[] = []
  const customerMap = new Map(customers.map(c => [c.id, c]))

  // Step 1: Filter to relevant invoices
  const relevantInvoices = invoices.filter(inv => {
    // Only sent, paid, or overdue invoices (not drafts)
    if (!['sent', 'paid', 'overdue'].includes(inv.status)) return false
    // Only actual invoices (not proforma/delivery notes) — except credit notes
    if (inv.document_type !== 'invoice' && inv.credited_invoice_id === null) return false
    // Must be reverse charge (EU B2B)
    if (inv.vat_treatment !== 'reverse_charge') return false
    return true
  })

  // Step 2: Build aggregation map (keyed by customer VAT number)
  const aggregation = new Map<string, ECSalesListLine>()

  for (const invoice of relevantInvoices) {
    const customer = customerMap.get(invoice.customer_id)
    if (!customer) continue

    // Validate: customer should be in an EU country (not Sweden)
    if (!isEUCountry(customer.country)) {
      warnings.push({
        type: 'non_eu_country',
        severity: 'warning',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerId: customer.id,
        customerName: customer.name,
        message: `Faktura ${invoice.invoice_number} till ${customer.name} har omvänd skattskyldighet men kunden är i ${customer.country} (ej EU).`,
      })
      continue
    }

    // Validate: VAT number must exist
    if (!customer.vat_number) {
      warnings.push({
        type: 'missing_vat_number',
        severity: 'error',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerId: customer.id,
        customerName: customer.name,
        message: `Faktura ${invoice.invoice_number} till ${customer.name} saknar momsregistreringsnummer (VAT-nummer). Krävs för periodisk sammanställning.`,
      })
      continue
    }

    // Validate: VAT number should be validated via VIES
    if (!customer.vat_number_validated) {
      warnings.push({
        type: 'unvalidated_vat_number',
        severity: 'warning',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerId: customer.id,
        customerName: customer.name,
        message: `VAT-nummer ${customer.vat_number} för ${customer.name} har inte validerats via VIES.`,
      })
    }

    // Determine amount in SEK (use total_sek if available, else total for SEK invoices)
    const amountSek = getAmountSek(invoice)

    // Determine if this is a credit note (negative amount)
    const isCreditNote = invoice.credited_invoice_id !== null
    const effectiveAmount = isCreditNote ? -Math.abs(amountSek) : amountSek

    // Classify: goods (box 35) or services (box 39)
    const classification = classifyInvoice(invoice)

    // Normalize country to ISO code for consistent output
    const countryCode = toCountryCode(customer.country)

    // Get or create aggregation line
    const vatNumber = customer.vat_number
    const key = vatNumber
    if (!aggregation.has(key)) {
      aggregation.set(key, {
        customerVatNumber: vatNumber,
        customerName: customer.name,
        customerCountry: countryCode,
        customerId: customer.id,
        goodsAmount: 0,
        servicesAmount: 0,
        triangulationAmount: 0,
        invoiceCount: 0,
      })
    }

    const line = aggregation.get(key)!
    line.invoiceCount++

    if (classification === 'triangulation') {
      line.triangulationAmount = round2(line.triangulationAmount + effectiveAmount)
    } else if (classification === 'goods') {
      line.goodsAmount = round2(line.goodsAmount + effectiveAmount)
    } else {
      line.servicesAmount = round2(line.servicesAmount + effectiveAmount)
    }
  }

  // Step 3: Build sorted output
  const lines = Array.from(aggregation.values())
    .sort((a, b) => a.customerCountry.localeCompare(b.customerCountry) || a.customerVatNumber.localeCompare(b.customerVatNumber))

  // Step 4: Calculate totals
  const totals = {
    goods: round2(lines.reduce((sum, l) => sum + l.goodsAmount, 0)),
    services: round2(lines.reduce((sum, l) => sum + l.servicesAmount, 0)),
    triangulation: round2(lines.reduce((sum, l) => sum + l.triangulationAmount, 0)),
    total: 0,
  }
  totals.total = round2(totals.goods + totals.services + totals.triangulation)

  // Step 5: Cross-check against GL if data provided
  let crossCheck: CrossCheckResult | null = null
  if (glTotals && glTotals.length > 0) {
    crossCheck = performCrossCheck(totals, glTotals, warnings)
  }

  return {
    period: { year, month, quarter },
    filingType: month !== undefined ? 'monthly' : 'quarterly',
    reporterVatNumber,
    reporterName,
    lines,
    totals,
    warnings,
    crossCheck,
    invoiceCount: relevantInvoices.length,
    customerCount: lines.length,
  }
}

// ── Classification helpers ───────────────────────────────────

type InvoiceClassification = 'goods' | 'services' | 'triangulation'

/**
 * Classify an invoice as goods, services, or triangulation.
 *
 * Uses moms_ruta as primary signal (most reliable, set during invoice creation).
 * Falls back to vat_treatment if moms_ruta is not set.
 *
 * Box 35 = goods to EU (account 3108)
 * Box 38 = triangular trade (account 3109)
 * Box 39 = services to EU (account 3308)
 */
function classifyInvoice(invoice: ECSalesListInvoice): InvoiceClassification {
  const ruta = invoice.moms_ruta

  if (ruta === '35') return 'goods'
  if (ruta === '38') return 'triangulation'
  if (ruta === '39') return 'services'

  // Fallback: EU B2B reverse charge defaults to services (box 39)
  // since the current VAT rules assign '39' for all reverse charge.
  // Goods classification requires explicit moms_ruta = '35'.
  return 'services'
}

// ── Cross-check ──────────────────────────────────────────────

/**
 * Compare report totals against GL account credit totals.
 *
 * Box 35 total should match credit sum on accounts 3108 + 3521
 * Box 39 total should match credit sum on account 3308
 *
 * A tolerance of 1 SEK is allowed for rounding differences.
 */
function performCrossCheck(
  totals: { goods: number; services: number },
  glTotals: GLAccountTotal[],
  warnings: ECSalesListWarning[]
): CrossCheckResult {
  const glMap = new Map(glTotals.map(t => [t.account_number, t.credit]))

  const box35GL = round2(
    GOODS_ACCOUNTS.reduce((sum, acc) => sum + (glMap.get(acc) ?? 0), 0)
  )
  const box39GL = round2(
    SERVICE_ACCOUNTS.reduce((sum, acc) => sum + (glMap.get(acc) ?? 0), 0)
  )

  const TOLERANCE = 1 // Allow 1 SEK rounding difference
  const box35Match = Math.abs(totals.goods - box35GL) <= TOLERANCE
  const box39Match = Math.abs(totals.services - box39GL) <= TOLERANCE

  if (!box35Match) {
    warnings.push({
      type: 'cross_check_mismatch',
      severity: 'warning',
      message: `Ruta 35 (varuförsäljning EU): rapporten visar ${totals.goods} SEK men huvudboken visar ${box35GL} SEK (differens ${round2(totals.goods - box35GL)} SEK).`,
    })
  }

  if (!box39Match) {
    warnings.push({
      type: 'cross_check_mismatch',
      severity: 'warning',
      message: `Ruta 39 (tjänsteförsäljning EU): rapporten visar ${totals.services} SEK men huvudboken visar ${box39GL} SEK (differens ${round2(totals.services - box39GL)} SEK).`,
    })
  }

  return {
    box35Match,
    box35ReportTotal: totals.goods,
    box35GLTotal: box35GL,
    box39Match,
    box39ReportTotal: totals.services,
    box39GLTotal: box39GL,
  }
}

// ── Amount helpers ───────────────────────────────────────────

/**
 * Get the SEK amount for an invoice.
 * Uses subtotal_sek (excluding VAT) for the EC Sales List,
 * since reverse charge invoices have 0 VAT and subtotal === total.
 * Falls back to subtotal if SEK amounts are not populated.
 */
function getAmountSek(invoice: ECSalesListInvoice): number {
  // For reverse charge invoices, subtotal_sek is the correct base
  if (invoice.subtotal_sek !== null) return round2(invoice.subtotal_sek)
  // If no SEK conversion exists, the invoice is already in SEK
  return round2(invoice.subtotal)
}

/** Round to 2 decimal places (monetary standard) */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

// ── Period helpers ───────────────────────────────────────────

/** Get the start and end dates for a monthly period */
export function getMonthPeriod(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** Get the start and end dates for a quarterly period */
export function getQuarterPeriod(year: number, quarter: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  const start = `${year}-${String(startMonth).padStart(2, '0')}-01`
  const lastDay = new Date(year, endMonth, 0).getDate()
  const end = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** Get the filing deadline for a period (25th of the month after period end) */
export function getFilingDeadline(year: number, month?: number, quarter?: number): string {
  let deadlineMonth: number
  let deadlineYear = year

  if (month !== undefined) {
    // Monthly filing: due 25th of the following month
    deadlineMonth = month + 1
    if (deadlineMonth > 12) {
      deadlineMonth = 1
      deadlineYear++
    }
  } else if (quarter !== undefined) {
    // Quarterly filing: due 25th of the month after quarter end
    deadlineMonth = quarter * 3 + 1
    if (deadlineMonth > 12) {
      deadlineMonth = 1
      deadlineYear++
    }
  } else {
    throw new Error('Either month or quarter must be provided')
  }

  return `${deadlineYear}-${String(deadlineMonth).padStart(2, '0')}-25`
}

/** Calculate days remaining until a deadline */
export function daysUntilDeadline(deadline: string): number {
  const deadlineDate = new Date(deadline)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  deadlineDate.setHours(0, 0, 0, 0)
  const diffMs = deadlineDate.getTime() - today.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}
