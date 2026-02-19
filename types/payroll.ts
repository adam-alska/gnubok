// =============================================================================
// Payroll Types (Lonehantering)
// =============================================================================

// Employment types
export type EmploymentType = 'permanent' | 'temporary' | 'hourly' | 'intern'

// Absence types
export type AbsenceType = 'sick_leave' | 'parental_leave' | 'vacation' | 'child_care' | 'unpaid_leave' | 'other'

// Salary run status
export type SalaryRunStatus = 'draft' | 'calculated' | 'approved' | 'paid' | 'reported'

// Salary type
export type SalaryType = 'monthly' | 'hourly' | 'bonus' | 'commission' | 'vacation_payout'

// Salary addition/deduction type
export type SalaryAdditionType = 'addition' | 'deduction'

// AGI status
export type AGIStatus = 'draft' | 'submitted' | 'confirmed'

// =============================================================================
// Swedish Labels
// =============================================================================

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  permanent: 'Tillsvidareanstalld',
  temporary: 'Visstidsanstalld',
  hourly: 'Timanstalld',
  intern: 'Praktikant',
}

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  sick_leave: 'Sjukfranvaro',
  parental_leave: 'Foraldraledighet',
  vacation: 'Semester',
  child_care: 'VAB',
  unpaid_leave: 'Tjansteledig',
  other: 'Ovrigt',
}

export const SALARY_RUN_STATUS_LABELS: Record<SalaryRunStatus, string> = {
  draft: 'Utkast',
  calculated: 'Beraknad',
  approved: 'Godkand',
  paid: 'Utbetald',
  reported: 'Rapporterad',
}

export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  monthly: 'Manadslon',
  hourly: 'Timlon',
  bonus: 'Bonus',
  commission: 'Provision',
  vacation_payout: 'Semesterersattning',
}

export const AGI_STATUS_LABELS: Record<AGIStatus, string> = {
  draft: 'Utkast',
  submitted: 'Inskickad',
  confirmed: 'Bekräftad',
}

// =============================================================================
// Database Interfaces
// =============================================================================

