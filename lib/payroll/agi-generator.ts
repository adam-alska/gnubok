/**
 * AGI Declaration Generator (Arbetsgivardeklaration)
 *
 * Generates the monthly employer declaration (AGI) that must be submitted
 * to Skatteverket. Aggregates all salary runs for a period and creates
 * per-employee breakdowns.
 *
 * Due date: 12th of the following month (26th for companies with > 15 employees)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AGIEmployeeData } from '@/types/payroll'

/**
 * Get the AGI declaration due date for a given period.
 * Small companies (<=15 employees): 12th of following month
 * Large companies (>15 employees): 26th of following month
 */
export function getAGIDueDate(year: number, month: number, isLargeCompany: boolean = false): Date {
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const day = isLargeCompany ? 26 : 12

  return new Date(nextYear, nextMonth - 1, day)
}

/**
 * Generate an AGI declaration for a given year/month period.
 *
 * Aggregates all salary runs for the period and creates per-employee
 * breakdowns matching Skatteverket's AGI format.
 *
 * @param year - Period year
 * @param month - Period month (1-12)
 * @param userId - The user/company ID
 * @param supabase - Supabase client
 * @returns The created AGI declaration ID
 */
export async function generateAGIDeclaration(
  year: number,
  month: number,
  userId: string,
  supabase: SupabaseClient
): Promise<string> {
  // Check if declaration already exists for this period
  const { data: existing } = await supabase
    .from('agi_declarations')
    .select('id, status')
    .eq('user_id', userId)
    .eq('period_year', year)
    .eq('period_month', month)
    .single()

  if (existing && existing.status === 'submitted') {
    throw new Error('En arbetsgivardeklaration for denna period har redan skickats in')
  }

  // Fetch all salary runs for the period that are approved or paid
  const { data: salaryRuns, error: runsError } = await supabase
    .from('salary_runs')
    .select('id, status, total_gross, total_employer_tax, total_preliminary_tax')
    .eq('user_id', userId)
    .eq('period_year', year)
    .eq('period_month', month)
    .in('status', ['approved', 'paid', 'reported'])

  if (runsError) {
    throw new Error(`Kunde inte hämta lönekörningar: ${runsError.message}`)
  }

  if (!salaryRuns || salaryRuns.length === 0) {
    throw new Error('Inga godkända lönekörningar hittades för perioden')
  }

  const salaryRunIds = salaryRuns.map(r => r.id)

  // Fetch all salary run items with employee data
  const { data: items, error: itemsError } = await supabase
    .from('salary_run_items')
    .select('*, employee:employees(id, employee_number, first_name, last_name, personal_number)')
    .in('salary_run_id', salaryRunIds)

  if (itemsError) {
    throw new Error(`Kunde inte hämta löneposter: ${itemsError.message}`)
  }

  // Aggregate per employee
  const employeeMap = new Map<string, AGIEmployeeData>()

  for (const item of (items || [])) {
    const employee = item.employee as {
      id: string
      employee_number: string
      first_name: string
      last_name: string
      personal_number: string | null
    }

    if (!employee) continue

    const current = employeeMap.get(employee.id) || {
      employee_id: employee.id,
      employee_number: employee.employee_number,
      first_name: employee.first_name,
      last_name: employee.last_name,
      personal_number_masked: maskPersonalNumber(employee.personal_number),
      total_gross: 0,
      total_preliminary_tax: 0,
      total_employer_tax: 0,
      salary_runs: [],
    }

    current.total_gross += Number(item.gross_salary) || 0
    current.total_preliminary_tax += Number(item.preliminary_tax) || 0
    current.total_employer_tax += Number(item.employer_tax) || 0

    if (!current.salary_runs.includes(item.salary_run_id)) {
      current.salary_runs.push(item.salary_run_id)
    }

    employeeMap.set(employee.id, current)
  }

  const employeeData = Array.from(employeeMap.values())

  // Calculate totals
  const totalGross = Math.round(employeeData.reduce((sum, e) => sum + e.total_gross, 0) * 100) / 100
  const totalEmployerTax = Math.round(employeeData.reduce((sum, e) => sum + e.total_employer_tax, 0) * 100) / 100
  const totalPreliminaryTax = Math.round(employeeData.reduce((sum, e) => sum + e.total_preliminary_tax, 0) * 100) / 100
  const totalPayable = Math.round((totalEmployerTax + totalPreliminaryTax) * 100) / 100

  // Round per-employee data
  for (const emp of employeeData) {
    emp.total_gross = Math.round(emp.total_gross * 100) / 100
    emp.total_preliminary_tax = Math.round(emp.total_preliminary_tax * 100) / 100
    emp.total_employer_tax = Math.round(emp.total_employer_tax * 100) / 100
  }

  // Upsert declaration
  if (existing) {
    const { error: updateError } = await supabase
      .from('agi_declarations')
      .update({
        status: 'draft',
        total_gross_salaries: totalGross,
        total_employer_tax: totalEmployerTax,
        total_preliminary_tax: totalPreliminaryTax,
        total_payable: totalPayable,
        declaration_data: employeeData,
      })
      .eq('id', existing.id)

    if (updateError) {
      throw new Error(`Kunde inte uppdatera deklarationen: ${updateError.message}`)
    }

    return existing.id
  }

  const { data: declaration, error: createError } = await supabase
    .from('agi_declarations')
    .insert({
      user_id: userId,
      period_year: year,
      period_month: month,
      status: 'draft',
      total_gross_salaries: totalGross,
      total_employer_tax: totalEmployerTax,
      total_preliminary_tax: totalPreliminaryTax,
      total_payable: totalPayable,
      declaration_data: employeeData,
    })
    .select('id')
    .single()

  if (createError || !declaration) {
    throw new Error(`Kunde inte skapa deklaration: ${createError?.message}`)
  }

  // Mark salary runs as reported
  await supabase
    .from('salary_runs')
    .update({
      agi_reported: true,
      agi_reported_at: new Date().toISOString(),
    })
    .in('id', salaryRunIds)

  return declaration.id
}

/**
 * Mask a Swedish personal number for display.
 * YYYYMMDD-XXXX -> YYYYMMDD-****
 */
function maskPersonalNumber(personalNumber: string | null): string {
  if (!personalNumber) return '****'

  const cleaned = personalNumber.replace(/[-\s]/g, '')
  if (cleaned.length >= 12) {
    return `${cleaned.substring(0, 8)}-****`
  }
  if (cleaned.length >= 10) {
    return `${cleaned.substring(0, 6)}-****`
  }
  return '****'
}
