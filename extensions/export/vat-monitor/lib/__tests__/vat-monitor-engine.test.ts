import { describe, it, expect } from 'vitest'
import {
  generateVatMonitorReport,
  type GLLine,
  type VatMonitorInvoice,
  type VatMonitorCustomer,
  type VatMonitorOptions,
} from '../vat-monitor-engine'

// ── Helpers ─────────────────────────────────────────────────

/** Create a credit GL line (revenue is credit-side) */
function creditLine(account: string, amount: number): GLLine {
  return { account_number: account, debit_amount: 0, credit_amount: amount }
}

/** Create a debit GL line (input VAT is debit-side) */
function debitLine(account: string, amount: number): GLLine {
  return { account_number: account, debit_amount: amount, credit_amount: 0 }
}

function makeInvoice(overrides: Partial<VatMonitorInvoice> = {}): VatMonitorInvoice {
  return {
    id: 'inv-1',
    invoice_number: 'F2026-001',
    vat_treatment: 'reverse_charge',
    moms_ruta: '35',
    customer_id: 'cust-1',
    ...overrides,
  }
}

function makeCustomer(overrides: Partial<VatMonitorCustomer> = {}): VatMonitorCustomer {
  return {
    id: 'cust-1',
    name: 'Acme GmbH',
    country: 'DE',
    vat_number: 'DE123456789',
    vat_number_validated: true,
    ...overrides,
  }
}

const BASE_OPTIONS: VatMonitorOptions = {
  glLines: [],
  year: 2026,
  month: 1,
}

// ── Box mapping tests ───────────────────────────────────────

describe('box mapping', () => {
  it('maps domestic revenue (3001) to box 05', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3001', 100000)],
    })

    const box05 = report.boxes.find(b => b.boxNumber === '05')
    expect(box05).toBeDefined()
    expect(box05!.amount).toBe(100000)
  })

  it('maps EU goods (3108) to box 35', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3108', 50000)],
    })

    const box35 = report.boxes.find(b => b.boxNumber === '35')
    expect(box35).toBeDefined()
    expect(box35!.amount).toBe(50000)
  })

  it('maps EU freight (3521) to box 35 alongside 3108', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3108', 40000), creditLine('3521', 10000)],
    })

    const box35 = report.boxes.find(b => b.boxNumber === '35')
    expect(box35!.amount).toBe(50000)
    expect(box35!.accounts).toContain('3108')
    expect(box35!.accounts).toContain('3521')
  })

  it('maps export goods (3105) to box 36', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3105', 80000)],
    })

    const box36 = report.boxes.find(b => b.boxNumber === '36')
    expect(box36!.amount).toBe(80000)
  })

  it('maps export freight (3522) to box 36', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3522', 15000)],
    })

    const box36 = report.boxes.find(b => b.boxNumber === '36')
    expect(box36!.amount).toBe(15000)
  })

  it('maps triangulation (3109) to box 38', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3109', 25000)],
    })

    const box38 = report.boxes.find(b => b.boxNumber === '38')
    expect(box38!.amount).toBe(25000)
  })

  it('maps EU services (3308) to box 39', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3308', 30000)],
    })

    const box39 = report.boxes.find(b => b.boxNumber === '39')
    expect(box39!.amount).toBe(30000)
  })

  it('maps export services (3305) to box 40', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3305', 20000)],
    })

    const box40 = report.boxes.find(b => b.boxNumber === '40')
    expect(box40!.amount).toBe(20000)
  })

  it('maps output VAT (2611) to box 10', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('2611', 25000)],
    })

    const box10 = report.boxes.find(b => b.boxNumber === '10')
    expect(box10!.amount).toBe(25000)
  })

  it('maps input VAT (2641) to box 48', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [debitLine('2641', 15000)],
    })

    const box48 = report.boxes.find(b => b.boxNumber === '48')
    expect(box48!.amount).toBe(15000)
  })
})

// ── Revenue breakdown tests ─────────────────────────────────

