import { describe, it, expect } from 'vitest'
import {
  generateECSalesListReport,
  getMonthPeriod,
  getQuarterPeriod,
  getFilingDeadline,
  daysUntilDeadline,
  type ECSalesListInvoice,
  type ECSalesListCustomer,
  type GLAccountTotal,
} from '../eu-sales-list-engine'

// ── Test fixtures ─────────────────────────────────────────────

function makeInvoice(overrides: Partial<ECSalesListInvoice> = {}): ECSalesListInvoice {
  return {
    id: 'inv-1',
    invoice_number: 'F2026-001',
    invoice_date: '2026-01-15',
    status: 'sent',
    currency: 'EUR',
    total: 10000,
    total_sek: 112000,
    subtotal: 10000,
    subtotal_sek: 112000,
    vat_treatment: 'reverse_charge',
    moms_ruta: '35',
    document_type: 'invoice',
    credited_invoice_id: null,
    customer_id: 'cust-1',
    ...overrides,
  }
}

function makeCustomer(overrides: Partial<ECSalesListCustomer> = {}): ECSalesListCustomer {
  return {
    id: 'cust-1',
    name: 'Acme GmbH',
    country: 'DE',
    customer_type: 'eu_business',
    vat_number: 'DE123456789',
    vat_number_validated: true,
    ...overrides,
  }
}

const BASE_OPTIONS = {
  reporterVatNumber: 'SE556677889901',
  reporterName: 'Test AB',
  year: 2026,
  month: 1 as number | undefined,
  quarter: undefined as number | undefined,
}

// ── Report generation tests ───────────────────────────────────

