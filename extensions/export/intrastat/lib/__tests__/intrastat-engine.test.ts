import { describe, it, expect } from 'vitest'
import {
  generateIntrastatReport,
  getIntrastatDeadline,
  type IntrastatInvoice,
  type IntrastatCustomer,
  type IntrastatInvoiceItem,
  type ProductMetadata,
  type IntrastatOptions,
} from '../intrastat-engine'

// ── Fixtures ────────────────────────────────────────────────

function makeInvoice(overrides: Partial<IntrastatInvoice> = {}): IntrastatInvoice {
  return {
    id: 'inv-1',
    invoice_number: 'F2026-001',
    invoice_date: '2026-01-15',
    status: 'sent',
    vat_treatment: 'reverse_charge',
    moms_ruta: '35',
    currency: 'EUR',
    total_sek: 100000,
    subtotal_sek: 100000,
    subtotal: 9000,
    document_type: 'invoice',
    credited_invoice_id: null,
    customer_id: 'cust-1',
    ...overrides,
  }
}

function makeCustomer(overrides: Partial<IntrastatCustomer> = {}): IntrastatCustomer {
  return {
    id: 'cust-1',
    name: 'Acme GmbH',
    country: 'DE',
    vat_number: 'DE123456789',
    ...overrides,
  }
}

function makeItem(overrides: Partial<IntrastatInvoiceItem> = {}): IntrastatInvoiceItem {
  return {
    id: 'item-1',
    invoice_id: 'inv-1',
    description: 'Stålbalk M8',
    quantity: 100,
    unit_price: 90,
    total: 9000,
    total_sek: 100000,
    ...overrides,
  }
}

function makeProduct(overrides: Partial<ProductMetadata> = {}): ProductMetadata {
  return {
    productId: 'stålbalk m8',
    cnCode: '72163100',
    description: 'Stålbalk M8',
    netWeightKg: 45.5,
    countryOfOrigin: 'SE',
    supplementaryUnit: null,
    supplementaryUnitType: null,
    ...overrides,
  }
}

const BASE_OPTIONS: IntrastatOptions = {
  invoices: [],
  invoiceItems: [],
  customers: [],
  products: [],
  reporterVatNumber: 'SE556677889901',
  reporterName: 'Test AB',
  year: 2026,
  month: 1,
}

// ── Basic report tests ──────────────────────────────────────