describe('revenue breakdown', () => {
  it('calculates correct breakdown for mixed revenue', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [
        creditLine('3001', 200000),  // domestic
        creditLine('3108', 100000),  // EU goods
        creditLine('3308', 50000),   // EU services
        creditLine('3105', 75000),   // export goods
        creditLine('3305', 25000),   // export services
      ],
    })

    const rb = report.revenueBreakdown
    expect(rb.totalRevenue).toBe(450000)
    expect(rb.domestic.amount).toBe(200000)
    expect(rb.euGoods.amount).toBe(100000)
    expect(rb.euServices.amount).toBe(50000)
    expect(rb.exportGoods.amount).toBe(75000)
    expect(rb.exportServices.amount).toBe(25000)
  })

  it('calculates correct percentages', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [
        creditLine('3001', 50000),
        creditLine('3108', 50000),
      ],
    })

    expect(report.revenueBreakdown.domestic.percentage).toBe(50)
    expect(report.revenueBreakdown.euGoods.percentage).toBe(50)
  })

  it('returns 0% when no revenue', () => {
    const report = generateVatMonitorReport(BASE_OPTIONS)

    expect(report.revenueBreakdown.totalRevenue).toBe(0)
    expect(report.revenueBreakdown.domestic.percentage).toBe(0)
  })

  it('only domestic sales — export categories are zero', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3001', 100000)],
    })

    expect(report.revenueBreakdown.domestic.amount).toBe(100000)
    expect(report.revenueBreakdown.euGoods.amount).toBe(0)
    expect(report.revenueBreakdown.exportGoods.amount).toBe(0)
  })
})

// ── VAT summary tests ───────────────────────────────────────

describe('VAT summary', () => {
  it('calculates net VAT: output - input = box 49', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [
        creditLine('2611', 50000),  // output 25%
        creditLine('2621', 12000),  // output 12%
        creditLine('2631', 3000),   // output 6%
        debitLine('2641', 30000),   // input VAT
      ],
    })

    expect(report.vatSummary.outputVat25).toBe(50000)
    expect(report.vatSummary.outputVat12).toBe(12000)
    expect(report.vatSummary.outputVat6).toBe(3000)
    expect(report.vatSummary.totalOutputVat).toBe(65000)
    expect(report.vatSummary.inputVat).toBe(30000)
    expect(report.vatSummary.netVat).toBe(35000)
    expect(report.vatSummary.isRefund).toBe(false)
  })

  it('identifies refund when input > output', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [
        creditLine('2611', 10000),
        debitLine('2641', 50000),
      ],
    })

    expect(report.vatSummary.netVat).toBe(-40000)
    expect(report.vatSummary.isRefund).toBe(true)
  })

  it('box 49 appears in boxes list', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [
        creditLine('2611', 25000),
        debitLine('2641', 10000),
      ],
    })

    const box49 = report.boxes.find(b => b.boxNumber === '49')
    expect(box49).toBeDefined()
    expect(box49!.amount).toBe(15000)
    expect(box49!.label).toContain('betala')
  })
})

// ── Invoice validation tests ────────────────────────────────

describe('invoice validation', () => {
  it('warns when reverse_charge invoice has customer without VAT number', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3108', 10000)],
      invoices: [makeInvoice({ vat_treatment: 'reverse_charge' })],
      customers: [makeCustomer({ vat_number: null })],
    })

    const missingVat = report.warnings.filter(w => w.type === 'missing_vat_number')
    expect(missingVat).toHaveLength(1)
    expect(missingVat[0].severity).toBe('error')
  })

  it('warns when reverse_charge invoice has unvalidated VAT number', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3108', 10000)],
      invoices: [makeInvoice({ vat_treatment: 'reverse_charge' })],
      customers: [makeCustomer({ vat_number_validated: false })],
    })

    const unvalidated = report.warnings.filter(w => w.type === 'unvalidated_vat_number')
    expect(unvalidated).toHaveLength(1)
    expect(unvalidated[0].severity).toBe('warning')
  })

  it('warns when moms_ruta does not match vat_treatment', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [],
      invoices: [makeInvoice({ vat_treatment: 'standard_25', moms_ruta: '35' })],
      customers: [makeCustomer()],
    })

    const mismatch = report.warnings.filter(w => w.type === 'vat_treatment_mismatch')
    expect(mismatch).toHaveLength(1)
  })

  it('no warning when moms_ruta matches reverse_charge (35, 38, or 39)', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [],
      invoices: [
        makeInvoice({ id: 'i1', vat_treatment: 'reverse_charge', moms_ruta: '35' }),
        makeInvoice({ id: 'i2', vat_treatment: 'reverse_charge', moms_ruta: '39' }),
        makeInvoice({ id: 'i3', vat_treatment: 'reverse_charge', moms_ruta: '38' }),
      ],
      customers: [makeCustomer()],
    })

    const mismatch = report.warnings.filter(w => w.type === 'vat_treatment_mismatch')
    expect(mismatch).toHaveLength(0)
  })

  it('no warning when moms_ruta matches export (36 or 40)', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [],
      invoices: [
        makeInvoice({ id: 'i1', vat_treatment: 'export', moms_ruta: '36' }),
        makeInvoice({ id: 'i2', vat_treatment: 'export', moms_ruta: '40' }),
      ],
      customers: [makeCustomer()],
    })

    const mismatch = report.warnings.filter(w => w.type === 'vat_treatment_mismatch')
    expect(mismatch).toHaveLength(0)
  })

  it('no validation warnings when no invoices provided', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3108', 10000)],
    })

    expect(report.warnings).toHaveLength(0)
  })
})