describe('generateECSalesListReport', () => {
  it('generates empty report when no invoices', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [],
      customers: [],
    })

    expect(report.lines).toHaveLength(0)
    expect(report.totals.goods).toBe(0)
    expect(report.totals.services).toBe(0)
    expect(report.totals.total).toBe(0)
    expect(report.invoiceCount).toBe(0)
    expect(report.customerCount).toBe(0)
    expect(report.warnings).toHaveLength(0)
  })

  it('aggregates goods invoice correctly (moms_ruta 35)', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ moms_ruta: '35', subtotal_sek: 50000 })],
      customers: [makeCustomer()],
    })

    expect(report.lines).toHaveLength(1)
    expect(report.lines[0].goodsAmount).toBe(50000)
    expect(report.lines[0].servicesAmount).toBe(0)
    expect(report.totals.goods).toBe(50000)
    expect(report.invoiceCount).toBe(1)
  })

  it('aggregates service invoice correctly (moms_ruta 39)', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ moms_ruta: '39', subtotal_sek: 30000 })],
      customers: [makeCustomer()],
    })

    expect(report.lines[0].servicesAmount).toBe(30000)
    expect(report.lines[0].goodsAmount).toBe(0)
    expect(report.totals.services).toBe(30000)
  })

  it('aggregates triangulation invoice correctly (moms_ruta 38)', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ moms_ruta: '38', subtotal_sek: 20000 })],
      customers: [makeCustomer()],
    })

    expect(report.lines[0].triangulationAmount).toBe(20000)
    expect(report.totals.triangulation).toBe(20000)
  })

  it('defaults to services when moms_ruta is null', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ moms_ruta: null, subtotal_sek: 15000 })],
      customers: [makeCustomer()],
    })

    expect(report.lines[0].servicesAmount).toBe(15000)
    expect(report.lines[0].goodsAmount).toBe(0)
  })

  it('groups multiple invoices by customer VAT number', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', subtotal_sek: 10000, moms_ruta: '35' }),
      makeInvoice({ id: 'inv-2', subtotal_sek: 20000, moms_ruta: '35' }),
      makeInvoice({ id: 'inv-3', subtotal_sek: 5000, moms_ruta: '39' }),
    ]

    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices,
      customers: [makeCustomer()],
    })

    expect(report.lines).toHaveLength(1)
    expect(report.lines[0].goodsAmount).toBe(30000)
    expect(report.lines[0].servicesAmount).toBe(5000)
    expect(report.lines[0].invoiceCount).toBe(3)
  })

  it('separates different customers into different lines', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', customer_id: 'cust-1', subtotal_sek: 10000 }),
      makeInvoice({ id: 'inv-2', customer_id: 'cust-2', subtotal_sek: 20000 }),
    ]
    const customers = [
      makeCustomer({ id: 'cust-1', vat_number: 'DE111111111', country: 'DE' }),
      makeCustomer({ id: 'cust-2', vat_number: 'FR222222222', country: 'FR', name: 'Fromage SARL' }),
    ]

    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices,
      customers,
    })

    expect(report.lines).toHaveLength(2)
    expect(report.customerCount).toBe(2)
    // Sorted by country, so DE comes before FR
    expect(report.lines[0].customerCountry).toBe('DE')
    expect(report.lines[1].customerCountry).toBe('FR')
  })

  it('handles credit notes (subtracts from customer total)', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', subtotal_sek: 50000, moms_ruta: '35' }),
      makeInvoice({
        id: 'inv-2',
        subtotal_sek: 10000,
        moms_ruta: '35',
        credited_invoice_id: 'inv-1',
      }),
    ]

    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices,
      customers: [makeCustomer()],
    })

    expect(report.lines[0].goodsAmount).toBe(40000) // 50000 - 10000
    expect(report.invoiceCount).toBe(2)
  })

  it('uses subtotal (not total) for amounts', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ subtotal_sek: 80000, total_sek: 100000, moms_ruta: '35' })],
      customers: [makeCustomer()],
    })

    expect(report.lines[0].goodsAmount).toBe(80000)
  })

  it('falls back to subtotal when subtotal_sek is null (SEK invoices)', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ subtotal_sek: null, subtotal: 45000, moms_ruta: '35' })],
      customers: [makeCustomer()],
    })

    expect(report.lines[0].goodsAmount).toBe(45000)
  })

  // ── Filtering tests ──────────────────────────────────────

  it('excludes draft invoices', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ status: 'draft' })],
      customers: [makeCustomer()],
    })

    expect(report.lines).toHaveLength(0)
    expect(report.invoiceCount).toBe(0)
  })

  it('excludes non-reverse-charge invoices', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ vat_treatment: 'standard_25' })],
      customers: [makeCustomer()],
    })

    expect(report.lines).toHaveLength(0)
  })

  it('includes paid and overdue invoices', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', status: 'paid', subtotal_sek: 10000 }),
      makeInvoice({ id: 'inv-2', status: 'overdue', subtotal_sek: 20000 }),
    ]

    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices,
      customers: [makeCustomer()],
    })

    expect(report.invoiceCount).toBe(2)
  })

  it('excludes proforma documents without credit note link', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ document_type: 'proforma', credited_invoice_id: null })],
      customers: [makeCustomer()],
    })

    expect(report.lines).toHaveLength(0)
  })

  it('includes credit notes even with non-invoice document type', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({
        document_type: 'credit_note',
        credited_invoice_id: 'inv-original',
        subtotal_sek: 5000,
        moms_ruta: '35',
      })],
      customers: [makeCustomer()],
    })

    // Credit note creates a line with negative amount
    expect(report.lines).toHaveLength(1)
    expect(report.lines[0].goodsAmount).toBe(-5000)
  })

  // ── Warning tests ────────────────────────────────────────

  it('warns on missing VAT number (error severity)', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      customers: [makeCustomer({ vat_number: null })],
    })

    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0].type).toBe('missing_vat_number')
    expect(report.warnings[0].severity).toBe('error')
    // Invoice is excluded from lines when VAT number missing
    expect(report.lines).toHaveLength(0)
  })

  it('warns on unvalidated VAT number (warning severity)', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      customers: [makeCustomer({ vat_number_validated: false })],
    })

    const unvalidatedWarnings = report.warnings.filter(w => w.type === 'unvalidated_vat_number')
    expect(unvalidatedWarnings).toHaveLength(1)
    expect(unvalidatedWarnings[0].severity).toBe('warning')
    // Invoice is still included in report
    expect(report.lines).toHaveLength(1)
  })

  it('warns on non-EU country', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      customers: [makeCustomer({ country: 'US' })],
    })

    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0].type).toBe('non_eu_country')
    expect(report.lines).toHaveLength(0)
  })

  it('excludes Sweden (SE) as non-intra-community', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      customers: [makeCustomer({ country: 'SE' })],
    })

    expect(report.warnings).toHaveLength(1)
    expect(report.warnings[0].type).toBe('non_eu_country')
    expect(report.lines).toHaveLength(0)
  })

  // ── Cross-check tests ────────────────────────────────────

  it('cross-check passes when GL matches report totals', () => {
    const glTotals: GLAccountTotal[] = [
      { account_number: '3108', credit: 50000 },
      { account_number: '3308', credit: 30000 },
    ]

    const invoices = [
      makeInvoice({ id: 'inv-1', subtotal_sek: 50000, moms_ruta: '35' }),
      makeInvoice({ id: 'inv-2', subtotal_sek: 30000, moms_ruta: '39' }),
    ]

    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices,
      customers: [makeCustomer()],
      glTotals,
    })

    expect(report.crossCheck).not.toBeNull()
    expect(report.crossCheck!.box35Match).toBe(true)
    expect(report.crossCheck!.box39Match).toBe(true)
  })

  it('cross-check fails when GL does not match', () => {
    const glTotals: GLAccountTotal[] = [
      { account_number: '3108', credit: 99999 },
      { account_number: '3308', credit: 30000 },
    ]

    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ subtotal_sek: 50000, moms_ruta: '35' })],
      customers: [makeCustomer()],
      glTotals,
    })

    expect(report.crossCheck!.box35Match).toBe(false)
    const mismatchWarnings = report.warnings.filter(w => w.type === 'cross_check_mismatch')
    expect(mismatchWarnings.length).toBeGreaterThan(0)
  })

  it('cross-check allows 1 SEK rounding tolerance', () => {
    const glTotals: GLAccountTotal[] = [
      { account_number: '3108', credit: 50000.50 },
    ]

    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ subtotal_sek: 50000, moms_ruta: '35' })],
      customers: [makeCustomer()],
      glTotals,
    })

    expect(report.crossCheck!.box35Match).toBe(true)
  })

  it('cross-check sums multiple accounts for box 35 (3108 + 3521)', () => {
    const glTotals: GLAccountTotal[] = [
      { account_number: '3108', credit: 40000 },
      { account_number: '3521', credit: 10000 },
    ]

    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ subtotal_sek: 50000, moms_ruta: '35' })],
      customers: [makeCustomer()],
      glTotals,
    })

    expect(report.crossCheck!.box35Match).toBe(true)
    expect(report.crossCheck!.box35GLTotal).toBe(50000)
  })

  it('skips cross-check when no GL data provided', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      customers: [makeCustomer()],
    })

    expect(report.crossCheck).toBeNull()
  })

  // ── Period and metadata tests ────────────────────────────

  it('sets filingType to monthly when month is provided', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [],
      customers: [],
      month: 3,
      quarter: undefined,
    })

    expect(report.filingType).toBe('monthly')
    expect(report.period.month).toBe(3)
  })

  it('sets filingType to quarterly when quarter is provided', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [],
      customers: [],
      month: undefined,
      quarter: 2,
    })

    expect(report.filingType).toBe('quarterly')
    expect(report.period.quarter).toBe(2)
  })

  it('includes reporter info in report', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [],
      customers: [],
    })

    expect(report.reporterVatNumber).toBe('SE556677889901')
    expect(report.reporterName).toBe('Test AB')
  })

  // ── Monetary precision tests ─────────────────────────────

  it('rounds amounts to 2 decimal places', () => {
    const report = generateECSalesListReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ subtotal_sek: 33333.335, moms_ruta: '35' })],
      customers: [makeCustomer()],
    })

    expect(report.lines[0].goodsAmount).toBe(33333.34)
  })
})

