// ============================================================
// Budget, Cost Center & Project Accounting Types
// ============================================================

// Cost Center (Kostnadsställe)
export interface CostCenter {
  id: string
  user_id: string
  code: string
  name: string
  description: string | null
  parent_id: string | null
  manager_name: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Relations (populated when fetched)
  children?: CostCenter[]
  parent?: CostCenter
}

// Project (Projekt)
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'cancelled' | 'on_hold'

export interface Project {
  id: string
  user_id: string
  project_number: string
  name: string
  description: string | null
  customer_id: string | null
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  budget_amount: number
  is_active: boolean
  created_at: string
  updated_at: string
  // Relations
  customer?: { id: string; name: string } | null
}

// Budget
export type BudgetStatus = 'draft' | 'active' | 'locked'

export interface Budget {
  id: string
  user_id: string
  name: string
  fiscal_period_id: string
  status: BudgetStatus
  description: string | null
  created_at: string
  updated_at: string
  // Relations
  fiscal_period?: {
    id: string
    name: string
    period_start: string
    period_end: string
  }
  entries_count?: number
}

// Budget Entry (one row in the budget spreadsheet)
export interface BudgetEntry {
  id: string
  budget_id: string
  account_number: string
  cost_center_id: string | null
  project_id: string | null
  month_1: number
  month_2: number
  month_3: number
  month_4: number
  month_5: number
  month_6: number
  month_7: number
  month_8: number
  month_9: number
  month_10: number
  month_11: number
  month_12: number
  annual_total: number
  notes: string | null
  created_at: string
  updated_at: string
  // Relations (populated when fetched)
  account_name?: string
  account_class?: number
  cost_center?: { id: string; code: string; name: string } | null
  project?: { id: string; project_number: string; name: string } | null
}

// Budget vs Actual row (for reporting)
export interface BudgetVsActualRow {
  account_number: string
  account_name: string
  account_class: number
  cost_center_id: string | null
  cost_center_name: string | null
  project_id: string | null
  project_name: string | null
  budget_months: number[]  // 12 months
  actual_months: number[]  // 12 months
  variance_months: number[]  // 12 months (actual - budget)
  budget_total: number
  actual_total: number
  variance_total: number
  variance_percentage: number  // (actual - budget) / budget * 100
}

// Budget vs Actual grouped by account class
export interface BudgetVsActualReport {
  budget_name: string
  period_start: string
  period_end: string
  sections: BudgetVsActualSection[]
  total_revenue_budget: number
  total_revenue_actual: number
  total_expense_budget: number
  total_expense_actual: number
  net_result_budget: number
  net_result_actual: number
}

export interface BudgetVsActualSection {
  title: string
  account_class: number
  rows: BudgetVsActualRow[]
  subtotal_budget: number
  subtotal_actual: number
  subtotal_variance: number
}

// Budget Summary (for list views)
export interface BudgetSummary {
  id: string
  name: string
  fiscal_period_name: string
  status: BudgetStatus
  total_revenue_budget: number
  total_expense_budget: number
  net_budget: number
  entries_count: number
}

// Project Profitability
export interface ProjectProfitability {
  project_id: string
  project_number: string
  project_name: string
  budget_amount: number
  total_revenue: number
  total_expenses: number
  gross_margin: number
  gross_margin_percentage: number
  net_result: number
  net_margin_percentage: number
  budget_utilization: number  // expenses / budget * 100
  revenue_by_month: { month: string; amount: number }[]
  expense_by_month: { month: string; amount: number }[]
}

// Input types
export interface CreateCostCenterInput {
  code: string
  name: string
  description?: string
  parent_id?: string
  manager_name?: string
  is_active?: boolean
  sort_order?: number
}

export interface UpdateCostCenterInput {
  code?: string
  name?: string
  description?: string | null
  parent_id?: string | null
  manager_name?: string | null
  is_active?: boolean
  sort_order?: number
}

export interface CreateProjectInput {
  project_number: string
  name: string
  description?: string
  customer_id?: string
  status?: ProjectStatus
  start_date?: string
  end_date?: string
  budget_amount?: number
  is_active?: boolean
}

export interface UpdateProjectInput {
  project_number?: string
  name?: string
  description?: string | null
  customer_id?: string | null
  status?: ProjectStatus
  start_date?: string | null
  end_date?: string | null
  budget_amount?: number
  is_active?: boolean
}

export interface CreateBudgetInput {
  name: string
  fiscal_period_id: string
  status?: BudgetStatus
  description?: string
}

export interface UpdateBudgetInput {
  name?: string
  status?: BudgetStatus
  description?: string | null
}

export interface CreateBudgetEntryInput {
  account_number: string
  cost_center_id?: string | null
  project_id?: string | null
  month_1?: number
  month_2?: number
  month_3?: number
  month_4?: number
  month_5?: number
  month_6?: number
  month_7?: number
  month_8?: number
  month_9?: number
  month_10?: number
  month_11?: number
  month_12?: number
  annual_total?: number
  notes?: string
}

export interface UpdateBudgetEntryInput {
  id: string
  month_1?: number
  month_2?: number
  month_3?: number
  month_4?: number
  month_5?: number
  month_6?: number
  month_7?: number
  month_8?: number
  month_9?: number
  month_10?: number
  month_11?: number
  month_12?: number
  annual_total?: number
  notes?: string
}

// Seasonal distribution patterns
export type DistributionPattern = 'even' | 'q4_heavy' | 'summer_low' | 'custom'

// Swedish labels
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planering',
  active: 'Aktiv',
  completed: 'Avslutad',
  cancelled: 'Avbruten',
  on_hold: 'Pausad',
}

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  draft: 'Utkast',
  active: 'Aktiv',
  locked: 'Låst',
}

export const DISTRIBUTION_PATTERN_LABELS: Record<DistributionPattern, string> = {
  even: 'Jämn fördelning',
  q4_heavy: 'Tyngre Q4',
  summer_low: 'Sommarsvacka',
  custom: 'Anpassad',
}

export const MONTH_NAMES_SV: string[] = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
]

export const MONTH_NAMES_FULL_SV: string[] = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
]

// Account class labels for budget grouping
export const ACCOUNT_CLASS_LABELS: Record<number, string> = {
  3: 'Intäkter',
  4: 'Varuinköp & direkta kostnader',
  5: 'Lokalkostnader',
  6: 'Övriga externa kostnader',
  7: 'Personalkostnader',
  8: 'Finansiella poster',
}
