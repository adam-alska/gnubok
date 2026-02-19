import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, UpdateSalaryRunItemSchema } from '@/lib/validation'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const supabase = await createClient()
  const { id, itemId } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Verify run ownership and status
  const { data: run } = await supabase
    .from('salary_runs')
    .select('user_id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!run) {
    return NextResponse.json({ error: 'Lönekörning hittades inte' }, { status: 404 })
  }

  if (run.status !== 'draft' && run.status !== 'calculated') {
    return NextResponse.json(
      { error: 'Kan inte ändra poster i en godkänd lönekörning' },
      { status: 400 }
    )
  }

  const raw = await request.json()
  const validation = validateBody(UpdateSalaryRunItemSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const updateData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      updateData[key] = value
    }
  }

  const { data, error } = await supabase
    .from('salary_run_items')
    .update(updateData)
    .eq('id', itemId)
    .eq('salary_run_id', id)
    .select('*, employee:employees(id, employee_number, first_name, last_name)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Reset salary run status back to draft when items are modified
  if (run.status === 'calculated') {
    await supabase
      .from('salary_runs')
      .update({ status: 'draft' })
      .eq('id', id)
  }

  return NextResponse.json({ data })
}