// ── Period helper tests ───────────────────────────────────────

describe('getMonthPeriod', () => {
  it('returns correct start and end for January', () => {
    const { start, end } = getMonthPeriod(2026, 1)
    expect(start).toBe('2026-01-01')
    expect(end).toBe('2026-01-31')
  })

  it('handles February in a non-leap year', () => {
    const { start, end } = getMonthPeriod(2027, 2)
    expect(start).toBe('2027-02-01')
    expect(end).toBe('2027-02-28')
  })

  it('handles February in a leap year', () => {
    const { start, end } = getMonthPeriod(2028, 2)
    expect(start).toBe('2028-02-01')
    expect(end).toBe('2028-02-29')
  })

  it('returns correct dates for December', () => {
    const { start, end } = getMonthPeriod(2026, 12)
    expect(start).toBe('2026-12-01')
    expect(end).toBe('2026-12-31')
  })
})

describe('getQuarterPeriod', () => {
  it('returns Q1 dates', () => {
    const { start, end } = getQuarterPeriod(2026, 1)
    expect(start).toBe('2026-01-01')
    expect(end).toBe('2026-03-31')
  })

  it('returns Q2 dates', () => {
    const { start, end } = getQuarterPeriod(2026, 2)
    expect(start).toBe('2026-04-01')
    expect(end).toBe('2026-06-30')
  })

  it('returns Q3 dates', () => {
    const { start, end } = getQuarterPeriod(2026, 3)
    expect(start).toBe('2026-07-01')
    expect(end).toBe('2026-09-30')
  })

  it('returns Q4 dates', () => {
    const { start, end } = getQuarterPeriod(2026, 4)
    expect(start).toBe('2026-10-01')
    expect(end).toBe('2026-12-31')
  })
})

describe('getFilingDeadline', () => {
  it('returns 25th of following month for monthly', () => {
    expect(getFilingDeadline(2026, 1)).toBe('2026-02-25')
    expect(getFilingDeadline(2026, 6)).toBe('2026-07-25')
  })

  it('rolls over to next year for December', () => {
    expect(getFilingDeadline(2026, 12)).toBe('2027-01-25')
  })

  it('returns correct deadline for quarterly', () => {
    expect(getFilingDeadline(2026, undefined, 1)).toBe('2026-04-25')
    expect(getFilingDeadline(2026, undefined, 2)).toBe('2026-07-25')
    expect(getFilingDeadline(2026, undefined, 3)).toBe('2026-10-25')
  })

  it('rolls over to next year for Q4', () => {
    expect(getFilingDeadline(2026, undefined, 4)).toBe('2027-01-25')
  })

  it('throws when neither month nor quarter provided', () => {
    expect(() => getFilingDeadline(2026)).toThrow()
  })
})

describe('daysUntilDeadline', () => {
  it('returns positive number for future deadlines', () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    const dateStr = future.toISOString().slice(0, 10)
    expect(daysUntilDeadline(dateStr)).toBe(10)
  })

  it('returns 0 for today', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(daysUntilDeadline(today)).toBe(0)
  })

  it('returns negative number for past deadlines', () => {
    const past = new Date()
    past.setDate(past.getDate() - 5)
    const dateStr = past.toISOString().slice(0, 10)
    expect(daysUntilDeadline(dateStr)).toBe(-5)
  })
})
