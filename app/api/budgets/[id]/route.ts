import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, UpdateBudgetInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('budgets')
    .select(`
      *,
      fiscal_period:fiscal_periods(id, name, period_start, period_end)
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Budget hittades inte' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const raw = await request.json()
  const validation = validateBody(UpdateBudgetInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Check if budget is locked
  const { data: existing } = await supabase
    .from('budgets')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (existing?.status === 'locked' && body.status !== 'active' && body.status !== 'draft') {
    // Allow unlocking, but don't allow other changes to locked budgets
    if (!body.status) {
      return NextResponse.json({ error: 'Budgeten är låst och kan inte ändras' }, { status: 403 })
    }
  }

  const updateData: Record<string, unknown> = {}
  if (body.name !== undefined) updateData.name = body.name
  if (body.status !== undefined) updateData.status = body.status
  if (body.description !== undefined) updateData.description = body.description

  const { data, error } = await supabase
    .from('budgets')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select(`
      *,
      fiscal_period:fiscal_periods(id, name, period_start, period_end)
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  // Check if budget is locked
  const { data: existing } = await supabase
    .from('budgets')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (existing?.status === 'locked') {
    return NextResponse.json({ error: 'Låst budget kan inte tas bort' }, { status: 403 })
  }

  const { error } = await supabase
    .from('budgets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