export interface Employee {
  id: string
  user_id: string
  employee_number: string
  first_name: string
  last_name: string
  personal_number: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  postal_code: string | null
  city: string | null
  employment_type: EmploymentType
  employment_start_date: string
  employment_end_date: string | null
  department: string | null
  title: string | null
  monthly_salary: number
  hourly_rate: number
  tax_table: number | null
  tax_column: number | null
  tax_municipality: string | null
  bank_clearing: string | null
  bank_account: string | null
  vacation_days_total: number
  vacation_days_used: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SalaryRun {
  id: string
  user_id: string
  run_name: string
  period_year: number
  period_month: number
  payment_date: string
  status: SalaryRunStatus
  total_gross: number
  total_net: number
  total_employer_tax: number
  total_preliminary_tax: number
  employee_count: number
  journal_entry_id: string | null
  agi_reported: boolean
  agi_reported_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Relations
  items?: SalaryRunItem[]
}

export interface SalaryRunItemAdjustment {
  type: string
  amount: number
  description: string
}

export interface SalaryRunItem {
  id: string
  salary_run_id: string
  employee_id: string
  gross_salary: number
  net_salary: number
  preliminary_tax: number
  employer_tax: number
  vacation_pay_accrued: number
  salary_type: SalaryType
  hours_worked: number
  overtime_hours: number
  overtime_rate: number
  deductions: SalaryRunItemAdjustment[]
  additions: SalaryRunItemAdjustment[]
  is_tax_free: boolean
  notes: string | null
  created_at: string
  // Relations
  employee?: Employee
}

export interface SalaryAddition {
  id: string
  user_id: string
  code: string
  name: string
  type: SalaryAdditionType
  default_amount: number
  is_taxable: boolean
  affects_vacation_pay: boolean
  account_number: string | null
  is_active: boolean
  created_at: string
}

export interface AbsenceRecord {
  id: string
  user_id: string
  employee_id: string
  absence_type: AbsenceType
  start_date: string
  end_date: string
  days_count: number
  hours_per_day: number
  deduction_percentage: number
  notes: string | null
  approved: boolean
  created_at: string
  updated_at: string
  // Relations
  employee?: Employee
}

export interface AGIDeclaration {
  id: string
  user_id: string
  period_year: number
  period_month: number
  status: AGIStatus
  total_gross_salaries: number
  total_employer_tax: number
  total_preliminary_tax: number
  total_payable: number
  declaration_data: AGIEmployeeData[]
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export interface AGIEmployeeData {
  employee_id: string
  employee_number: string
  first_name: string
  last_name: string
  personal_number_masked: string
  total_gross: number
  total_preliminary_tax: number
  total_employer_tax: number
  salary_runs: string[]
}

// =============================================================================
// Input Types
// =============================================================================

export interface CreateEmployeeInput {
  employee_number: string
  first_name: string
  last_name: string
  personal_number?: string
  email?: string
  phone?: string
  address_line1?: string
  postal_code?: string
  city?: string
  employment_type: EmploymentType
  employment_start_date: string
  employment_end_date?: string
  department?: string
  title?: string
  monthly_salary?: number
  hourly_rate?: number
  tax_table?: number
  tax_column?: number
  tax_municipality?: string
  bank_clearing?: string
  bank_account?: string
  vacation_days_total?: number
}

export interface UpdateEmployeeInput {
  first_name?: string
  last_name?: string
  personal_number?: string
  email?: string
  phone?: string
  address_line1?: string
  postal_code?: string
  city?: string
  employment_type?: EmploymentType
  employment_start_date?: string
  employment_end_date?: string | null
  department?: string
  title?: string
  monthly_salary?: number
  hourly_rate?: number
  tax_table?: number
  tax_column?: number
  tax_municipality?: string
  bank_clearing?: string
  bank_account?: string
  vacation_days_total?: number
  vacation_days_used?: number
  is_active?: boolean
}

export interface CreateSalaryRunInput {
  run_name: string
  period_year: number
  period_month: number
  payment_date: string
  notes?: string
}

export interface CreateAbsenceInput {
  employee_id: string
  absence_type: AbsenceType
  start_date: string
  end_date: string
  days_count: number
  hours_per_day?: number
  deduction_percentage?: number
  notes?: string
}

export interface UpdateAbsenceInput {
  absence_type?: AbsenceType
  start_date?: string
  end_date?: string
  days_count?: number
  hours_per_day?: number
  deduction_percentage?: number
  notes?: string
  approved?: boolean
}

// =============================================================================
// Calculation Result Types
// =============================================================================

export interface TaxCalculationResult {
  preliminaryTax: number
  municipalTaxRate: number
  stateTax: number
  totalTaxRate: number
}

export interface EmployerTaxBreakdown {
  total: number
  sjukforsakring: number
  foraldraforsakring: number
  alderspension: number
  efterlevandepension: number
  arbetsmarknad: number
  arbetsskada: number
  allmanLoneavgift: number
}

export interface SalaryCalculationResult {
  grossSalary: number
  preliminaryTax: number
  netSalary: number
  employerTax: number
  employerTaxBreakdown: EmployerTaxBreakdown
  vacationPayAccrued: number
  totalEmployerCost: number
  deductionsTotal: number
  additionsTotal: number
}

export interface SalaryRunCalculationResult {
  items: SalaryRunItemCalculation[]
  totals: {
    totalGross: number
    totalNet: number
    totalPreliminaryTax: number
    totalEmployerTax: number
    totalVacationPay: number
    totalEmployerCost: number
    employeeCount: number
  }
}

export interface SalaryRunItemCalculation {
  employeeId: string
  employeeName: string
  grossSalary: number
  preliminaryTax: number
  netSalary: number
  employerTax: number
  vacationPayAccrued: number
  salaryType: SalaryType
  hoursWorked: number
  overtimeHours: number
  overtimeAmount: number
  deductions: SalaryRunItemAdjustment[]
  additions: SalaryRunItemAdjustment[]
  absenceDeduction: number
}

// Month names in Swedish
export const SWEDISH_MONTHS: Record<number, string> = {
  1: 'Januari',
  2: 'Februari',
  3: 'Mars',
  4: 'April',
  5: 'Maj',
  6: 'Juni',
  7: 'Juli',
  8: 'Augusti',
  9: 'September',
  10: 'Oktober',
  11: 'November',
  12: 'December',
}
