import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { validateBody } from '@/lib/api/validate'
import { UpdateEmployeeSchema } from '@/lib/api/schemas'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'
import { encryptPersonnummer, extractLast4, validatePersonnummer } from '@/lib/salary/personnummer'

ensureInitialized()

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await requireCompanyId(supabase, user.id)

  const { data: employee, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (error || !employee) {
    return NextResponse.json({ error: 'Anställd hittades inte' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      ...employee,
      personnummer: `XXXXXXXX-${employee.personnummer_last4}`,
    },
  })
}

export async function PATCH(
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

  const validation = await validateBody(request, UpdateEmployeeSchema)
  if (!validation.success) return validation.response
  const body = validation.data

  // Check employee exists
  const { data: existing, error: fetchError } = await supabase
    .from('employees')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Anställd hittades inte' }, { status: 404 })
  }

  // Build update object
  const updates: Record<string, unknown> = { ...body }

  // Handle personnummer update if provided
  if (body.personnummer) {
    const pnrValidation = validatePersonnummer(body.personnummer)
    if (!pnrValidation.valid) {
      return NextResponse.json({ error: pnrValidation.error }, { status: 400 })
    }
    updates.personnummer = encryptPersonnummer(body.personnummer)
    updates.personnummer_last4 = extractLast4(body.personnummer)
  }

  const { data: updated, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'En anställd med detta personnummer finns redan' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      ...updated,
      personnummer: `XXXXXXXX-${updated.personnummer_last4}`,
    },
  })
}

export async function DELETE(
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

  // Soft delete only — BFL 7 kap retention
  const { data, error } = await supabase
    .from('employees')
    .update({ is_active: false })
    .eq('id', id)
    .eq('company_id', companyId)
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Anställd hittades inte' }, { status: 404 })
  }

  return NextResponse.json({ data: { id: data.id, is_active: false } })
}
