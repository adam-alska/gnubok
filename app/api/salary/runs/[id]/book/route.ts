import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'
import { createSalaryRunEntries } from '@/lib/salary/salary-entries'
import { eventBus } from '@/lib/events'

ensureInitialized()

/** paid → booked (creates immutable journal entries) */
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

  // Verify run is paid
  const { data: run, error: runError } = await supabase
    .from('salary_runs')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'paid')
    .single()

  if (runError || !run) {
    return NextResponse.json({ error: 'Lönekörningen måste vara markerad som betald' }, { status: 400 })
  }

  // Load employees with line items
  const { data: employees, error: empError } = await supabase
    .from('salary_run_employees')
    .select('*, employee:employees(employment_type), line_items:salary_line_items(*)')
    .eq('salary_run_id', id)

  if (empError || !employees || employees.length === 0) {
    return NextResponse.json({ error: 'Inga anställda i lönekörningen' }, { status: 400 })
  }

  try {
    const { salaryEntry, avgifterEntry, vacationEntry, pensionEntry } = await createSalaryRunEntries(
      supabase,
      companyId,
      user.id,
      {
        id: run.id,
        period_year: run.period_year,
        period_month: run.period_month,
        payment_date: run.payment_date,
        voucher_series: run.voucher_series,
        total_gross: run.total_gross,
        total_tax: run.total_tax,
        total_net: run.total_net,
        total_avgifter: run.total_avgifter,
        total_vacation_accrual: run.total_vacation_accrual,
        employees: employees.map(sre => ({
          employee_id: sre.employee_id,
          employment_type: sre.employee?.employment_type || 'employee',
          gross_salary: sre.gross_salary,
          tax_withheld: sre.tax_withheld,
          net_salary: sre.net_salary,
          avgifter_amount: sre.avgifter_amount,
          avgifter_rate: sre.avgifter_rate,
          vacation_accrual: sre.vacation_accrual,
          vacation_accrual_avgifter: sre.vacation_accrual_avgifter,
          line_items: (sre.line_items || []).map((li: Record<string, unknown>) => ({
            item_type: li.item_type as string,
            amount: li.amount as number,
            account_number: li.account_number as string | null,
            is_net_deduction: li.is_net_deduction as boolean,
            is_gross_deduction: li.is_gross_deduction as boolean,
          })),
        })),
      }
    )

    // Update run with journal entry references
    const entryIds = [salaryEntry.id, avgifterEntry.id]
    const updates: Record<string, unknown> = {
      status: 'booked',
      salary_entry_id: salaryEntry.id,
      avgifter_entry_id: avgifterEntry.id,
      booked_at: new Date().toISOString(),
      booked_by: user.id,
    }
    if (vacationEntry) {
      updates.vacation_entry_id = vacationEntry.id
      entryIds.push(vacationEntry.id)
    }
    if (pensionEntry) {
      entryIds.push(pensionEntry.id)
    }

    const { data: bookedRun, error: updateError } = await supabase
      .from('salary_runs')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await eventBus.emit({
      type: 'salary_run.booked',
      payload: { salaryRunId: id, entryIds, userId: user.id, companyId },
    })

    return NextResponse.json({ data: bookedRun })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bokföring misslyckades'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
