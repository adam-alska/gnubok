// ============================================================
// Financial Insights Types
// ============================================================

export type InsightType =
  | 'cash_flow_warning'
  | 'spending_anomaly'
  | 'tax_optimization'
  | 'revenue_trend'
  | 'overdue_alert'
  | 'seasonal_pattern'
  | 'savings_opportunity'
  | 'compliance_reminder'

export type InsightSeverity = 'info' | 'warning' | 'critical'

export interface FinancialInsight {
  id: string
  user_id: string
  insight_type: InsightType
  severity: InsightSeverity
  title: string
  description: string
  action_text: string | null
  action_url: string | null
  data: Record<string, unknown>
  is_read: boolean
  is_dismissed: boolean
  expires_at: string | null
  created_at: string
}

export interface CashFlowForecast {
  id: string
  user_id: string
  forecast_date: string
  forecast_type: 'daily' | 'weekly' | 'monthly'
  opening_balance: number
  expected_income: number
  expected_expenses: number
  projected_balance: number
  confidence_level: number
  income_items: CashFlowItem[]
  expense_items: CashFlowItem[]
  created_at: string
}

export interface CashFlowForecastDay {
  date: string
  income: number
  expenses: number
  balance: number
  items: CashFlowItem[]
}

export interface CashFlowItem {
  type: 'invoice_due' | 'recurring_expense' | 'salary' | 'tax' | 'supplier_invoice' | 'estimated'
  description: string
  amount: number
  confidence: number
}

export interface KPISnapshot {
  id: string
  user_id: string
  snapshot_date: string
  period_type: 'daily' | 'weekly' | 'monthly'
  revenue: number
  expenses: number
  net_income: number
  gross_margin_pct: number
  operating_margin_pct: number
  accounts_receivable: number
  accounts_payable: number
  cash_balance: number
  invoice_count: number
  average_invoice_value: number
  days_sales_outstanding: number
  current_ratio: number
  quick_ratio: number
  burn_rate: number
  runway_months: number
  created_at: string
}

export interface KPIDashboardData {
  current: KPISnapshot
  previousMonth: KPISnapshot | null
  previousYear: KPISnapshot | null
  monthlyTrend: KPISnapshot[]
  insights: FinancialInsight[]
}

export interface FinancialHealthScore {
  overall: number
  liquidity: number
  profitability: number
  efficiency: number
  growth: number
  factors: HealthFactor[]
}

export interface HealthFactor {
  name: string
  score: number
  description: string
  trend: 'improving' | 'stable' | 'declining'
}

// AI Advice types
export interface AIAdvice {
  insights: AIAdviceItem[]
  generatedAt: string
  cached: boolean
}

export interface AIAdviceItem {
  title: string
  description: string
  category: 'cost_reduction' | 'revenue_growth' | 'cash_flow' | 'tax' | 'general'
  priority: 'high' | 'medium' | 'low'
}

// Dashboard data aggregation
export interface InsightsDashboardData {
  healthScore: FinancialHealthScore
  cashFlowForecast: CashFlowForecastDay[]
  insights: FinancialInsight[]
  kpis: KPIDashboardData | null
  quickStats: QuickStats
}

export interface QuickStats {
  outstandingInvoicesTotal: number
  outstandingInvoicesCount: number
  overdueInvoicesTotal: number
  overdueInvoicesCount: number
  overdueAgingDays: number
  upcomingPaymentsTotal: number
  upcomingPaymentsCount: number
  taxObligationsThisMonth: number
  recentTransactions: RecentTransaction[]
}

export interface RecentTransaction {
  id: string
  date: string
  description: string
  amount: number
  category: string
}

// Monthly trend data for charts
export interface MonthlyTrendPoint {
  month: string
  label: string
  revenue: number
  expenses: number
  profit: number
}
