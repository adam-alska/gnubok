import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { requireCompanyId } from '@/lib/company/context'
import { generateAGIXml, buildIndividuppgifterSnapshot } from '@/lib/salary/agi/xml-generator'
import type { AGIEmployeeData, AGICompanyData, AGITotals } from '@/lib/salary/agi/xml-generator'
import { eventBus } from '@/lib/events'

ensureInitialized()

/**
 * Generate AGI XML for a salary run.
 *
 * Per agi-filing.md:
 * - FK570 (specifikationsnummer) MUST stay consistent per employee
 * - Corrections resubmit with same FK570 — different number = new record
 * - XML is räkenskapsinformation, stored for 7-year retention per BFL 7 kap
 * - Filing deadline: 12th of following month (17th in Jan/Aug for ≤40 MSEK)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await requireCompanyId(supabase, user.id)

  // Load salary run
  const { data: run, error: runError } = await supabase
    .from('salary_runs')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (runError || !run) {
    return NextResponse.json({ error: 'Lönekörning hittades inte' }, { status: 404 })
  }

  if (!['review', 'approved', 'paid', 'booked'].includes(run.status)) {
    return NextResponse.json({ error: 'AGI kan bara genereras efter granskning' }, { status: 400 })
  }

  // Load company
  const { data: company } = await supabase
    .from('companies')
    .select('name, org_number')
    .eq('id', companyId)
    .single()

  if (!company) {
    return NextResponse.json({ error: 'Företag hittades inte' }, { status: 404 })
  }

  // Load company settings for contact info
  const { data: settings } = await supabase
    .from('company_settings')
    .select('contact_name, contact_phone, contact_email')
    .eq('company_id', companyId)
    .single()

  // Load employees with their data
  const { data: runEmployees } = await supabase
    .from('salary_run_employees')
    .select('*, employee:employees(personnummer, specification_number, f_skatt_status), line_items:salary_line_items(*)')
    .eq('salary_run_id', id)

  if (!runEmployees || runEmployees.length === 0) {
    return NextResponse.json({ error: 'Inga anställda i lönekörningen' }, { status: 400 })
  }

  // Build AGI data
  const companyData: AGICompanyData = {
    orgNumber: company.org_number || '',
    companyName: company.name,
    periodYear: run.period_year,
    periodMonth: run.period_month,
    contactName: settings?.contact_name || company.name,
    contactPhone: settings?.contact_phone || '',
    contactEmail: settings?.contact_email || '',
  }

  const employeeData: AGIEmployeeData[] = runEmployees.map(sre => {
    const emp = sre.employee as { personnummer: string; specification_number: number; f_skatt_status: string } | null
    const lineItems = (sre.line_items || []) as Array<Record<string, unknown>>

    // Sum benefits by type for AGI rutor 012-019
    const benefitCar = sumLineItemAmounts(lineItems, ['benefit_car'])
    const benefitMeals = sumLineItemAmounts(lineItems, ['benefit_meals'])
    const benefitHousing = sumLineItemAmounts(lineItems, ['benefit_housing'])
    const benefitOther = sumLineItemAmounts(lineItems, ['benefit_wellness', 'benefit_other'])

    return {
      personnummer: emp?.personnummer || '',
      specificationNumber: emp?.specification_number || 0,
      grossSalary: sre.gross_salary,
      taxWithheld: sre.tax_withheld,
      avgifterBasis: sre.avgifter_basis,
      fSkattPayment: emp?.f_skatt_status === 'f_skatt' ? sre.gross_salary : undefined,
      benefitCar: benefitCar > 0 ? benefitCar : undefined,
      benefitHousing: benefitHousing > 0 ? benefitHousing : undefined,
      benefitMeals: benefitMeals > 0 ? benefitMeals : undefined,
      benefitOther: benefitOther > 0 ? benefitOther : undefined,
      sickDays: sre.sick_days > 0 ? sre.sick_days : undefined,
      vabDays: sre.vab_days > 0 ? sre.vab_days : undefined,
      parentalDays: sre.parental_days > 0 ? sre.parental_days : undefined,
    }
  })

  // Build totals with avgifter breakdown by category
  const avgifterByCategory: AGITotals['avgifterByCategory'] = {}
  for (const sre of runEmployees) {
    const rate = sre.avgifter_rate
    const category = rate <= 0.1022 ? 'reduced65plus' : rate <= 0.2082 ? 'youth' : 'standard'
    const cat = avgifterByCategory[category as keyof typeof avgifterByCategory] || { basis: 0, amount: 0 }
    cat.basis += sre.avgifter_basis
    cat.amount += sre.avgifter_amount
    ;(avgifterByCategory as Record<string, { basis: number; amount: number }>)[category] = cat
  }

  const totals: AGITotals = {
    totalTax: run.total_tax,
    totalAvgifterBasis: runEmployees.reduce((s, e) => s + e.avgifter_basis, 0),
    avgifterByCategory,
  }

  // Check for existing AGI for correction flag
  const { data: existingAgi } = await supabase
    .from('agi_declarations')
    .select('id')
    .eq('company_id', companyId)
    .eq('period_year', run.period_year)
    .eq('period_month', run.period_month)
    .single()

  const isCorrection = !!existingAgi

  const xml = generateAGIXml(companyData, employeeData, totals, isCorrection)
  const individuppgifter = buildIndividuppgifterSnapshot(employeeData)

  // Store AGI declaration (upsert for corrections per unique constraint)
  if (existingAgi) {
    await supabase
      .from('agi_declarations')
      .update({
        xml_content: xml,
        individuppgifter,
        total_gross: run.total_gross,
        total_tax: run.total_tax,
        total_avgifter_basis: totals.totalAvgifterBasis,
        total_avgifter: run.total_avgifter,
        employee_count: employeeData.length,
        is_correction: true,
        corrects_agi_id: existingAgi.id,
        salary_run_id: run.id,
      })
      .eq('id', existingAgi.id)
  } else {
    await supabase
      .from('agi_declarations')
      .insert({
        company_id: companyId,
        user_id: user.id,
        salary_run_id: run.id,
        period_year: run.period_year,
        period_month: run.period_month,
        xml_content: xml,
        individuppgifter,
        total_gross: run.total_gross,
        total_tax: run.total_tax,
        total_avgifter_basis: totals.totalAvgifterBasis,
        total_avgifter: run.total_avgifter,
        employee_count: employeeData.length,
      })
  }

  // Update salary run
  await supabase
    .from('salary_runs')
    .update({ agi_generated_at: new Date().toISOString() })
    .eq('id', id)

  await eventBus.emit({
    type: 'agi.generated',
    payload: {
      agiId: existingAgi?.id || 'new',
      periodYear: run.period_year,
      periodMonth: run.period_month,
      userId: user.id,
      companyId,
    },
  })

  // Auto-complete arbetsgivardeklaration deadline for this period
  // Per Skatteförfarandelagen: AGI generation satisfies the filing obligation
  const period = `${run.period_year}-${String(run.period_month).padStart(2, '0')}`
  await supabase
    .from('deadlines')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    })
    .eq('company_id', companyId)
    .eq('type', 'arbetsgivardeklaration')
    .eq('period', period)
    .eq('status', 'pending')

  // Return as downloadable XML
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="AGI_${company.org_number}_${run.period_year}${String(run.period_month).padStart(2, '0')}.xml"`,
    },
  })
}

function sumLineItemAmounts(lineItems: Array<Record<string, unknown>>, types: string[]): number {
  return lineItems
    .filter(li => types.includes(li.item_type as string))
    .reduce((sum, li) => sum + ((li.amount as number) || 0), 0)
}
