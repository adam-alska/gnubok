/**
 * Intrastat Generator Engine
 *
 * Aggregates EU B2B goods sales into Intrastat declaration lines
 * for reporting to SCB (Statistiska Centralbyrån) via IDEP.web.
 *
 * Pure functions — no Supabase, no React, no side effects.
 *
 * Only covers dispatches (utförsel) — goods sent from Sweden to
 * other EU member states. Services are excluded from Intrastat.
 *
 * Threshold: SEK 12,000,000 cumulative dispatches over 12 months
 * determines mandatory reporting obligation.
 *
 * Reference: SCB Intrastat guidelines, Combined Nomenclature (CN)
 */

import { isEUCountry } from '@/extensions/export/shared/eu-countries'

// ── Types ────────────────────────────────────────────────────

/** Invoice data needed for Intrastat */
export interface IntrastatInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  status: string
  vat_treatment: string
  moms_ruta: string | null
  currency: string
  total_sek: number | null
  subtotal_sek: number | null
  subtotal: number
  document_type: string
  credited_invoice_id: string | null
  customer_id: string
}

/** Customer data for Intrastat */
export interface IntrastatCustomer {
  id: string
  name: string
  country: string
  vat_number: string | null
}

/** Product metadata stored in extension_data */
export interface ProductMetadata {
  productId: string
  cnCode: string | null
  description: string
  netWeightKg: number | null
  countryOfOrigin: string
  supplementaryUnit: number | null
  supplementaryUnitType: string | null
}

/** Invoice line item for matching to products */
export interface IntrastatInvoiceItem {
  id: string
  invoice_id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  total_sek: number | null
}

/** Aggregated Intrastat declaration line */
export interface IntrastatLine {
  cnCode: string
  partnerCountry: string
  countryOfOrigin: string
  transactionNature: string
  deliveryTerms: string
  invoicedValue: number
  netMass: number
  supplementaryUnit: number | null
  supplementaryUnitType: string | null
  partnerVatId: string
}

/** Warning about data quality */
export interface IntrastatWarning {
  type:
    | 'missing_cn_code'
    | 'missing_weight'
    | 'missing_origin'
    | 'threshold_approaching'
    | 'threshold_exceeded'
  severity: 'error' | 'warning'
  invoiceId?: string
  invoiceNumber?: string
  productId?: string
  message: string
}

/** Threshold monitoring status */
export interface ThresholdStatus {
  cumulativeValue: number
  threshold: number
  isObligated: boolean
  percentageUsed: number
}

/** Complete Intrastat report */
export interface IntrastatReport {
  period: { year: number; month: number }
  reporterVatNumber: string
  reporterName: string
  flowType: 'dispatch'
  lines: IntrastatLine[]
  totals: {
    invoicedValue: number
    netMass: number
    lineCount: number
  }
  thresholdStatus: ThresholdStatus
  warnings: IntrastatWarning[]
  invoiceCount: number
}

/** Options for generating the Intrastat report */
export interface IntrastatOptions {
  invoices: IntrastatInvoice[]
  invoiceItems: IntrastatInvoiceItem[]
  customers: IntrastatCustomer[]
  products: ProductMetadata[]
  reporterVatNumber: string
  reporterName: string
  year: number
  month: number
  defaultTransactionNature?: string
  defaultDeliveryTerms?: string
  /** Cumulative dispatch value from prior months in the rolling 12-month window */
  priorCumulativeValue?: number
}

// ── Constants ───────────────────────────────────────────────

/** SCB Intrastat reporting threshold in SEK (12 million) */
const INTRASTAT_THRESHOLD = 12_000_000

/** Goods revenue accounts that trigger Intrastat reporting */
const GOODS_ACCOUNTS_RUTA = ['35']

// ── Core engine ──────────────────────────────────────────────

