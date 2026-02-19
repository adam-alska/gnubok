/**
 * Swedish Payroll Calculation Engine
 * Handles tax calculations, employer contributions, vacation pay,
 * and full salary run processing according to Swedish regulations.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Employee,
  SalaryRunItem,
  SalaryRunItemAdjustment,
  TaxCalculationResult,
  EmployerTaxBreakdown,
  SalaryCalculationResult,
  SalaryRunCalculationResult,
  SalaryRunItemCalculation,
  SalaryType,
} from '@/types/payroll'

// =============================================================================
// Constants - Swedish Tax Rates 2025/2026
// =============================================================================

/** Average municipal tax rate across Swedish municipalities */
const DEFAULT_MUNICIPAL_TAX_RATE = 32.0

/** State tax threshold for 2025 (annual income) */
const STATE_TAX_THRESHOLD_ANNUAL = 615700

/** State tax rate above threshold */
const STATE_TAX_RATE = 20.0

/** Standard employer contribution rate (arbetsgivaravgifter) */
const STANDARD_EMPLOYER_TAX_RATE = 31.42

/** Reduced employer contribution rate for young employees (18-23) */
const YOUNG_EMPLOYER_TAX_RATE = 10.21

/** Reduced employer contribution rate for elderly (65+) */
const ELDERLY_EMPLOYER_TAX_RATE = 10.21

/** Standard vacation pay percentage */
const STANDARD_VACATION_PAY_PERCENT = 12.0

/** Vacation pay percentage for hourly workers */
const HOURLY_VACATION_PAY_PERCENT = 12.5

/** Number of working days per month (average) */
const WORKING_DAYS_PER_MONTH = 21.75

/** Employer tax breakdown rates (2025) */
const EMPLOYER_TAX_BREAKDOWN = {
  sjukforsakring: 3.55,
  foraldraforsakring: 2.60,
  alderspension: 10.21,
  efterlevandepension: 0.60,
  arbetsmarknad: 2.64,
  arbetsskada: 0.20,
  allmanLoneavgift: 11.62,
} as const

// =============================================================================
// Tax Calculation
// =============================================================================

/**
 * Calculate preliminary tax (preliminar skatt) based on gross monthly salary.
 *
 * This is a simplified calculation using percentage-based approach.
 * In production, you would look up the exact amount from Skatteverket's
 * tax tables based on skattetabell and kolumn.
 *
 * @param grossMonthlySalary - Monthly gross salary in SEK
 * @param taxTable - Tax table number (skattetabell), 30-40 typical
 * @param taxColumn - Tax column (kolumn), 1-6
 * @returns Tax calculation result
 */
export function calculatePreliminaryTax(
  grossMonthlySalary: number,
  taxTable?: number | null,
  taxColumn?: number | null
): TaxCalculationResult {
  if (grossMonthlySalary <= 0) {
    return {
      preliminaryTax: 0,
      municipalTaxRate: DEFAULT_MUNICIPAL_TAX_RATE,
      stateTax: 0,
      totalTaxRate: 0,
    }
  }

  // Determine municipal tax rate from tax table/column
  // Tax tables roughly correspond to municipal tax rates
  // Table 30 ~ 29%, Table 31 ~ 30%, Table 32 ~ 31%, etc.
  let municipalTaxRate = DEFAULT_MUNICIPAL_TAX_RATE
  if (taxTable && taxTable >= 29 && taxTable <= 40) {
    municipalTaxRate = taxTable - 1 // Simplified approximation
  }

  // Column adjustments (simplified):
  // Column 1 = standard, Column 2-6 = various adjustments
  let columnAdjustment = 0
  if (taxColumn && taxColumn >= 2) {
    // Higher columns typically mean higher deductions (less tax)
    columnAdjustment = (taxColumn - 1) * 0.5
  }

  const effectiveMunicipalRate = municipalTaxRate - columnAdjustment

  // Calculate annual salary for state tax threshold check
  const annualSalary = grossMonthlySalary * 12

  // Grundavdrag (basic deduction) - simplified calculation
  // For 2025, grundavdrag varies by income level
  let grundavdragMonthly = 0
  if (annualSalary <= 220600) {
    grundavdragMonthly = (0.423 * annualSalary) / 12
  } else if (annualSalary <= 386700) {
    grundavdragMonthly = (0.292 * annualSalary + 29000) / 12
  } else if (annualSalary <= 614200) {
    grundavdragMonthly = (142000 - 0.106 * annualSalary) / 12
  } else {
    grundavdragMonthly = 40900 / 12
  }

  grundavdragMonthly = Math.max(0, Math.round(grundavdragMonthly))

  // Taxable income after grundavdrag
  const taxableMonthly = Math.max(0, grossMonthlySalary - grundavdragMonthly)

  // Municipal tax
  const municipalTax = Math.round(taxableMonthly * (effectiveMunicipalRate / 100))

  // State tax (statlig skatt) - 20% on income above threshold
  let stateTax = 0
  if (annualSalary > STATE_TAX_THRESHOLD_ANNUAL) {
    const monthlyThreshold = STATE_TAX_THRESHOLD_ANNUAL / 12
    const taxableAboveThreshold = Math.max(0, grossMonthlySalary - monthlyThreshold)
    stateTax = Math.round(taxableAboveThreshold * (STATE_TAX_RATE / 100))
  }

  const totalTax = municipalTax + stateTax
  const totalTaxRate = grossMonthlySalary > 0
    ? (totalTax / grossMonthlySalary) * 100
    : 0

  return {
    preliminaryTax: totalTax,
    municipalTaxRate: effectiveMunicipalRate,
    stateTax,
    totalTaxRate: Math.round(totalTaxRate * 100) / 100,
  }
}

