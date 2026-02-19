import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/year-end/[id]
 * Get a single year-end closing with full details
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('year_end_closings')
    .select('*, fiscal_period:fiscal_periods(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Bokslut hittades inte' }, { status: 404 })
  }

  // Also fetch any annual report for this closing
  const { data: annualReport } = await supabase
    .from('annual_reports')
    .select('*')
    .eq('year_end_closing_id', id)
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({
    data: {
      ...data,
      annual_report: annualReport || null,
    },
  })
}

/**
 * PATCH /api/year-end/[id]
 * Update year-end closing (status, notes, result_account)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const body = await request.json()

  // Only allow updating certain fields
  const allowedFields = ['status', 'notes', 'result_account', 'checklist_data']
  const updates: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Inga falt att uppdatera' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('year_end_closings')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, fiscal_period:fiscal_periods(*)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