export function generateIntrastatReport(options: IntrastatOptions): IntrastatReport {
  const {
    invoices,
    invoiceItems,
    customers,
    products,
    reporterVatNumber,
    reporterName,
    year,
    month,
    defaultTransactionNature = '11',
    defaultDeliveryTerms = 'FCA',
    priorCumulativeValue = 0,
  } = options

  const warnings: IntrastatWarning[] = []
  const customerMap = new Map(customers.map(c => [c.id, c]))
  const productMap = buildProductMap(products)

  // Step 1: Filter to EU B2B goods invoices
  const relevantInvoices = invoices.filter(inv => {
    if (!['sent', 'paid', 'overdue'].includes(inv.status)) return false
    if (inv.document_type !== 'invoice' && inv.credited_invoice_id === null) return false
    if (inv.vat_treatment !== 'reverse_charge') return false
    // Only goods (moms_ruta 35) — services are excluded from Intrastat
    if (inv.moms_ruta && !GOODS_ACCOUNTS_RUTA.includes(inv.moms_ruta)) return false
    // Verify customer is in EU (not Sweden)
    const customer = customerMap.get(inv.customer_id)
    if (!customer || !isEUCountry(customer.country)) return false
    return true
  })

  // Step 2: Build items index by invoice_id
  const itemsByInvoice = new Map<string, IntrastatInvoiceItem[]>()
  for (const item of invoiceItems) {
    const list = itemsByInvoice.get(item.invoice_id) ?? []
    list.push(item)
    itemsByInvoice.set(item.invoice_id, list)
  }

  // Step 3: Build aggregation map
  // Key: cnCode|partnerCountry|countryOfOrigin|transactionNature|deliveryTerms
  const aggregation = new Map<string, IntrastatLine>()

  for (const invoice of relevantInvoices) {
    const customer = customerMap.get(invoice.customer_id)!
    const isCreditNote = invoice.credited_invoice_id !== null
    const items = itemsByInvoice.get(invoice.id) ?? []

    if (items.length === 0) {
      // No line items — use invoice-level amount with unknown product
      const amountSek = getInvoiceAmountSek(invoice)
      const effectiveAmount = isCreditNote ? -Math.abs(amountSek) : amountSek

      warnings.push({
        type: 'missing_cn_code',
        severity: 'error',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        message: `Faktura ${invoice.invoice_number} saknar fakturarader — kan inte tilldela CN-kod.`,
      })

      const key = buildAggKey('00000000', customer.country, 'SE', defaultTransactionNature, defaultDeliveryTerms)
      addToAggregation(aggregation, key, {
        cnCode: '00000000',
        partnerCountry: customer.country,
        countryOfOrigin: 'SE',
        transactionNature: defaultTransactionNature,
        deliveryTerms: defaultDeliveryTerms,
        invoicedValue: effectiveAmount,
        netMass: 0,
        supplementaryUnit: null,
        supplementaryUnitType: null,
        partnerVatId: customer.vat_number ?? '',
      })
      continue
    }

    // Process each line item
    for (const item of items) {
      const product = matchProduct(item.description, productMap)
      const amountSek = item.total_sek ?? item.total
      const effectiveAmount = isCreditNote ? -Math.abs(amountSek) : amountSek

      if (!product) {
        // No product metadata found — use defaults and warn
        warnings.push({
          type: 'missing_cn_code',
          severity: 'error',
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          message: `Faktura ${invoice.invoice_number}, rad "${item.description}" — ingen matchande produkt med CN-kod hittad.`,
        })

        const key = buildAggKey('00000000', customer.country, 'SE', defaultTransactionNature, defaultDeliveryTerms)
        addToAggregation(aggregation, key, {
          cnCode: '00000000',
          partnerCountry: customer.country,
          countryOfOrigin: 'SE',
          transactionNature: defaultTransactionNature,
          deliveryTerms: defaultDeliveryTerms,
          invoicedValue: effectiveAmount,
          netMass: 0,
          supplementaryUnit: null,
          supplementaryUnitType: null,
          partnerVatId: customer.vat_number ?? '',
        })
        continue
      }

      // Validate product metadata
      if (!product.cnCode) {
        warnings.push({
          type: 'missing_cn_code',
          severity: 'error',
          productId: product.productId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          message: `Produkt "${product.description}" saknar CN-kod.`,
        })
      }

      if (product.netWeightKg === null) {
        warnings.push({
          type: 'missing_weight',
          severity: 'warning',
          productId: product.productId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          message: `Produkt "${product.description}" saknar nettovikt.`,
        })
      }

      const cnCode = product.cnCode ?? '00000000'
      const origin = product.countryOfOrigin || 'SE'
      const mass = (product.netWeightKg ?? 0) * item.quantity
      const suppUnit = product.supplementaryUnit !== null
        ? product.supplementaryUnit * item.quantity
        : null

      const key = buildAggKey(cnCode, customer.country, origin, defaultTransactionNature, defaultDeliveryTerms)
      addToAggregation(aggregation, key, {
        cnCode,
        partnerCountry: customer.country,
        countryOfOrigin: origin,
        transactionNature: defaultTransactionNature,
        deliveryTerms: defaultDeliveryTerms,
        invoicedValue: effectiveAmount,
        netMass: isCreditNote ? -Math.abs(mass) : mass,
        supplementaryUnit: suppUnit !== null ? (isCreditNote ? -Math.abs(suppUnit) : suppUnit) : null,
        supplementaryUnitType: product.supplementaryUnitType,
        partnerVatId: customer.vat_number ?? '',
      })
    }
  }

  // Step 4: Build sorted output
  const lines = Array.from(aggregation.values())
    .map(line => ({
      ...line,
      invoicedValue: round2(line.invoicedValue),
      netMass: round3(line.netMass),
    }))
    .sort((a, b) =>
      a.cnCode.localeCompare(b.cnCode) ||
      a.partnerCountry.localeCompare(b.partnerCountry)
    )

  // Step 5: Calculate totals
  const totals = {
    invoicedValue: round2(lines.reduce((sum, l) => sum + l.invoicedValue, 0)),
    netMass: round3(lines.reduce((sum, l) => sum + l.netMass, 0)),
    lineCount: lines.length,
  }

  // Step 6: Threshold status
  const cumulativeValue = round2(priorCumulativeValue + totals.invoicedValue)
  const percentageUsed = INTRASTAT_THRESHOLD > 0
    ? round2((cumulativeValue / INTRASTAT_THRESHOLD) * 100)
    : 0

  const thresholdStatus: ThresholdStatus = {
    cumulativeValue,
    threshold: INTRASTAT_THRESHOLD,
    isObligated: cumulativeValue >= INTRASTAT_THRESHOLD,
    percentageUsed,
  }

  if (percentageUsed >= 100) {
    warnings.push({
      type: 'threshold_exceeded',
      severity: 'error',
      message: `Tröskelvärdet för Intrastat (${formatSEK(INTRASTAT_THRESHOLD)} SEK) har överskridits. Rapportering till SCB är obligatorisk.`,
    })
  } else if (percentageUsed >= 80) {
    warnings.push({
      type: 'threshold_approaching',
      severity: 'warning',
      message: `Ackumulerad utförsel är ${formatSEK(cumulativeValue)} SEK (${percentageUsed}% av tröskelvärdet). Rapporteringsskyldighet kan uppstå snart.`,
    })
  }

  return {
    period: { year, month },
    reporterVatNumber,
    reporterName,
    flowType: 'dispatch',
    lines,
    totals,
    thresholdStatus,
    warnings,
    invoiceCount: relevantInvoices.length,
  }
}