// =============================================================================
// Employer Tax Calculation
// =============================================================================

/**
 * Determine the birth year from a Swedish personal number (personnummer).
 * Format: YYYYMMDD-XXXX or YYMMDD-XXXX
 */
function getBirthYearFromPersonalNumber(personalNumber: string | null): number | null {
  if (!personalNumber) return null

  const cleaned = personalNumber.replace(/[-\s]/g, '')

  if (cleaned.length >= 8) {
    const yearStr = cleaned.substring(0, 4)
    const year = parseInt(yearStr, 10)
    if (year >= 1900 && year <= 2100) {
      return year
    }
  }

  if (cleaned.length >= 6) {
    const yearStr = cleaned.substring(0, 2)
    const year = parseInt(yearStr, 10)
    // Assume 19XX for years > 25, 20XX for years <= 25
    return year > 25 ? 1900 + year : 2000 + year
  }

  return null
}

/**
 * Calculate employer tax (arbetsgivaravgifter) based on gross salary and employee age.
 *
 * Standard rate: 31.42%
 * Reduced for young (18-23): 10.21% (only alderspension)
 * Reduced for elderly (65+): 10.21% (only alderspension)
 *
 * @param grossSalary - Gross salary for the period
 * @param employeeBirthYear - Employee's birth year (for age-based reductions)
 * @returns Employer tax breakdown
 */
export function calculateEmployerTax(
  grossSalary: number,
  employeeBirthYear?: number | null
): EmployerTaxBreakdown {
  if (grossSalary <= 0) {
    return {
      total: 0,
      sjukforsakring: 0,
      foraldraforsakring: 0,
      alderspension: 0,
      efterlevandepension: 0,
      arbetsmarknad: 0,
      arbetsskada: 0,
      allmanLoneavgift: 0,
    }
  }

  const currentYear = new Date().getFullYear()
  const employeeAge = employeeBirthYear ? currentYear - employeeBirthYear : 30

  // Young employee (born 2002 or later for 2025, i.e., 18-23)
  const isYoung = employeeAge >= 18 && employeeAge <= 23

  // Elderly employee (born 1959 or earlier for 2025, i.e., 65+)
  const isElderly = employeeAge >= 65

  if (isYoung || isElderly) {
    // Reduced rate - only alderspension (10.21%)
    const alderspension = Math.round(grossSalary * (EMPLOYER_TAX_BREAKDOWN.alderspension / 100) * 100) / 100
    return {
      total: alderspension,
      sjukforsakring: 0,
      foraldraforsakring: 0,
      alderspension,
      efterlevandepension: 0,
      arbetsmarknad: 0,
      arbetsskada: 0,
      allmanLoneavgift: 0,
    }
  }

  // Standard rate breakdown
  const sjukforsakring = Math.round(grossSalary * (EMPLOYER_TAX_BREAKDOWN.sjukforsakring / 100) * 100) / 100
  const foraldraforsakring = Math.round(grossSalary * (EMPLOYER_TAX_BREAKDOWN.foraldraforsakring / 100) * 100) / 100
  const alderspension = Math.round(grossSalary * (EMPLOYER_TAX_BREAKDOWN.alderspension / 100) * 100) / 100
  const efterlevandepension = Math.round(grossSalary * (EMPLOYER_TAX_BREAKDOWN.efterlevandepension / 100) * 100) / 100
  const arbetsmarknad = Math.round(grossSalary * (EMPLOYER_TAX_BREAKDOWN.arbetsmarknad / 100) * 100) / 100
  const arbetsskada = Math.round(grossSalary * (EMPLOYER_TAX_BREAKDOWN.arbetsskada / 100) * 100) / 100
  const allmanLoneavgift = Math.round(grossSalary * (EMPLOYER_TAX_BREAKDOWN.allmanLoneavgift / 100) * 100) / 100

  const total = sjukforsakring + foraldraforsakring + alderspension +
    efterlevandepension + arbetsmarknad + arbetsskada + allmanLoneavgift

  return {
    total: Math.round(total * 100) / 100,
    sjukforsakring,
    foraldraforsakring,
    alderspension,
    efterlevandepension,
    arbetsmarknad,
    arbetsskada,
    allmanLoneavgift,
  }
}

