import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'
import { eventBus } from '@/lib/events'

ensureInitialized()

/** review → approved (authorization recorded, with pre-approve validation) */
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

  // Verify run exists and is in review status
  const { data: run, error: runError } = await supabase
    .from('salary_runs')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'review')
    .single()

  if (runError || !run) {
    return NextResponse.json({ error: 'Lönekörningen måste vara i granskningsstatus' }, { status: 400 })
  }

  // Load all employees in this run for validation
  const { data: runEmployees } = await supabase
    .from('salary_run_employees')
    .select('*, employee:employees(first_name, last_name, clearing_number, bank_account_number, email)')
    .eq('salary_run_id', id)
    .eq('company_id', companyId)

  const validationErrors: string[] = []
  const warnings: string[] = []

  for (const sre of runEmployees || []) {
    const emp = sre.employee as {
      first_name: string
      last_name: string
      clearing_number: string | null
      bank_account_number: string | null
      email: string | null
    } | null
    if (!emp) continue
    const name = `${emp.first_name} ${emp.last_name}`

    // Bank details required for payment
    if (!emp.clearing_number || !emp.bank_account_number) {
      validationErrors.push(`${name}: Bankuppgifter saknas (clearingnummer och/eller kontonummer)`)
    }

    // Must have been calculated (calculation_breakdown exists)
    if (!sre.calculation_breakdown) {
      validationErrors.push(`${name}: Beräkning saknas — kör beräkning först`)
    }

    // Warning: no email means pay slip cannot be sent
    if (!emp.email) {
      warnings.push(`${name}: E-post saknas — lönebesked kan inte skickas`)
    }
  }

  if (validationErrors.length > 0) {
    return NextResponse.json({
      error: 'Valideringsfel — korrigera innan godkännande',
      details: validationErrors,
      warnings,
    }, { status: 400 })
  }

  // All validation passed — approve
  const { data: updatedRun, error } = await supabase
    .from('salary_runs')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'review')
    .select()
    .single()

  if (error || !updatedRun) {
    return NextResponse.json({ error: 'Kunde inte godkänna lönekörningen' }, { status: 500 })
  }

  await eventBus.emit({
    type: 'salary_run.approved',
    payload: { salaryRunId: id, approvedBy: user.id, userId: user.id, companyId },
  })

  return NextResponse.json({ data: updatedRun, warnings })
}
