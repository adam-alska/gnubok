import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CashFlowForecastDay,
  CashFlowItem,
  KPISnapshot,
  FinancialHealthScore,
  HealthFactor,
  MonthlyTrendPoint,
} from '@/types/financial-insights'

// ============================================================
// Cash Flow Forecasting
// ============================================================

/**
 * Generate a cash flow forecast for the next N days.
 * Starts from current bank balance and projects forward using:
 * - Outstanding customer invoices (by due date)
 * - Outstanding supplier invoices
 * - Recurring salary payments
 * - Tax obligations (F-skatt, moms)
 * - Historical income/expense patterns
 */
export async function generateCashFlowForecast(
  userId: string,
  days: number = 90,
  supabase: SupabaseClient
): Promise<CashFlowForecastDay[]> {
  const today = new Date()
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + days)

  // 1. Get current bank balance
  const { data: bankConnections } = await supabase
    .from('bank_connections')
    .select('accounts, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)

  let currentBalance = 0
  if (bankConnections && bankConnections.length > 0) {
    const accounts = bankConnections[0].accounts as { balance: number }[] | null
    if (accounts && accounts.length > 0) {
      currentBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0)
    }
  }

  // 2. Get outstanding customer invoices (expected income)
  const { data: outstandingInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, total_sek, due_date, status, customer:customers(name)')
    .eq('user_id', userId)
    .in('status', ['sent', 'overdue'])
    .gte('due_date', today.toISOString().split('T')[0])
    .lte('due_date', endDate.toISOString().split('T')[0])
    .order('due_date', { ascending: true })

  // 3. Get outstanding supplier invoices (expected expenses)
  const { data: supplierInvoices } = await supabase
    .from('supplier_invoices')
    .select('id, total_amount, due_date, status, supplier:suppliers(name)')
    .eq('user_id', userId)
    .in('status', ['received', 'attested'])
    .gte('due_date', today.toISOString().split('T')[0])
    .lte('due_date', endDate.toISOString().split('T')[0])
    .order('due_date', { ascending: true })

  // 4. Get company settings for tax info
  const { data: settings } = await supabase
    .from('company_settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  // 5. Get salary payments for next period
  const { data: salaryPayments } = await supabase
    .from('salary_payments')
    .select('gross_amount, employer_tax, payment_date, status')
    .eq('user_id', userId)
    .eq('status', 'planned')
    .gte('payment_date', today.toISOString().split('T')[0])
    .lte('payment_date', endDate.toISOString().split('T')[0])

  // 6. Get historical monthly averages for estimated recurring items
  const sixMonthsAgo = new Date(today)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data: historicalTransactions } = await supabase
    .from('transactions')
    .select('amount, amount_sek, date, category, is_business')
    .eq('user_id', userId)
    .eq('is_business', true)
    .gte('date', sixMonthsAgo.toISOString().split('T')[0])

  // Calculate average monthly income and expense
  const monthlyAverages = calculateMonthlyAverages(historicalTransactions || [])

  // Build daily forecast
  const forecast: CashFlowForecastDay[] = []
  let runningBalance = currentBalance

  for (let d = 0; d < days; d++) {
    const forecastDate = new Date(today)
    forecastDate.setDate(forecastDate.getDate() + d)
    const dateStr = forecastDate.toISOString().split('T')[0]
    const dayOfMonth = forecastDate.getDate()
    const month = forecastDate.getMonth()

    const items: CashFlowItem[] = []
    let dayIncome = 0
    let dayExpenses = 0

    // Customer invoices due this day
    const invoicesDueToday = (outstandingInvoices || []).filter(
      (inv) => inv.due_date === dateStr
    )
    for (const inv of invoicesDueToday) {
      const amount = Number(inv.total_sek || inv.total)
      const customer = inv.customer as unknown as { name: string } | null
      const customerName = customer?.name || 'Kund'
      items.push({
        type: 'invoice_due',
        description: `Faktura ${inv.invoice_number} - ${customerName}`,
        amount,
        confidence: inv.status === 'overdue' ? 0.5 : 0.8,
      })
      dayIncome += amount
    }

    // Supplier invoices due this day
    const supplierDueToday = (supplierInvoices || []).filter(
      (inv) => inv.due_date === dateStr
    )
    for (const inv of supplierDueToday) {
      const amount = Number(inv.total_amount)
      const supplier = inv.supplier as unknown as { name: string } | null
      const supplierName = supplier?.name || 'Leverantor'
      items.push({
        type: 'supplier_invoice',
        description: `Leverantorsfaktura - ${supplierName}`,
        amount: -amount,
        confidence: 0.9,
      })
      dayExpenses += amount
    }

    // Salary payments
    const salariesToday = (salaryPayments || []).filter(
      (sp) => sp.payment_date === dateStr
    )
    for (const salary of salariesToday) {
      const totalCost = Number(salary.gross_amount) + Number(salary.employer_tax)
      items.push({
        type: 'salary',
        description: 'Loneutbetalning + arbetsgivaravgifter',
        amount: -totalCost,
        confidence: 0.95,
      })
      dayExpenses += totalCost
    }

    // F-skatt on the 12th of each month (or next business day)
    if (dayOfMonth === 12 && settings?.preliminary_tax_monthly) {
      const fSkattAmount = Number(settings.preliminary_tax_monthly)
      items.push({
        type: 'tax',
        description: 'F-skatt (preliminar skatt)',
        amount: -fSkattAmount,
        confidence: 0.95,
      })
      dayExpenses += fSkattAmount
    }

    // Moms on the 12th of designated months
    if (dayOfMonth === 12 && settings?.vat_registered) {
      const momsPeriod = settings.moms_period
      const isMonthlyMoms = momsPeriod === 'monthly'
      const isQuarterlyMoms = momsPeriod === 'quarterly' && [1, 4, 7, 10].includes(month + 1)

      if (isMonthlyMoms || isQuarterlyMoms) {
        // Estimate moms as ~15% of average monthly revenue (simplified)
        const estimatedMoms = Math.round(monthlyAverages.avgMonthlyIncome * 0.15)
        if (estimatedMoms > 0) {
          items.push({
            type: 'tax',
            description: 'Momsbetalning (uppskattad)',
            amount: -estimatedMoms,
            confidence: 0.6,
          })
          dayExpenses += estimatedMoms
        }
      }
    }

    // Estimated daily recurring expenses (spread monthly averages)
    if (d > 7) {
      // Only add estimates for dates beyond first week (where we have less concrete data)
      const dailyEstExpense = monthlyAverages.avgMonthlyExpenses / 30
      const dailyEstIncome = monthlyAverages.avgMonthlyIncome / 30

      // Add small daily estimates if no concrete items
      if (dayIncome === 0 && dailyEstIncome > 0) {
        const estimatedDailyIncome = Math.round(dailyEstIncome * 0.3) // Conservative
        if (estimatedDailyIncome > 100) {
          items.push({
            type: 'estimated',
            description: 'Uppskattade intakter (historiskt genomsnitt)',
            amount: estimatedDailyIncome,
            confidence: 0.3,
          })
          dayIncome += estimatedDailyIncome
        }
      }

      if (dayExpenses === 0 && dailyEstExpense > 0) {
        const estimatedDailyExpense = Math.round(dailyEstExpense * 0.3)
        if (estimatedDailyExpense > 100) {
          items.push({
            type: 'estimated',
            description: 'Uppskattade kostnader (historiskt genomsnitt)',
            amount: -estimatedDailyExpense,
            confidence: 0.3,
          })
          dayExpenses += estimatedDailyExpense
        }
      }
    }

    runningBalance = runningBalance + dayIncome - dayExpenses

    forecast.push({
      date: dateStr,
      income: Math.round(dayIncome),
      expenses: Math.round(dayExpenses),
      balance: Math.round(runningBalance),
      items,
    })
  }

  return forecast
}