// =============================================================================
// Vacation Pay Calculation
// =============================================================================

/**
 * Calculate vacation pay accrual (semesterlon).
 *
 * Standard: 12% for monthly employees (sammanfallande semester)
 * Hourly: 12.5% for hourly workers
 *
 * @param grossSalary - Gross salary for the period
 * @param vacationPayPercentage - Override percentage (default based on salary type)
 * @param salaryType - Type of salary (monthly or hourly)
 * @returns Vacation pay accrual amount
 */
export function calculateVacationPay(
  grossSalary: number,
  vacationPayPercentage?: number,
  salaryType: SalaryType = 'monthly'
): number {
  if (grossSalary <= 0) return 0

  const percentage = vacationPayPercentage ??
    (salaryType === 'hourly' ? HOURLY_VACATION_PAY_PERCENT : STANDARD_VACATION_PAY_PERCENT)

  return Math.round(grossSalary * (percentage / 100) * 100) / 100
}

// =============================================================================
// Net Salary Calculation
// =============================================================================

/**
 * Calculate net salary.
 *
 * Net = Gross - Preliminary Tax - Taxable Deductions + Tax-Free Additions
 *
 * @param gross - Gross salary
 * @param tax - Preliminary tax
 * @param deductions - Array of deductions
 * @param additions - Array of additions
 * @returns Net salary
 */
export function calculateNetSalary(
  gross: number,
  tax: number,
  deductions: SalaryRunItemAdjustment[],
  additions: SalaryRunItemAdjustment[]
): number {
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0)
  const taxFreeAdditions = additions.reduce((sum, a) => sum + a.amount, 0)

  const net = gross - tax - totalDeductions + taxFreeAdditions
  return Math.round(Math.max(0, net) * 100) / 100
}

// =============================================================================
// Full Employee Salary Calculation
// =============================================================================

/**
 * Calculate a complete salary for one employee.
 */
