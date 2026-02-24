import { describe, it, expect } from 'vitest'
import {
  generateReceivablesReport,
  type ReceivableInvoice,
  type ReceivableCustomer,
  type GLLine,
  type ExchangeRateInfo,
  type ReceivablesOptions,
} from '../receivables-engine'

// ── Fixtures ────────────────────────────────────────────────

function makeInvoice(overrides: Partial<ReceivableInvoice> = {}): ReceivableInvoice {
  return {
    id: 'inv-1',
    invoice_number: 'F2026-001',
    invoice_date: '2026-01-15',
    due_date: '2026-02-15',
    status: 'sent',
    currency: 'EUR',
    total: 10000,
    total_sek: 114200,
    exchange_rate: 11.42,
    customer_id: 'cust-1',
    ...overrides,
  }
}

function makeCustomer(overrides: Partial<ReceivableCustomer> = {}): ReceivableCustomer {
  return {
    id: 'cust-1',
    name: 'Müller GmbH',
    country: 'DE',
    ...overrides,
  }
}

function makeRate(overrides: Partial<ExchangeRateInfo> = {}): ExchangeRateInfo {
  return {
    currency: 'EUR',
    rate: 11.50,
    date: '2026-03-15',
    ...overrides,
  }
}

function makeGLLine(overrides: Partial<GLLine> = {}): GLLine {
  return {
    account_number: '3960',
    debit: 0,
    credit: 0,
    entry_date: '2026-01-31',
    ...overrides,
  }
}

const BASE_OPTIONS: ReceivablesOptions = {
  invoices: [],
  customers: [],
  currentRates: [makeRate()],
  realizedFXLines: [],
  referenceDate: '2026-03-15',
  year: 2026,
}

// ── Basic report tests ──────────────────────────────────────