function calculateMonthlyAverages(transactions: Array<{ amount: number; amount_sek: number | null; date: string }>) {
  if (transactions.length === 0) {
    return { avgMonthlyIncome: 0, avgMonthlyExpenses: 0 }
  }

  const monthlyData = new Map<string, { income: number; expenses: number }>()

  for (const tx of transactions) {
    const monthKey = tx.date.substring(0, 7) // YYYY-MM
    const existing = monthlyData.get(monthKey) || { income: 0, expenses: 0 }
    const amount = Number(tx.amount_sek || tx.amount)

    if (amount > 0) {
      existing.income += amount
    } else {
      existing.expenses += Math.abs(amount)
    }

    monthlyData.set(monthKey, existing)
  }

  const months = Array.from(monthlyData.values())
  const numMonths = Math.max(months.length, 1)

  return {
    avgMonthlyIncome: Math.round(months.reduce((s, m) => s + m.income, 0) / numMonths),
    avgMonthlyExpenses: Math.round(months.reduce((s, m) => s + m.expenses, 0) / numMonths),
  }
}

// ============================================================
// KPI Calculation
// ============================================================

/**
 * Calculate current KPIs based on transaction data, invoices, and bank balances.
 */
export async function calculateKPIs(
  userId: string,
  asOfDate: Date,
  supabase: SupabaseClient
): Promise<KPISnapshot> {
  const year = asOfDate.getFullYear()
  const startOfYear = `${year}-01-01`
  const endDate = asOfDate.toISOString().split('T')[0]

  // Revenue and expenses from transactions (YTD)
  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, amount_sek, date, category, is_business')
    .eq('user_id', userId)
    .eq('is_business', true)
    .gte('date', startOfYear)
    .lte('date', endDate)

  let revenue = 0
  let expenses = 0
  let costOfGoodsSold = 0

  for (const tx of transactions || []) {
    const amount = Number(tx.amount_sek || tx.amount)
    if (amount > 0) {
      revenue += amount
    } else {
      expenses += Math.abs(amount)
      // Identify COGS-like categories
      if (['expense_equipment', 'expense_other'].includes(tx.category)) {
        costOfGoodsSold += Math.abs(amount)
      }
    }
  }

  const netIncome = revenue - expenses
  const grossMarginPct = revenue > 0 ? ((revenue - costOfGoodsSold) / revenue) * 100 : 0
  const operatingMarginPct = revenue > 0 ? (netIncome / revenue) * 100 : 0

  // Accounts receivable (unpaid invoices)
  const { data: unpaidInvoices } = await supabase
    .from('invoices')
    .select('total, total_sek, invoice_date')
    .eq('user_id', userId)
    .in('status', ['sent', 'overdue'])

  const accountsReceivable = (unpaidInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.total_sek || inv.total),
    0
  )

  // Accounts payable (unpaid supplier invoices)
  const { data: unpaidSupplierInvoices } = await supabase
    .from('supplier_invoices')
    .select('total_amount')
    .eq('user_id', userId)
    .in('status', ['received', 'attested'])

  const accountsPayable = (unpaidSupplierInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.total_amount),
    0
  )

  // Cash balance
  const { data: bankConnections } = await supabase
    .from('bank_connections')
    .select('accounts')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)

  let cashBalance = 0
  if (bankConnections && bankConnections.length > 0) {
    const accounts = bankConnections[0].accounts as { balance: number }[] | null
    if (accounts) {
      cashBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0)
    }
  }

  // Invoice metrics
  const { data: allInvoices } = await supabase
    .from('invoices')
    .select('total, total_sek, invoice_date, due_date, paid_at')
    .eq('user_id', userId)
    .gte('invoice_date', startOfYear)
    .lte('invoice_date', endDate)

  const invoiceCount = (allInvoices || []).length
  const invoiceTotal = (allInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.total_sek || inv.total),
    0
  )
  const averageInvoiceValue = invoiceCount > 0 ? invoiceTotal / invoiceCount : 0

  // DSO = (Accounts Receivable / Revenue) * Days in period
  const daysInPeriod = Math.max(
    1,
    Math.floor((asOfDate.getTime() - new Date(startOfYear).getTime()) / (1000 * 60 * 60 * 24))
  )
  const daysSalesOutstanding = revenue > 0 ? (accountsReceivable / revenue) * daysInPeriod : 0

  // Ratios
  const currentAssets = cashBalance + accountsReceivable
  const currentLiabilities = Math.max(accountsPayable, 1)
  const currentRatio = currentAssets / currentLiabilities
  const quickRatio = cashBalance / currentLiabilities

  // Burn rate (for companies spending more than earning)
  const monthsElapsed = Math.max(1, asOfDate.getMonth() + 1)
  const avgMonthlyExpenses = expenses / monthsElapsed
  const burnRate = netIncome < 0 ? avgMonthlyExpenses : 0
  const runwayMonths = burnRate > 0 ? cashBalance / burnRate : netIncome >= 0 ? 999 : 0

  return {
    id: '',
    user_id: userId,
    snapshot_date: endDate,
    period_type: 'daily',
    revenue: Math.round(revenue),
    expenses: Math.round(expenses),
    net_income: Math.round(netIncome),
    gross_margin_pct: Math.round(grossMarginPct * 10) / 10,
    operating_margin_pct: Math.round(operatingMarginPct * 10) / 10,
    accounts_receivable: Math.round(accountsReceivable),
    accounts_payable: Math.round(accountsPayable),
    cash_balance: Math.round(cashBalance),
    invoice_count: invoiceCount,
    average_invoice_value: Math.round(averageInvoiceValue),
    days_sales_outstanding: Math.round(daysSalesOutstanding),
    current_ratio: Math.round(currentRatio * 100) / 100,
    quick_ratio: Math.round(quickRatio * 100) / 100,
    burn_rate: Math.round(burnRate),
    runway_months: Math.min(Math.round(runwayMonths), 999),
    created_at: new Date().toISOString(),
  }
}