// ── Product matching ────────────────────────────────────────

/**
 * Build a map for fast product lookup by description (case-insensitive).
 * Products are matched by exact description or by productId.
 */
function buildProductMap(products: ProductMetadata[]): Map<string, ProductMetadata> {
  const map = new Map<string, ProductMetadata>()
  for (const product of products) {
    map.set(product.productId.toLowerCase(), product)
    if (product.description) {
      map.set(product.description.toLowerCase(), product)
    }
  }
  return map
}

/**
 * Match an invoice line description to a product.
 * Tries exact match first, then checks if description starts with a product key.
 */
function matchProduct(description: string, productMap: Map<string, ProductMetadata>): ProductMetadata | null {
  const lower = description.toLowerCase().trim()

  // Exact match
  if (productMap.has(lower)) return productMap.get(lower)!

  // Prefix match (invoice description may contain extra details)
  for (const [key, product] of productMap) {
    if (lower.startsWith(key) || key.startsWith(lower)) {
      return product
    }
  }

  return null
}

// ── Aggregation helpers ─────────────────────────────────────

function buildAggKey(
  cnCode: string,
  partnerCountry: string,
  origin: string,
  transactionNature: string,
  deliveryTerms: string,
): string {
  return `${cnCode}|${partnerCountry}|${origin}|${transactionNature}|${deliveryTerms}`
}

function addToAggregation(
  map: Map<string, IntrastatLine>,
  key: string,
  line: IntrastatLine,
): void {
  const existing = map.get(key)
  if (existing) {
    existing.invoicedValue += line.invoicedValue
    existing.netMass += line.netMass
    if (existing.supplementaryUnit !== null && line.supplementaryUnit !== null) {
      existing.supplementaryUnit += line.supplementaryUnit
    }
    // Keep the first partner VAT ID encountered
  } else {
    map.set(key, { ...line })
  }
}

// ── Amount helpers ──────────────────────────────────────────

function getInvoiceAmountSek(invoice: IntrastatInvoice): number {
  if (invoice.subtotal_sek !== null) return round2(invoice.subtotal_sek)
  return round2(invoice.subtotal)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function formatSEK(amount: number): string {
  return Math.round(amount).toLocaleString('sv-SE')
}

// ── Period helpers ───────────────────────────────────────────

/**
 * Get the Intrastat filing deadline for a month.
 * The deadline is the 10th business day of the following month.
 * For simplicity, we approximate as the 14th of the following month.
 */
export function getIntrastatDeadline(year: number, month: number): string {
  let deadlineMonth = month + 1
  let deadlineYear = year
  if (deadlineMonth > 12) {
    deadlineMonth = 1
    deadlineYear++
  }
  return `${deadlineYear}-${String(deadlineMonth).padStart(2, '0')}-14`
}