describe('generateIntrastatReport', () => {
  it('generates empty report when no invoices', () => {
    const report = generateIntrastatReport(BASE_OPTIONS)

    expect(report.lines).toHaveLength(0)
    expect(report.totals.invoicedValue).toBe(0)
    expect(report.totals.netMass).toBe(0)
    expect(report.invoiceCount).toBe(0)
    expect(report.flowType).toBe('dispatch')
  })

  it('generates line from matched invoice + product', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      invoiceItems: [makeItem()],
      customers: [makeCustomer()],
      products: [makeProduct()],
    })

    expect(report.lines).toHaveLength(1)
    expect(report.lines[0].cnCode).toBe('72163100')
    expect(report.lines[0].partnerCountry).toBe('DE')
    expect(report.lines[0].countryOfOrigin).toBe('SE')
    expect(report.lines[0].invoicedValue).toBe(100000)
    expect(report.lines[0].netMass).toBe(4550) // 45.5 kg × 100 units
    expect(report.lines[0].partnerVatId).toBe('DE123456789')
  })

  it('aggregates multiple invoices with same CN code + country', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', subtotal_sek: 50000, total_sek: 50000 }),
      makeInvoice({ id: 'inv-2', subtotal_sek: 30000, total_sek: 30000 }),
    ]
    const items = [
      makeItem({ id: 'item-1', invoice_id: 'inv-1', total_sek: 50000, quantity: 50 }),
      makeItem({ id: 'item-2', invoice_id: 'inv-2', total_sek: 30000, quantity: 30 }),
    ]

    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices,
      invoiceItems: items,
      customers: [makeCustomer()],
      products: [makeProduct()],
    })

    expect(report.lines).toHaveLength(1)
    expect(report.lines[0].invoicedValue).toBe(80000)
    expect(report.lines[0].netMass).toBe(3640) // 45.5 × (50 + 30)
    expect(report.invoiceCount).toBe(2)
  })

  it('separates lines by different partner countries', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', customer_id: 'cust-1' }),
      makeInvoice({ id: 'inv-2', customer_id: 'cust-2' }),
    ]
    const items = [
      makeItem({ id: 'item-1', invoice_id: 'inv-1', quantity: 10 }),
      makeItem({ id: 'item-2', invoice_id: 'inv-2', quantity: 20 }),
    ]
    const customers = [
      makeCustomer({ id: 'cust-1', country: 'DE' }),
      makeCustomer({ id: 'cust-2', country: 'FI', vat_number: 'FI12345678', name: 'Finnish Co' }),
    ]

    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices,
      invoiceItems: items,
      customers,
      products: [makeProduct()],
    })

    expect(report.lines).toHaveLength(2)
    expect(report.lines[0].partnerCountry).toBe('DE')
    expect(report.lines[1].partnerCountry).toBe('FI')
  })

  it('separates lines by different CN codes', () => {
    const items = [
      makeItem({ id: 'item-1', invoice_id: 'inv-1', description: 'Stålbalk M8', quantity: 10, total_sek: 50000 }),
      makeItem({ id: 'item-2', invoice_id: 'inv-1', description: 'Ventil DN50', quantity: 5, total_sek: 50000 }),
    ]
    const products = [
      makeProduct({ productId: 'stålbalk m8', cnCode: '72163100', description: 'Stålbalk M8' }),
      makeProduct({ productId: 'ventil dn50', cnCode: '84818019', description: 'Ventil DN50', netWeightKg: 2.3 }),
    ]

    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      invoiceItems: items,
      customers: [makeCustomer()],
      products,
    })

    expect(report.lines).toHaveLength(2)
    const codes = report.lines.map(l => l.cnCode).sort()
    expect(codes).toEqual(['72163100', '84818019'])
  })

  // ── Credit notes ──────────────────────────────────────────

  it('handles credit notes (subtracts from totals)', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', subtotal_sek: 100000, total_sek: 100000 }),
      makeInvoice({
        id: 'inv-2',
        subtotal_sek: 20000,
        total_sek: 20000,
        credited_invoice_id: 'inv-1',
      }),
    ]
    const items = [
      makeItem({ id: 'item-1', invoice_id: 'inv-1', total_sek: 100000, quantity: 100 }),
      makeItem({ id: 'item-2', invoice_id: 'inv-2', total_sek: 20000, quantity: 20 }),
    ]

    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices,
      invoiceItems: items,
      customers: [makeCustomer()],
      products: [makeProduct()],
    })

    expect(report.lines[0].invoicedValue).toBe(80000)
    expect(report.lines[0].netMass).toBe(3640) // 45.5 × (100 - 20)
  })

  // ── Filtering ─────────────────────────────────────────────

  it('excludes non-reverse-charge invoices', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ vat_treatment: 'standard_25' })],
      invoiceItems: [makeItem()],
      customers: [makeCustomer()],
      products: [makeProduct()],
    })

    expect(report.lines).toHaveLength(0)
  })

  it('excludes services (moms_ruta 39)', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ moms_ruta: '39' })],
      invoiceItems: [makeItem()],
      customers: [makeCustomer()],
      products: [makeProduct()],
    })

    expect(report.lines).toHaveLength(0)
  })

  it('excludes non-EU countries', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      invoiceItems: [makeItem()],
      customers: [makeCustomer({ country: 'US' })],
      products: [makeProduct()],
    })

    expect(report.lines).toHaveLength(0)
  })

  it('excludes Sweden', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      invoiceItems: [makeItem()],
      customers: [makeCustomer({ country: 'SE' })],
      products: [makeProduct()],
    })

    expect(report.lines).toHaveLength(0)
  })

  it('excludes draft invoices', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ status: 'draft' })],
      invoiceItems: [makeItem()],
      customers: [makeCustomer()],
      products: [makeProduct()],
    })

    expect(report.lines).toHaveLength(0)
  })

  // ── Warnings ──────────────────────────────────────────────

  it('warns when product has no CN code', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      invoiceItems: [makeItem()],
      customers: [makeCustomer()],
      products: [makeProduct({ cnCode: null })],
    })

    const cnWarnings = report.warnings.filter(w => w.type === 'missing_cn_code')
    expect(cnWarnings.length).toBeGreaterThan(0)
  })

  it('warns when product has no weight', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      invoiceItems: [makeItem()],
      customers: [makeCustomer()],
      products: [makeProduct({ netWeightKg: null })],
    })

    const weightWarnings = report.warnings.filter(w => w.type === 'missing_weight')
    expect(weightWarnings.length).toBeGreaterThan(0)
  })

  it('warns when no product match found for invoice line', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      invoiceItems: [makeItem({ description: 'Unknown Product XYZ' })],
      customers: [makeCustomer()],
      products: [makeProduct()], // won't match 'Unknown Product XYZ'
    })

    const cnWarnings = report.warnings.filter(w => w.type === 'missing_cn_code')
    expect(cnWarnings.length).toBeGreaterThan(0)
  })

  // ── Threshold ─────────────────────────────────────────────

  it('calculates threshold status with prior cumulative', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ subtotal_sek: 500000 })],
      invoiceItems: [makeItem({ total_sek: 500000 })],
      customers: [makeCustomer()],
      products: [makeProduct()],
      priorCumulativeValue: 11_000_000,
    })

    expect(report.thresholdStatus.cumulativeValue).toBe(11_500_000)
    expect(report.thresholdStatus.isObligated).toBe(false)
    expect(report.thresholdStatus.percentageUsed).toBeCloseTo(95.83, 1)
  })

  it('flags when threshold is exceeded', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ subtotal_sek: 2_000_000 })],
      invoiceItems: [makeItem({ total_sek: 2_000_000 })],
      customers: [makeCustomer()],
      products: [makeProduct()],
      priorCumulativeValue: 11_000_000,
    })

    expect(report.thresholdStatus.isObligated).toBe(true)
    const thresholdWarnings = report.warnings.filter(w => w.type === 'threshold_exceeded')
    expect(thresholdWarnings).toHaveLength(1)
    expect(thresholdWarnings[0].severity).toBe('error')
  })

  it('warns when threshold is approaching (80%+)', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ subtotal_sek: 100000 })],
      invoiceItems: [makeItem({ total_sek: 100000 })],
      customers: [makeCustomer()],
      products: [makeProduct()],
      priorCumulativeValue: 10_000_000,
    })

    const approaching = report.warnings.filter(w => w.type === 'threshold_approaching')
    expect(approaching).toHaveLength(1)
    expect(approaching[0].severity).toBe('warning')
  })

  // ── Default values ────────────────────────────────────────

  it('uses custom default transaction nature and delivery terms', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      invoiceItems: [makeItem()],
      customers: [makeCustomer()],
      products: [makeProduct()],
      defaultTransactionNature: '31',
      defaultDeliveryTerms: 'DAP',
    })

    expect(report.lines[0].transactionNature).toBe('31')
    expect(report.lines[0].deliveryTerms).toBe('DAP')
  })

  it('defaults to transaction nature 11 and FCA', () => {
    const report = generateIntrastatReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      invoiceItems: [makeItem()],
      customers: [makeCustomer()],
      products: [makeProduct()],
    })

    expect(report.lines[0].transactionNature).toBe('11')
    expect(report.lines[0].deliveryTerms).toBe('FCA')
  })

  // ── Period info ───────────────────────────────────────────

  it('includes period and reporter info', () => {
    const report = generateIntrastatReport(BASE_OPTIONS)

    expect(report.period).toEqual({ year: 2026, month: 1 })
    expect(report.reporterVatNumber).toBe('SE556677889901')
    expect(report.reporterName).toBe('Test AB')
  })
})

// ── Deadline tests ──────────────────────────────────────────

describe('getIntrastatDeadline', () => {
  it('returns 14th of following month', () => {
    expect(getIntrastatDeadline(2026, 1)).toBe('2026-02-14')
    expect(getIntrastatDeadline(2026, 6)).toBe('2026-07-14')
  })

  it('rolls over to next year for December', () => {
    expect(getIntrastatDeadline(2026, 12)).toBe('2027-01-14')
  })
})