// ============================================================
// Financial Health Score
// ============================================================

/**
 * Calculate a financial health score from 0-100 based on weighted factors.
 */
export async function calculateFinancialHealth(
  userId: string,
  supabase: SupabaseClient
): Promise<FinancialHealthScore> {
  const now = new Date()
  const currentKPIs = await calculateKPIs(userId, now, supabase)

  // Get 3-month ago snapshot for trend comparison
  const threeMonthsAgo = new Date(now)
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  const { data: historicalSnapshot } = await supabase
    .from('kpi_snapshots')
    .select('*')
    .eq('user_id', userId)
    .lte('snapshot_date', threeMonthsAgo.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  const factors: HealthFactor[] = []

  // 1. Liquidity Score (25%)
  const liquidityScore = calculateLiquidityScore(currentKPIs)
  const liquidityTrend = historicalSnapshot
    ? compareTrend(calculateLiquidityScore(historicalSnapshot as KPISnapshot), liquidityScore)
    : 'stable' as const
  factors.push({
    name: 'Likviditet',
    score: liquidityScore,
    description: getLiquidityDescription(currentKPIs),
    trend: liquidityTrend,
  })

  // 2. Profitability Score (25%)
  const profitabilityScore = calculateProfitabilityScore(currentKPIs)
  const profitabilityTrend = historicalSnapshot
    ? compareTrend(calculateProfitabilityScore(historicalSnapshot as KPISnapshot), profitabilityScore)
    : 'stable' as const
  factors.push({
    name: 'Lonsamhet',
    score: profitabilityScore,
    description: getProfitabilityDescription(currentKPIs),
    trend: profitabilityTrend,
  })

  // 3. Efficiency Score (25%)
  const efficiencyScore = calculateEfficiencyScore(currentKPIs)
  const efficiencyTrend = historicalSnapshot
    ? compareTrend(calculateEfficiencyScore(historicalSnapshot as KPISnapshot), efficiencyScore)
    : 'stable' as const
  factors.push({
    name: 'Effektivitet',
    score: efficiencyScore,
    description: getEfficiencyDescription(currentKPIs),
    trend: efficiencyTrend,
  })

  // 4. Growth Score (25%)
  const growthScore = await calculateGrowthScore(userId, supabase, currentKPIs)
  const growthTrend = historicalSnapshot
    ? compareTrend(50, growthScore) // Compare to neutral
    : 'stable' as const
  factors.push({
    name: 'Tillvaxt',
    score: growthScore,
    description: getGrowthDescription(growthScore),
    trend: growthTrend,
  })

  const overall = Math.round(
    (liquidityScore * 0.25) +
    (profitabilityScore * 0.25) +
    (efficiencyScore * 0.25) +
    (growthScore * 0.25)
  )

  return {
    overall: Math.min(100, Math.max(0, overall)),
    liquidity: liquidityScore,
    profitability: profitabilityScore,
    efficiency: efficiencyScore,
    growth: growthScore,
    factors,
  }
}

function calculateLiquidityScore(kpis: KPISnapshot): number {
  let score = 50

  // Current ratio scoring
  if (kpis.current_ratio >= 2) score += 20
  else if (kpis.current_ratio >= 1.5) score += 15
  else if (kpis.current_ratio >= 1) score += 5
  else score -= 20

  // Quick ratio scoring
  if (kpis.quick_ratio >= 1) score += 15
  else if (kpis.quick_ratio >= 0.5) score += 5
  else score -= 15

  // Cash balance relative to monthly expenses
  const monthlyExpenses = kpis.expenses / Math.max(1, new Date().getMonth() + 1)
  if (monthlyExpenses > 0) {
    const monthsCovered = kpis.cash_balance / monthlyExpenses
    if (monthsCovered >= 6) score += 15
    else if (monthsCovered >= 3) score += 10
    else if (monthsCovered >= 1) score += 0
    else score -= 15
  }

  return Math.min(100, Math.max(0, score))
}

function calculateProfitabilityScore(kpis: KPISnapshot): number {
  let score = 50

  // Operating margin
  if (kpis.operating_margin_pct >= 20) score += 25
  else if (kpis.operating_margin_pct >= 10) score += 15
  else if (kpis.operating_margin_pct >= 5) score += 5
  else if (kpis.operating_margin_pct >= 0) score -= 5
  else score -= 25

  // Net income
  if (kpis.net_income > 0) score += 15
  else score -= 20

  // Gross margin
  if (kpis.gross_margin_pct >= 50) score += 10
  else if (kpis.gross_margin_pct >= 30) score += 5
  else score -= 5

  return Math.min(100, Math.max(0, score))
}

function calculateEfficiencyScore(kpis: KPISnapshot): number {
  let score = 50

  // DSO - lower is better
  if (kpis.days_sales_outstanding <= 20) score += 25
  else if (kpis.days_sales_outstanding <= 30) score += 15
  else if (kpis.days_sales_outstanding <= 45) score += 5
  else if (kpis.days_sales_outstanding <= 60) score -= 5
  else score -= 20

  // Expense ratio
  const expenseRatio = kpis.revenue > 0 ? kpis.expenses / kpis.revenue : 1
  if (expenseRatio <= 0.6) score += 20
  else if (expenseRatio <= 0.8) score += 10
  else if (expenseRatio <= 0.95) score += 0
  else score -= 15

  return Math.min(100, Math.max(0, score))
}

async function calculateGrowthScore(
  userId: string,
  supabase: SupabaseClient,
  currentKPIs: KPISnapshot
): Promise<number> {
  let score = 50

  // Get last year's revenue for comparison
  const lastYear = new Date().getFullYear() - 1
  const { data: lastYearSnapshot } = await supabase
    .from('kpi_snapshots')
    .select('revenue, invoice_count')
    .eq('user_id', userId)
    .eq('period_type', 'monthly')
    .gte('snapshot_date', `${lastYear}-01-01`)
    .lte('snapshot_date', `${lastYear}-12-31`)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single()

  if (lastYearSnapshot && lastYearSnapshot.revenue > 0) {
    const revenueGrowth = ((currentKPIs.revenue - lastYearSnapshot.revenue) / lastYearSnapshot.revenue) * 100
    if (revenueGrowth >= 50) score += 30
    else if (revenueGrowth >= 20) score += 20
    else if (revenueGrowth >= 5) score += 10
    else if (revenueGrowth >= 0) score += 0
    else if (revenueGrowth >= -10) score -= 10
    else score -= 25
  }

  // Invoice volume growth
  if (currentKPIs.invoice_count >= 10) score += 10
  else if (currentKPIs.invoice_count >= 5) score += 5

  // Runway for pre-profit companies
  if (currentKPIs.net_income < 0 && currentKPIs.runway_months < 6) {
    score -= 20
  }

  return Math.min(100, Math.max(0, score))
}

function compareTrend(oldScore: number, newScore: number): 'improving' | 'stable' | 'declining' {
  const diff = newScore - oldScore
  if (diff > 5) return 'improving'
  if (diff < -5) return 'declining'
  return 'stable'
}

function getLiquidityDescription(kpis: KPISnapshot): string {
  if (kpis.current_ratio >= 2) return 'Stark likviditet med god marginal for oforutsedda utgifter'
  if (kpis.current_ratio >= 1.5) return 'Bra likviditetsposition, tillgangarna tacker skulderna val'
  if (kpis.current_ratio >= 1) return 'Acceptabel likviditet, men begransad marginal'
  return 'Lag likviditet - kortfristiga skulder overstiger likvida tillgangar'
}

function getProfitabilityDescription(kpis: KPISnapshot): string {
  if (kpis.operating_margin_pct >= 20) return 'Utmarkt lonsamhet med starka marginaler'
  if (kpis.operating_margin_pct >= 10) return 'God lonsamhet med stabila marginaler'
  if (kpis.operating_margin_pct >= 0) return 'Positiv men blygsam lonsamhet'
  return 'Negativ lonsamhet - kostnaderna overstiger intakterna'
}

function getEfficiencyDescription(kpis: KPISnapshot): string {
  if (kpis.days_sales_outstanding <= 30) return 'Kunderna betalar snabbt - effektiv kredithantering'
  if (kpis.days_sales_outstanding <= 45) return 'Normal betalningstid fran kunder'
  return 'Lang betalningstid - overväg att folja upp obetalda fakturor'
}

function getGrowthDescription(score: number): string {
  if (score >= 70) return 'Stark tillvaxt med okande intakter och kundstock'
  if (score >= 50) return 'Stabil utveckling med moderat tillvaxt'
  if (score >= 30) return 'Begransad tillvaxt - overväg nya strategier'
  return 'Vikande intakter - agar kräver uppmärksamhet'
}

// ============================================================
// Monthly Trend Data
// ============================================================

/**
 * Get monthly revenue/expense/profit trend for the last 12 months.
 */
export async function getMonthlyTrend(
  userId: string,
  supabase: SupabaseClient
): Promise<MonthlyTrendPoint[]> {
  const now = new Date()
  const twelveMonthsAgo = new Date(now)
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
  twelveMonthsAgo.setDate(1)

  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, amount_sek, date, is_business')
    .eq('user_id', userId)
    .eq('is_business', true)
    .gte('date', twelveMonthsAgo.toISOString().split('T')[0])

  const monthlyData = new Map<string, { revenue: number; expenses: number }>()

  // Initialize all 12 months
  for (let i = 0; i < 12; i++) {
    const d = new Date(twelveMonthsAgo)
    d.setMonth(d.getMonth() + i)
    const key = d.toISOString().split('T')[0].substring(0, 7)
    monthlyData.set(key, { revenue: 0, expenses: 0 })
  }

  for (const tx of transactions || []) {
    const monthKey = tx.date.substring(0, 7)
    const existing = monthlyData.get(monthKey)
    if (!existing) continue

    const amount = Number(tx.amount_sek || tx.amount)
    if (amount > 0) {
      existing.revenue += amount
    } else {
      existing.expenses += Math.abs(amount)
    }
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
  const trend: MonthlyTrendPoint[] = []

  const sortedKeys = Array.from(monthlyData.keys()).sort()
  for (const key of sortedKeys) {
    const data = monthlyData.get(key)!
    const monthIndex = parseInt(key.split('-')[1]) - 1

    trend.push({
      month: key,
      label: monthNames[monthIndex],
      revenue: Math.round(data.revenue),
      expenses: Math.round(data.expenses),
      profit: Math.round(data.revenue - data.expenses),
    })
  }

  return trend
}