export function calculateEmployeeSalary(
  employee: Employee,
  overrides?: {
    hoursWorked?: number
    overtimeHours?: number
    overtimeRate?: number
    deductions?: SalaryRunItemAdjustment[]
    additions?: SalaryRunItemAdjustment[]
    absenceDays?: number
    salaryType?: SalaryType
    isTaxFree?: boolean
  }
): SalaryCalculationResult {
  const salaryType = overrides?.salaryType ||
    (employee.employment_type === 'hourly' ? 'hourly' : 'monthly')

  // Calculate base gross
  let grossSalary = 0

  if (salaryType === 'hourly') {
    const hours = overrides?.hoursWorked ?? 168 // Default full-time hours
    grossSalary = employee.hourly_rate * hours
  } else {
    grossSalary = employee.monthly_salary
  }

  // Add overtime
  const overtimeHours = overrides?.overtimeHours ?? 0
  const overtimeRate = overrides?.overtimeRate ?? (employee.hourly_rate || (employee.monthly_salary / WORKING_DAYS_PER_MONTH / 8))
  const overtimeAmount = overtimeHours * overtimeRate
  grossSalary += overtimeAmount

  // Subtract absence deduction
  const absenceDays = overrides?.absenceDays ?? 0
  if (absenceDays > 0 && salaryType !== 'hourly') {
    const dailyRate = employee.monthly_salary / WORKING_DAYS_PER_MONTH
    const absenceDeduction = absenceDays * dailyRate
    grossSalary = Math.max(0, grossSalary - absenceDeduction)
  }

  // Add taxable additions to gross
  const additions = overrides?.additions ?? []
  const taxableAdditions = additions.filter(a => !a.type.includes('tax_free'))
  const taxFreeAdditions = additions.filter(a => a.type.includes('tax_free'))
  grossSalary += taxableAdditions.reduce((sum, a) => sum + a.amount, 0)

  grossSalary = Math.round(grossSalary * 100) / 100

  // Calculate deductions
  const deductions = overrides?.deductions ?? []
  const deductionsTotal = deductions.reduce((sum, d) => sum + d.amount, 0)

  // Calculate preliminary tax
  const isTaxFree = overrides?.isTaxFree ?? false
  let preliminaryTax = 0
  if (!isTaxFree) {
    const taxResult = calculatePreliminaryTax(
      grossSalary,
      employee.tax_table,
      employee.tax_column
    )
    preliminaryTax = taxResult.preliminaryTax
  }

  // Calculate net salary
  const netSalary = calculateNetSalary(
    grossSalary,
    preliminaryTax,
    deductions,
    taxFreeAdditions
  )

  // Calculate employer tax
  const birthYear = getBirthYearFromPersonalNumber(employee.personal_number)
  const employerTaxBreakdown = calculateEmployerTax(grossSalary, birthYear)

  // Calculate vacation pay accrual
  const vacationPayAccrued = calculateVacationPay(grossSalary, undefined, salaryType)

  // Total employer cost
  const totalEmployerCost = grossSalary + employerTaxBreakdown.total + vacationPayAccrued

  return {
    grossSalary,
    preliminaryTax,
    netSalary,
    employerTax: employerTaxBreakdown.total,
    employerTaxBreakdown,
    vacationPayAccrued,
    totalEmployerCost: Math.round(totalEmployerCost * 100) / 100,
    deductionsTotal: Math.round(deductionsTotal * 100) / 100,
    additionsTotal: Math.round(
      (taxableAdditions.reduce((s, a) => s + a.amount, 0) +
       taxFreeAdditions.reduce((s, a) => s + a.amount, 0)) * 100
    ) / 100,
  }
}

// =============================================================================
// Full Salary Run Calculation
// =============================================================================

/**
 * Calculate an entire salary run.
 * Fetches all employees assigned to the run and calculates their salaries.
 *
 * @param salaryRunId - The salary run to calculate
 * @param supabase - Supabase client instance
 * @returns Full salary run calculation result
 */