// ── Period comparison tests ─────────────────────────────────

describe('period comparison', () => {
  it('calculates delta between current and previous period', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3001', 200000)],
      previousGlLines: [creditLine('3001', 150000)],
    })

    expect(report.comparison).not.toBeNull()
    expect(report.comparison!.domestic.current).toBe(200000)
    expect(report.comparison!.domestic.previous).toBe(150000)
    expect(report.comparison!.domestic.change).toBe(50000)
    expect(report.comparison!.domestic.changePercent).toBeCloseTo(33.33, 1)
  })

  it('returns null changePercent when previous is zero', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3108', 50000)],
      previousGlLines: [],
    })

    expect(report.comparison!.euGoods.changePercent).toBeNull()
  })

  it('shows negative delta when revenue decreased', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3001', 80000)],
      previousGlLines: [creditLine('3001', 100000)],
    })

    expect(report.comparison!.domestic.change).toBe(-20000)
    expect(report.comparison!.domestic.changePercent).toBe(-20)
  })

  it('no comparison when previousGlLines not provided', () => {
    const report = generateVatMonitorReport(BASE_OPTIONS)
    expect(report.comparison).toBeNull()
  })

  it('includes netVat comparison', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('2611', 50000), debitLine('2641', 20000)],
      previousGlLines: [creditLine('2611', 40000), debitLine('2641', 25000)],
    })

    expect(report.comparison!.netVat.current).toBe(30000)
    expect(report.comparison!.netVat.previous).toBe(15000)
    expect(report.comparison!.netVat.change).toBe(15000)
  })
})

// ── Empty / edge case tests ─────────────────────────────────

describe('edge cases', () => {
  it('generates empty report with no GL data', () => {
    const report = generateVatMonitorReport(BASE_OPTIONS)

    expect(report.boxes).toHaveLength(1) // Only box 49 (net = 0)
    expect(report.revenueBreakdown.totalRevenue).toBe(0)
    expect(report.vatSummary.netVat).toBe(0)
    expect(report.warnings).toHaveLength(0)
  })

  it('ignores irrelevant accounts', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [
        creditLine('1510', 100000),  // accounts receivable — not relevant
        creditLine('3001', 50000),   // domestic revenue — relevant
      ],
    })

    expect(report.revenueBreakdown.totalRevenue).toBe(50000)
  })

  it('handles mixed debit/credit on same account', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [
        creditLine('3001', 100000),
        { account_number: '3001', debit_amount: 10000, credit_amount: 0 }, // credit note reversal
      ],
    })

    expect(report.revenueBreakdown.domestic.amount).toBe(90000)
  })

  it('rounds amounts to 2 decimal places', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [creditLine('3001', 33333.335)],
    })

    expect(report.revenueBreakdown.domestic.amount).toBe(33333.34)
  })

  it('boxes are sorted by box number', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      glLines: [
        creditLine('2641', 0), // We need debit line for 2641
        debitLine('2641', 10000),
        creditLine('2611', 25000),
        creditLine('3001', 100000),
        creditLine('3108', 50000),
      ],
    })

    const boxNumbers = report.boxes.map(b => b.boxNumber)
    const sorted = [...boxNumbers].sort()
    expect(boxNumbers).toEqual(sorted)
  })

  it('includes period info in report', () => {
    const report = generateVatMonitorReport({
      ...BASE_OPTIONS,
      year: 2026,
      month: 3,
      quarter: undefined,
    })

    expect(report.period.year).toBe(2026)
    expect(report.period.month).toBe(3)
  })
})
