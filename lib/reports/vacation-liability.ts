import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Semesterlöneskuld — Vacation liability report per BFNAR 2016:10.
 *
 * Per BFNAR 2016:10 kap 16: Vacation liability must be calculated per employee,
 * not as a lump sum. This report shows earned/taken days, accrued SEK amount
 * on account 2920, and accrued avgifter on account 2940.
 *
 * The report is required for year-end closing and ongoing monthly review.
 * Per BFL 7 kap: retained 7 years as part of räkenskapsinformation.
 */

export interface VacationLiabilityRow {
  employeeId: string
  employeeName: string
  personnummerLast4: string
  vacationRule: string
  vacationDaysEntitled: number
  vacationDaysTaken: number
  vacationDaysRemaining: number
  vacationDaysSaved: number
  accruedAmount: number       // Account 2920
  accruedAvgifter: number     // Account 2940
  avgifterRate: number
  totalLiability: number      // 2920 + 2940
}

export interface VacationLiabilityReport {
  rows: VacationLiabilityRow[]
  totals: {
    accruedAmount: number     // Sum for account 2920
    accruedAvgifter: number   // Sum for account 2940
    totalLiability: number
  }
  asOfDate: string
}

/**
 * Generate vacation liability report.
 *
 * Aggregates vacation accruals from all booked salary runs in the year
 * and compares against vacation days taken.
 */
export async function generateVacationLiability(
  supabase: SupabaseClient,
  companyId: string,
  year: number
): Promise<VacationLiabilityReport> {
  const r = (x: number) => Math.round(x * 100) / 100

  // Load active employees
  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('id, first_name, last_name, personnummer_last4, vacation_rule, vacation_days_per_year, vacation_days_saved')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('last_name')

  if (empError) throw new Error(`Failed to load employees: ${empError.message}`)

  // Load all salary run employees for booked runs this year
  const { data: runEmployees, error: sreError } = await supabase
    .from('salary_run_employees')
    .select(`
      employee_id,
      vacation_accrual,
      vacation_accrual_avgifter,
      avgifter_rate,
      vacation_days_taken,
      salary_run:salary_runs!inner(period_year, status)
    `)
    .eq('company_id', companyId)

  if (sreError) throw new Error(`Failed to load salary run data: ${sreError.message}`)

  // Filter to booked runs for the year
  const bookedForYear = (runEmployees || []).filter(sre => {
    const run = sre.salary_run as unknown as { period_year: number; status: string } | null
    return run && run.period_year === year && run.status === 'booked'
  })

  // Aggregate per employee
  const accrualsByEmployee = new Map<string, {
    totalAccrual: number
    totalAvgifter: number
    totalDaysTaken: number
    lastRate: number
  }>()

  for (const sre of bookedForYear) {
    const current = accrualsByEmployee.get(sre.employee_id) || {
      totalAccrual: 0, totalAvgifter: 0, totalDaysTaken: 0, lastRate: 0.3142,
    }
    current.totalAccrual += sre.vacation_accrual
    current.totalAvgifter += sre.vacation_accrual_avgifter
    current.totalDaysTaken += sre.vacation_days_taken
    current.lastRate = sre.avgifter_rate
    accrualsByEmployee.set(sre.employee_id, current)
  }

  const rows: VacationLiabilityRow[] = (employees || []).map(emp => {
    const accruals = accrualsByEmployee.get(emp.id)
    const accruedAmount = r(accruals?.totalAccrual || 0)
    const accruedAvgifter = r(accruals?.totalAvgifter || 0)
    const daysTaken = accruals?.totalDaysTaken || 0

    return {
      employeeId: emp.id,
      employeeName: `${emp.first_name} ${emp.last_name}`,
      personnummerLast4: emp.personnummer_last4,
      vacationRule: emp.vacation_rule,
      vacationDaysEntitled: emp.vacation_days_per_year,
      vacationDaysTaken: daysTaken,
      vacationDaysRemaining: emp.vacation_days_per_year - daysTaken,
      vacationDaysSaved: emp.vacation_days_saved,
      accruedAmount,
      accruedAvgifter,
      avgifterRate: accruals?.lastRate || 0.3142,
      totalLiability: r(accruedAmount + accruedAvgifter),
    }
  })

  const totals = {
    accruedAmount: r(rows.reduce((s, row) => s + row.accruedAmount, 0)),
    accruedAvgifter: r(rows.reduce((s, row) => s + row.accruedAvgifter, 0)),
    totalLiability: r(rows.reduce((s, row) => s + row.totalLiability, 0)),
  }

  return {
    rows,
    totals,
    asOfDate: `${year}-12-31`,
  }
}
