/**
 * Multi-Currency Receivables Engine
 *
 * Pure-function engine that calculates foreign currency exposure from
 * open receivables, unrealized FX gains/losses vs. current Riksbanken
 * rates, and realized FX gains/losses from GL accounts 3960/7960.
 *
 * This extension is READ-ONLY — it does not create journal entries.
 * The revaluation preview is informational only.
 */

// ── Types ──────────────────────────────────────────────────────

/** Minimal invoice data needed by the engine */
export interface ReceivableInvoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  status: string
  currency: string
  total: number
  total_sek: number | null
  exchange_rate: number | null
  customer_id: string
}

/** Minimal customer data */
export interface ReceivableCustomer {
  id: string
  name: string
  country: string
}

/** GL line for realized FX */
export interface GLLine {
  account_number: string
  debit: number
  credit: number
  entry_date: string
}

/** Current exchange rate */
export interface ExchangeRateInfo {
  currency: string
  rate: number
  date: string
}

/** Engine options */
export interface ReceivablesOptions {
  /** Open (unpaid) foreign-currency invoices */
  invoices: ReceivableInvoice[]
  /** Customers for those invoices */
  customers: ReceivableCustomer[]
  /** Current exchange rates from Riksbanken */
  currentRates: ExchangeRateInfo[]
  /** GL lines on accounts 3960 and 7960 for the selected year */
  realizedFXLines: GLLine[]
  /** Reference date (for days outstanding calculation) */
  referenceDate: string
  /** Selected year for realized FX */
  year: number
}

// ── Output types ───────────────────────────────────────────────

export interface CurrencyExposure {
  currency: string
  totalForeignAmount: number
  bookedSekValue: number
  currentSekValue: number
  unrealizedGainLoss: number
  invoiceCount: number
  averageBookedRate: number
  currentRate: number
}

export interface ForeignReceivable {
  invoiceId: string
  invoiceNumber: string
  customerName: string
  customerCountry: string
  currency: string
  foreignAmount: number
  bookedSekAmount: number
  bookedRate: number
  currentSekAmount: number
  currentRate: number
  unrealizedGainLoss: number
  invoiceDate: string
  dueDate: string
  daysOutstanding: number
}

export interface MonthlyFXTrend {
  month: string // 'YYYY-MM'
  realizedGains: number
  realizedLosses: number
  netRealized: number
}

export interface RevalPreview {
  totalUnrealizedGainLoss: number
  gains: number   // Positive: amount for account 3969
  losses: number  // Positive: amount for account 7969
}

export interface ReceivablesReport {
  referenceDate: string
  exchangeRates: ExchangeRateInfo[]

  exposureByCurrency: CurrencyExposure[]
  receivables: ForeignReceivable[]

  realizedGainLoss: {
    year: number
    gains: number
    losses: number
    net: number
  }

  monthlyTrend: MonthlyFXTrend[]
  revalPreview: RevalPreview

  totals: {
    bookedSekValue: number
    currentSekValue: number
    totalUnrealizedGainLoss: number
    receivableCount: number
    currencyCount: number
  }
}

// ── Constants ──────────────────────────────────────────────────

const ACCOUNT_FX_GAINS = '3960'
const ACCOUNT_FX_LOSSES = '7960'

const OPEN_STATUSES = ['sent', 'overdue']

// ── Engine ─────────────────────────────────────────────────────