export async function calculateSalaryRun(
  salaryRunId: string,
  supabase: SupabaseClient
): Promise<SalaryRunCalculationResult> {
  // Fetch the salary run
  const { data: salaryRun, error: runError } = await supabase
    .from('salary_runs')
    .select('*')
    .eq('id', salaryRunId)
    .single()

  if (runError || !salaryRun) {
    throw new Error('Lönekörning hittades inte')
  }

  if (salaryRun.status !== 'draft' && salaryRun.status !== 'calculated') {
    throw new Error('Lönekörningen kan inte beräknas i nuvarande status')
  }

  // Fetch salary run items with employee data
  const { data: items, error: itemsError } = await supabase
    .from('salary_run_items')
    .select('*, employee:employees(*)')
    .eq('salary_run_id', salaryRunId)

  if (itemsError) {
    throw new Error(`Kunde inte hämta löneposter: ${itemsError.message}`)
  }

  if (!items || items.length === 0) {
    throw new Error('Inga anställda är tillagda i lönekörningen')
  }

  // Fetch absence records for the period
  const periodStart = `${salaryRun.period_year}-${String(salaryRun.period_month).padStart(2, '0')}-01`
  const lastDay = new Date(salaryRun.period_year, salaryRun.period_month, 0).getDate()
  const periodEnd = `${salaryRun.period_year}-${String(salaryRun.period_month).padStart(2, '0')}-${lastDay}`

  const employeeIds = items.map((item: SalaryRunItem & { employee: Employee }) => item.employee_id)

  const { data: absences } = await supabase
    .from('absence_records')
    .select('*')
    .in('employee_id', employeeIds)
    .gte('end_date', periodStart)
    .lte('start_date', periodEnd)
    .eq('approved', true)

  // Build absence map: employee_id -> total absence days in this period
  const absenceMap = new Map<string, number>()
  if (absences) {
    for (const absence of absences) {
      const current = absenceMap.get(absence.employee_id) || 0

      // Calculate overlap days between absence and salary period
      const absStart = new Date(Math.max(
        new Date(absence.start_date).getTime(),
        new Date(periodStart).getTime()
      ))
      const absEnd = new Date(Math.min(
        new Date(absence.end_date).getTime(),
        new Date(periodEnd).getTime()
      ))

      const diffTime = absEnd.getTime() - absStart.getTime()
      const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1)

      // Apply deduction percentage (e.g., 80% for sick leave means 20% deduction)
      const deductionFactor = absence.deduction_percentage / 100
      absenceMap.set(absence.employee_id, current + (diffDays * deductionFactor))
    }
  }

  // Calculate each item
  const calculatedItems: SalaryRunItemCalculation[] = []
  let totalGross = 0
  let totalNet = 0
  let totalPreliminaryTax = 0
  let totalEmployerTax = 0
  let totalVacationPay = 0

  for (const item of items) {
    const employee = item.employee as Employee
    if (!employee) continue

    const absenceDays = absenceMap.get(employee.id) || 0
    const deductions: SalaryRunItemAdjustment[] = Array.isArray(item.deductions) ? item.deductions : []
    const additions: SalaryRunItemAdjustment[] = Array.isArray(item.additions) ? item.additions : []

    const calc = calculateEmployeeSalary(employee, {
      hoursWorked: item.hours_worked || undefined,
      overtimeHours: item.overtime_hours || undefined,
      overtimeRate: item.overtime_rate || undefined,
      deductions,
      additions,
      absenceDays,
      salaryType: item.salary_type as SalaryType,
      isTaxFree: item.is_tax_free,
    })

    // Calculate absence deduction amount for display
    let absenceDeduction = 0
    if (absenceDays > 0 && item.salary_type !== 'hourly') {
      const dailyRate = employee.monthly_salary / WORKING_DAYS_PER_MONTH
      absenceDeduction = Math.round(absenceDays * dailyRate * 100) / 100
    }

    calculatedItems.push({
      employeeId: employee.id,
      employeeName: `${employee.first_name} ${employee.last_name}`,
      grossSalary: calc.grossSalary,
      preliminaryTax: calc.preliminaryTax,
      netSalary: calc.netSalary,
      employerTax: calc.employerTax,
      vacationPayAccrued: calc.vacationPayAccrued,
      salaryType: item.salary_type as SalaryType,
      hoursWorked: item.hours_worked || 0,
      overtimeHours: item.overtime_hours || 0,
      overtimeAmount: (item.overtime_hours || 0) * (item.overtime_rate || 0),
      deductions,
      additions,
      absenceDeduction,
    })

    totalGross += calc.grossSalary
    totalNet += calc.netSalary
    totalPreliminaryTax += calc.preliminaryTax
    totalEmployerTax += calc.employerTax
    totalVacationPay += calc.vacationPayAccrued
  }

  const totalEmployerCost = totalGross + totalEmployerTax + totalVacationPay

  // Update salary run items in database
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const calc = calculatedItems[i]
    if (!calc) continue

    await supabase
      .from('salary_run_items')
      .update({
        gross_salary: calc.grossSalary,
        net_salary: calc.netSalary,
        preliminary_tax: calc.preliminaryTax,
        employer_tax: calc.employerTax,
        vacation_pay_accrued: calc.vacationPayAccrued,
      })
      .eq('id', item.id)
  }

  // Update salary run totals
  await supabase
    .from('salary_runs')
    .update({
      status: 'calculated',
      total_gross: Math.round(totalGross * 100) / 100,
      total_net: Math.round(totalNet * 100) / 100,
      total_employer_tax: Math.round(totalEmployerTax * 100) / 100,
      total_preliminary_tax: Math.round(totalPreliminaryTax * 100) / 100,
      employee_count: calculatedItems.length,
    })
    .eq('id', salaryRunId)

  return {
    items: calculatedItems,
    totals: {
      totalGross: Math.round(totalGross * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      totalPreliminaryTax: Math.round(totalPreliminaryTax * 100) / 100,
      totalEmployerTax: Math.round(totalEmployerTax * 100) / 100,
      totalVacationPay: Math.round(totalVacationPay * 100) / 100,
      totalEmployerCost: Math.round(totalEmployerCost * 100) / 100,
      employeeCount: calculatedItems.length,
    },
  }
}
