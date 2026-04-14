import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'
import { calculateSalary } from '@/lib/salary/calculation-engine'
import { loadPayrollConfig, serializePayrollConfig } from '@/lib/salary/payroll-config'
import { loadAllTaxTableRates } from '@/lib/salary/tax-tables'
import type { SalaryLineItemType } from '@/types'

ensureInitialized()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const companyId = await requireCompanyId(supabase, user.id)

  // Verify run is draft
  const { data: run, error: runError } = await supabase
    .from('salary_runs')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (runError || !run) {
    return NextResponse.json({ error: 'Lönekörning hittades inte' }, { status: 404 })
  }
  if (run.status !== 'draft') {
    return NextResponse.json({ error: 'Kan bara beräkna utkast' }, { status: 400 })
  }

  const paymentYear = parseInt(run.payment_date.split('-')[0])

  // Load config and tax tables
  const config = await loadPayrollConfig(supabase, paymentYear)
  const taxRates = await loadAllTaxTableRates(supabase, paymentYear)

  // Load all employees in this run
  const { data: runEmployees, error: empError } = await supabase
    .from('salary_run_employees')
    .select('*, employee:employees(*), line_items:salary_line_items(*)')
    .eq('salary_run_id', id)

  if (empError || !runEmployees || runEmployees.length === 0) {
    return NextResponse.json({ error: 'Inga anställda i lönekörningen' }, { status: 400 })
  }

  let totalGross = 0
  let totalTax = 0
  let totalNet = 0
  let totalAvgifter = 0
  let totalVacationAccrual = 0
  let totalEmployerCost = 0

  // Load YTD data from prior booked salary runs this year
  const { data: priorRuns } = await supabase
    .from('salary_run_employees')
    .select('employee_id, gross_salary, tax_withheld, net_salary, salary_run:salary_runs!inner(period_year, period_month, status)')
    .eq('company_id', companyId)

  const ytdByEmployee = new Map<string, { gross: number; tax: number; net: number }>()
  for (const prior of (priorRuns || [])) {
    const priorRun = prior.salary_run as unknown as { period_year: number; period_month: number; status: string } | null
    if (!priorRun || priorRun.period_year !== run.period_year || priorRun.status !== 'booked') continue
    if (priorRun.period_month >= run.period_month) continue // Only prior months
    const current = ytdByEmployee.get(prior.employee_id) || { gross: 0, tax: 0, net: 0 }
    current.gross += prior.gross_salary
    current.tax += prior.tax_withheld
    current.net += prior.net_salary
    ytdByEmployee.set(prior.employee_id, current)
  }

  for (const sre of runEmployees) {
    const emp = sre.employee
    if (!emp) continue

    const lineItems = (sre.line_items || []).map((li: Record<string, unknown>) => ({
      itemType: li.item_type as SalaryLineItemType,
      amount: li.amount as number,
      isTaxable: li.is_taxable as boolean,
      isAvgiftBasis: li.is_avgift_basis as boolean,
      isVacationBasis: li.is_vacation_basis as boolean,
      isGrossDeduction: li.is_gross_deduction as boolean,
      isNetDeduction: li.is_net_deduction as boolean,
    }))

    const result = calculateSalary(
      {
        employmentType: emp.employment_type,
        salaryType: emp.salary_type,
        monthlySalary: emp.monthly_salary || 0,
        hourlyRate: emp.hourly_rate || undefined,
        hoursWorked: sre.hours_worked || undefined,
        employmentDegree: emp.employment_degree,
        taxTableNumber: emp.tax_table_number,
        taxColumn: emp.tax_column || 1,
        isSidoinkomst: emp.is_sidoinkomst,
        jamkningPercentage: emp.jamkning_percentage,
        jamkningValidFrom: emp.jamkning_valid_from,
        jamkningValidTo: emp.jamkning_valid_to,
        fSkattStatus: emp.f_skatt_status,
        personnummer: emp.personnummer,
        paymentDate: run.payment_date,
        vacationRule: emp.vacation_rule,
        vacationDaysPerYear: emp.vacation_days_per_year,
        semestertillaggRate: emp.semestertillagg_rate,
        vaxaStodEligible: emp.vaxa_stod_eligible,
        vaxaStodStart: emp.vaxa_stod_start,
        vaxaStodEnd: emp.vaxa_stod_end,
        lineItems,
      },
      config,
      taxRates.map(r => ({
        tableYear: r.tableYear,
        tableNumber: r.tableNumber,
        columnNumber: r.columnNumber,
        incomeFrom: r.incomeFrom,
        incomeTo: r.incomeTo,
        taxAmount: r.taxAmount,
      }))
    )

    // Count absence days from line items
    const rawLines = (sre.line_items || []) as Array<Record<string, unknown>>
    function sumQuantity(types: string[]): number {
      return rawLines
        .filter(li => types.includes(li.item_type as string))
        .reduce((sum: number, li) => sum + ((li.quantity as number) || 0), 0)
    }
    const sickDays = sumQuantity(['sick_karens', 'sick_day2_14'])
    const vabDays = sumQuantity(['vab'])
    const parentalDays = sumQuantity(['parental_leave'])
    const vacationDays = sumQuantity(['vacation'])

    // Update salary_run_employee with calculated results
    await supabase
      .from('salary_run_employees')
      .update({
        gross_salary: result.grossSalary,
        gross_deductions: result.grossDeductions,
        benefit_values: result.benefitValues,
        taxable_income: result.taxableIncome,
        tax_withheld: result.taxWithheld,
        net_deductions: result.netDeductions,
        net_salary: result.netSalary,
        avgifter_rate: result.avgifterRate,
        avgifter_amount: result.avgifterAmount,
        avgifter_basis: result.avgifterBasis,
        vacation_accrual: result.vacationAccrual,
        vacation_accrual_avgifter: result.vacationAccrualAvgifter,
        tax_table_number: emp.tax_table_number,
        tax_column: emp.tax_column,
        tax_table_year: paymentYear,
        sick_days: sickDays,
        vab_days: vabDays,
        parental_days: parentalDays,
        vacation_days_taken: vacationDays,
        calculation_breakdown: { steps: result.steps },
        ytd_gross: Math.round(((ytdByEmployee.get(sre.employee_id)?.gross || 0) + result.grossSalary) * 100) / 100,
        ytd_tax: Math.round(((ytdByEmployee.get(sre.employee_id)?.tax || 0) + result.taxWithheld) * 100) / 100,
        ytd_net: Math.round(((ytdByEmployee.get(sre.employee_id)?.net || 0) + result.netSalary) * 100) / 100,
      })
      .eq('id', sre.id)

    totalGross += result.grossSalary
    totalTax += result.taxWithheld
    totalNet += result.netSalary
    totalAvgifter += result.avgifterAmount
    totalVacationAccrual += result.vacationAccrual
    totalEmployerCost += result.totalEmployerCost
  }

  // Update run totals
  const { data: updatedRun, error: updateError } = await supabase
    .from('salary_runs')
    .update({
      total_gross: Math.round(totalGross * 100) / 100,
      total_tax: Math.round(totalTax * 100) / 100,
      total_net: Math.round(totalNet * 100) / 100,
      total_avgifter: Math.round(totalAvgifter * 100) / 100,
      total_vacation_accrual: Math.round(totalVacationAccrual * 100) / 100,
      total_employer_cost: Math.round(totalEmployerCost * 100) / 100,
      calculation_params: serializePayrollConfig(config),
    })
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: updatedRun })
}