export function generateReceivablesReport(options: ReceivablesOptions): ReceivablesReport {
  const { invoices, customers, currentRates, realizedFXLines, referenceDate, year } = options

  const rateMap = new Map<string, ExchangeRateInfo>()
  for (const r of currentRates) {
    rateMap.set(r.currency.toUpperCase(), r)
  }

  const customerMap = new Map<string, ReceivableCustomer>()
  for (const c of customers) {
    customerMap.set(c.id, c)
  }

  // Filter to open foreign-currency invoices
  const foreignInvoices = invoices.filter(inv =>
    OPEN_STATUSES.includes(inv.status) &&
    inv.currency !== 'SEK' &&
    inv.total > 0
  )

  // Build receivable details
  const receivables: ForeignReceivable[] = []
  for (const inv of foreignInvoices) {
    const customer = customerMap.get(inv.customer_id)
    const rateInfo = rateMap.get(inv.currency.toUpperCase())
    const currentRate = rateInfo?.rate ?? 0

    const bookedSekAmount = getBookedSekAmount(inv)
    const bookedRate = inv.total > 0 ? bookedSekAmount / inv.total : 0
    const currentSekAmount = round2(inv.total * currentRate)
    const unrealizedGainLoss = round2(currentSekAmount - bookedSekAmount)
    const daysOutstanding = daysBetween(inv.invoice_date, referenceDate)

    receivables.push({
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      customerName: customer?.name ?? 'Okänd kund',
      customerCountry: customer?.country ?? '',
      currency: inv.currency,
      foreignAmount: inv.total,
      bookedSekAmount,
      bookedRate: round4(bookedRate),
      currentSekAmount,
      currentRate: round4(currentRate),
      unrealizedGainLoss,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      daysOutstanding,
    })
  }

  // Sort by unrealized gain/loss (largest absolute first)
  receivables.sort((a, b) => Math.abs(b.unrealizedGainLoss) - Math.abs(a.unrealizedGainLoss))

  // Aggregate by currency
  const exposureMap = new Map<string, {
    totalForeign: number
    bookedSek: number
    currentSek: number
    count: number
  }>()

  for (const r of receivables) {
    const existing = exposureMap.get(r.currency) || { totalForeign: 0, bookedSek: 0, currentSek: 0, count: 0 }
    existing.totalForeign += r.foreignAmount
    existing.bookedSek += r.bookedSekAmount
    existing.currentSek += r.currentSekAmount
    existing.count += 1
    exposureMap.set(r.currency, existing)
  }

  const exposureByCurrency: CurrencyExposure[] = []
  for (const [currency, agg] of exposureMap.entries()) {
    const rateInfo = rateMap.get(currency.toUpperCase())
    exposureByCurrency.push({
      currency,
      totalForeignAmount: round2(agg.totalForeign),
      bookedSekValue: round2(agg.bookedSek),
      currentSekValue: round2(agg.currentSek),
      unrealizedGainLoss: round2(agg.currentSek - agg.bookedSek),
      invoiceCount: agg.count,
      averageBookedRate: agg.totalForeign > 0 ? round4(agg.bookedSek / agg.totalForeign) : 0,
      currentRate: rateInfo?.rate ?? 0,
    })
  }

  // Sort exposures by absolute unrealized gain/loss descending
  exposureByCurrency.sort((a, b) => Math.abs(b.unrealizedGainLoss) - Math.abs(a.unrealizedGainLoss))

  // Calculate realized FX from GL
  const { gains, losses } = calculateRealizedFX(realizedFXLines)

  // Monthly trend
  const monthlyTrend = calculateMonthlyTrend(realizedFXLines, year)

  // Revaluation preview
  const totalBooked = receivables.reduce((sum, r) => sum + r.bookedSekAmount, 0)
  const totalCurrent = receivables.reduce((sum, r) => sum + r.currentSekAmount, 0)
  const totalUnrealized = round2(totalCurrent - totalBooked)

  const revalPreview: RevalPreview = {
    totalUnrealizedGainLoss: totalUnrealized,
    gains: round2(Math.max(0, totalUnrealized)),
    losses: round2(Math.abs(Math.min(0, totalUnrealized))),
  }

  const currencies = new Set(receivables.map(r => r.currency))

  return {
    referenceDate,
    exchangeRates: currentRates,
    exposureByCurrency,
    receivables,
    realizedGainLoss: {
      year,
      gains: round2(gains),
      losses: round2(losses),
      net: round2(gains - losses),
    },
    monthlyTrend,
    revalPreview,
    totals: {
      bookedSekValue: round2(totalBooked),
      currentSekValue: round2(totalCurrent),
      totalUnrealizedGainLoss: totalUnrealized,
      receivableCount: receivables.length,
      currencyCount: currencies.size,
    },
  }
}

// ── Helpers ────────────────────────────────────────────────────

function getBookedSekAmount(inv: ReceivableInvoice): number {
  // Prefer the explicitly stored SEK amount
  if (inv.total_sek !== null && inv.total_sek !== undefined) {
    return round2(inv.total_sek)
  }
  // Fallback: total × exchange_rate at invoice date
  if (inv.exchange_rate !== null && inv.exchange_rate !== undefined) {
    return round2(inv.total * inv.exchange_rate)
  }
  // No rate info — return 0 (will show as warning in UI)
  return 0
}

function calculateRealizedFX(lines: GLLine[]): { gains: number; losses: number } {
  let gains = 0
  let losses = 0

  for (const line of lines) {
    if (line.account_number === ACCOUNT_FX_GAINS) {
      // FX gains are booked as credits on 3960
      gains += line.credit - line.debit
    } else if (line.account_number === ACCOUNT_FX_LOSSES) {
      // FX losses are booked as debits on 7960
      losses += line.debit - line.credit
    }
  }

  return { gains: Math.max(0, gains), losses: Math.max(0, losses) }
}

function calculateMonthlyTrend(lines: GLLine[], year: number): MonthlyFXTrend[] {
  const monthData = new Map<string, { gains: number; losses: number }>()

  // Initialize all 12 months
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    monthData.set(key, { gains: 0, losses: 0 })
  }

  for (const line of lines) {
    const monthKey = line.entry_date.substring(0, 7) // 'YYYY-MM'
    const data = monthData.get(monthKey)
    if (!data) continue

    if (line.account_number === ACCOUNT_FX_GAINS) {
      data.gains += line.credit - line.debit
    } else if (line.account_number === ACCOUNT_FX_LOSSES) {
      data.losses += line.debit - line.credit
    }
  }

  const trend: MonthlyFXTrend[] = []
  for (const [month, data] of monthData.entries()) {
    const gains = Math.max(0, round2(data.gains))
    const losses = Math.max(0, round2(data.losses))
    trend.push({
      month,
      realizedGains: gains,
      realizedLosses: losses,
      netRealized: round2(gains - losses),
    })
  }

  // Sort chronologically
  trend.sort((a, b) => a.month.localeCompare(b.month))

  return trend
}

function daysBetween(dateStr: string, refDateStr: string): number {
  const d1 = new Date(dateStr)
  const d2 = new Date(refDateStr)
  const diffMs = d2.getTime() - d1.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