describe('generateReceivablesReport', () => {
  it('generates empty report when no invoices', () => {
    const report = generateReceivablesReport(BASE_OPTIONS)

    expect(report.receivables).toHaveLength(0)
    expect(report.exposureByCurrency).toHaveLength(0)
    expect(report.totals.receivableCount).toBe(0)
    expect(report.totals.currencyCount).toBe(0)
    expect(report.totals.totalUnrealizedGainLoss).toBe(0)
    expect(report.referenceDate).toBe('2026-03-15')
  })

  it('calculates unrealized gain when rate increases', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({
        total: 10000,
        total_sek: 114200, // Booked at 11.42
        exchange_rate: 11.42,
      })],
      customers: [makeCustomer()],
      currentRates: [makeRate({ rate: 11.50 })], // Current rate higher
    })

    expect(report.receivables).toHaveLength(1)
    const r = report.receivables[0]
    expect(r.bookedSekAmount).toBe(114200)
    expect(r.currentSekAmount).toBe(115000) // 10000 × 11.50
    expect(r.unrealizedGainLoss).toBe(800) // 115000 - 114200
    expect(r.bookedRate).toBe(11.42)
    expect(r.currentRate).toBe(11.50)
  })

  it('calculates unrealized loss when rate decreases', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({
        total: 10000,
        total_sek: 114200,
        exchange_rate: 11.42,
      })],
      customers: [makeCustomer()],
      currentRates: [makeRate({ rate: 11.00 })], // Current rate lower
    })

    const r = report.receivables[0]
    expect(r.currentSekAmount).toBe(110000)
    expect(r.unrealizedGainLoss).toBe(-4200) // 110000 - 114200
  })

  it('aggregates exposure by currency', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', total: 5000, total_sek: 57100, exchange_rate: 11.42 }),
      makeInvoice({ id: 'inv-2', total: 3000, total_sek: 34260, exchange_rate: 11.42 }),
    ]

    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices,
      customers: [makeCustomer()],
      currentRates: [makeRate({ rate: 11.50 })],
    })

    expect(report.exposureByCurrency).toHaveLength(1)
    const exp = report.exposureByCurrency[0]
    expect(exp.currency).toBe('EUR')
    expect(exp.totalForeignAmount).toBe(8000)
    expect(exp.bookedSekValue).toBe(91360) // 57100 + 34260
    expect(exp.currentSekValue).toBe(92000) // 8000 × 11.50
    expect(exp.invoiceCount).toBe(2)
    expect(exp.averageBookedRate).toBe(11.42) // 91360 / 8000
    expect(exp.currentRate).toBe(11.50)
  })

  it('handles multiple currencies', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', currency: 'EUR', total: 5000, total_sek: 57100 }),
      makeInvoice({ id: 'inv-2', currency: 'USD', total: 8000, total_sek: 84000, customer_id: 'cust-2' }),
    ]
    const customers = [
      makeCustomer({ id: 'cust-1' }),
      makeCustomer({ id: 'cust-2', name: 'Smith Inc', country: 'US' }),
    ]
    const rates = [
      makeRate({ currency: 'EUR', rate: 11.50 }),
      makeRate({ currency: 'USD', rate: 10.60 }),
    ]

    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices,
      customers,
      currentRates: rates,
    })

    expect(report.exposureByCurrency).toHaveLength(2)
    expect(report.totals.currencyCount).toBe(2)
    expect(report.totals.receivableCount).toBe(2)

    const eurExp = report.exposureByCurrency.find(e => e.currency === 'EUR')!
    const usdExp = report.exposureByCurrency.find(e => e.currency === 'USD')!
    expect(eurExp.currentSekValue).toBe(57500) // 5000 × 11.50
    expect(usdExp.currentSekValue).toBe(84800) // 8000 × 10.60
  })

  // ── Filtering ─────────────────────────────────────────────

  it('excludes paid invoices', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ status: 'paid' })],
      customers: [makeCustomer()],
    })

    expect(report.receivables).toHaveLength(0)
  })

  it('excludes SEK invoices', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ currency: 'SEK', total: 10000, total_sek: 10000 })],
      customers: [makeCustomer()],
    })

    expect(report.receivables).toHaveLength(0)
  })

  it('excludes zero-amount invoices', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ total: 0 })],
      customers: [makeCustomer()],
    })

    expect(report.receivables).toHaveLength(0)
  })

  it('includes overdue invoices', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ status: 'overdue' })],
      customers: [makeCustomer()],
    })

    expect(report.receivables).toHaveLength(1)
  })

  // ── Booked value fallback ─────────────────────────────────

  it('falls back to total × exchange_rate when total_sek is null', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ total: 5000, total_sek: null, exchange_rate: 11.42 })],
      customers: [makeCustomer()],
      currentRates: [makeRate({ rate: 11.50 })],
    })

    const r = report.receivables[0]
    expect(r.bookedSekAmount).toBe(57100) // 5000 × 11.42
    expect(r.currentSekAmount).toBe(57500) // 5000 × 11.50
    expect(r.unrealizedGainLoss).toBe(400)
  })

  it('uses 0 booked value when no exchange rate info', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ total: 5000, total_sek: null, exchange_rate: null })],
      customers: [makeCustomer()],
      currentRates: [makeRate({ rate: 11.50 })],
    })

    const r = report.receivables[0]
    expect(r.bookedSekAmount).toBe(0)
    expect(r.currentSekAmount).toBe(57500)
  })

  // ── Days outstanding ──────────────────────────────────────

  it('calculates days outstanding correctly', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ invoice_date: '2026-03-01' })],
      customers: [makeCustomer()],
      referenceDate: '2026-03-15',
    })

    expect(report.receivables[0].daysOutstanding).toBe(14)
  })

  // ── Realized FX from GL ───────────────────────────────────

  it('calculates realized FX gains from account 3960 credits', () => {
    const lines: GLLine[] = [
      makeGLLine({ account_number: '3960', credit: 5000, debit: 0, entry_date: '2026-01-31' }),
      makeGLLine({ account_number: '3960', credit: 3000, debit: 0, entry_date: '2026-02-28' }),
    ]

    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      realizedFXLines: lines,
    })

    expect(report.realizedGainLoss.gains).toBe(8000)
    expect(report.realizedGainLoss.losses).toBe(0)
    expect(report.realizedGainLoss.net).toBe(8000)
  })

  it('calculates realized FX losses from account 7960 debits', () => {
    const lines: GLLine[] = [
      makeGLLine({ account_number: '7960', debit: 3200, credit: 0, entry_date: '2026-01-31' }),
      makeGLLine({ account_number: '7960', debit: 1800, credit: 0, entry_date: '2026-02-28' }),
    ]

    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      realizedFXLines: lines,
    })

    expect(report.realizedGainLoss.gains).toBe(0)
    expect(report.realizedGainLoss.losses).toBe(5000)
    expect(report.realizedGainLoss.net).toBe(-5000)
  })

  it('calculates net realized FX with both gains and losses', () => {
    const lines: GLLine[] = [
      makeGLLine({ account_number: '3960', credit: 8500, debit: 0, entry_date: '2026-01-31' }),
      makeGLLine({ account_number: '7960', debit: 3200, credit: 0, entry_date: '2026-01-31' }),
    ]

    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      realizedFXLines: lines,
    })

    expect(report.realizedGainLoss.gains).toBe(8500)
    expect(report.realizedGainLoss.losses).toBe(3200)
    expect(report.realizedGainLoss.net).toBe(5300)
  })

  // ── Monthly trend ─────────────────────────────────────────

  it('generates monthly trend with all 12 months', () => {
    const report = generateReceivablesReport(BASE_OPTIONS)

    expect(report.monthlyTrend).toHaveLength(12)
    expect(report.monthlyTrend[0].month).toBe('2026-01')
    expect(report.monthlyTrend[11].month).toBe('2026-12')
  })

  it('distributes realized FX to correct months', () => {
    const lines: GLLine[] = [
      makeGLLine({ account_number: '3960', credit: 5000, entry_date: '2026-01-15' }),
      makeGLLine({ account_number: '7960', debit: 2000, entry_date: '2026-01-20' }),
      makeGLLine({ account_number: '3960', credit: 8000, entry_date: '2026-03-10' }),
    ]

    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      realizedFXLines: lines,
    })

    const jan = report.monthlyTrend.find(t => t.month === '2026-01')!
    expect(jan.realizedGains).toBe(5000)
    expect(jan.realizedLosses).toBe(2000)
    expect(jan.netRealized).toBe(3000)

    const feb = report.monthlyTrend.find(t => t.month === '2026-02')!
    expect(feb.realizedGains).toBe(0)
    expect(feb.realizedLosses).toBe(0)
    expect(feb.netRealized).toBe(0)

    const mar = report.monthlyTrend.find(t => t.month === '2026-03')!
    expect(mar.realizedGains).toBe(8000)
    expect(mar.realizedLosses).toBe(0)
    expect(mar.netRealized).toBe(8000)
  })

  // ── Revaluation preview ───────────────────────────────────

  it('shows revaluation preview with net gain', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ total: 10000, total_sek: 114200 })],
      customers: [makeCustomer()],
      currentRates: [makeRate({ rate: 11.50 })],
    })

    expect(report.revalPreview.totalUnrealizedGainLoss).toBe(800)
    expect(report.revalPreview.gains).toBe(800)
    expect(report.revalPreview.losses).toBe(0)
  })

  it('shows revaluation preview with net loss', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ total: 10000, total_sek: 114200 })],
      customers: [makeCustomer()],
      currentRates: [makeRate({ rate: 11.00 })],
    })

    expect(report.revalPreview.totalUnrealizedGainLoss).toBe(-4200)
    expect(report.revalPreview.gains).toBe(0)
    expect(report.revalPreview.losses).toBe(4200)
  })

  // ── Customer data ─────────────────────────────────────────

  it('uses customer name and country from customer lookup', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice()],
      customers: [makeCustomer({ name: 'Acme Corp', country: 'FI' })],
    })

    expect(report.receivables[0].customerName).toBe('Acme Corp')
    expect(report.receivables[0].customerCountry).toBe('FI')
  })

  it('falls back to unknown customer when not found', () => {
    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices: [makeInvoice({ customer_id: 'unknown' })],
      customers: [makeCustomer()], // cust-1, not 'unknown'
    })

    expect(report.receivables[0].customerName).toBe('Okänd kund')
  })

  // ── Totals ────────────────────────────────────────────────

  it('calculates correct totals across all receivables', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', currency: 'EUR', total: 5000, total_sek: 57100 }),
      makeInvoice({ id: 'inv-2', currency: 'USD', total: 3000, total_sek: 31500, customer_id: 'cust-2' }),
    ]
    const customers = [
      makeCustomer({ id: 'cust-1' }),
      makeCustomer({ id: 'cust-2', name: 'Smith Inc', country: 'US' }),
    ]
    const rates = [
      makeRate({ currency: 'EUR', rate: 11.50 }),
      makeRate({ currency: 'USD', rate: 10.60 }),
    ]

    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices,
      customers,
      currentRates: rates,
    })

    // EUR: 5000 × 11.50 = 57500, USD: 3000 × 10.60 = 31800
    expect(report.totals.bookedSekValue).toBe(88600) // 57100 + 31500
    expect(report.totals.currentSekValue).toBe(89300) // 57500 + 31800
    expect(report.totals.totalUnrealizedGainLoss).toBe(700) // 89300 - 88600
    expect(report.totals.receivableCount).toBe(2)
    expect(report.totals.currencyCount).toBe(2)
  })

  // ── Period info ───────────────────────────────────────────

  it('includes year and exchange rate info', () => {
    const rates = [
      makeRate({ currency: 'EUR', rate: 11.50 }),
      makeRate({ currency: 'USD', rate: 10.60 }),
    ]

    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      currentRates: rates,
    })

    expect(report.realizedGainLoss.year).toBe(2026)
    expect(report.exchangeRates).toHaveLength(2)
    expect(report.exchangeRates.find(r => r.currency === 'EUR')?.rate).toBe(11.50)
  })

  // ── Sorting ───────────────────────────────────────────────

  it('sorts receivables by absolute unrealized gain/loss descending', () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', total: 1000, total_sek: 11420 }), // gain: 80
      makeInvoice({ id: 'inv-2', total: 5000, total_sek: 57100, customer_id: 'cust-1' }), // gain: 400
      makeInvoice({ id: 'inv-3', total: 2000, total_sek: 22840, customer_id: 'cust-1' }), // gain: 160
    ]

    const report = generateReceivablesReport({
      ...BASE_OPTIONS,
      invoices,
      customers: [makeCustomer()],
      currentRates: [makeRate({ rate: 11.50 })],
    })

    expect(report.receivables[0].foreignAmount).toBe(5000) // largest gain
    expect(report.receivables[1].foreignAmount).toBe(2000)
    expect(report.receivables[2].foreignAmount).toBe(1000) // smallest gain
  })
})
