import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/annual-report/[id]
 * Get a single annual report with full details
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
    .from('annual_reports')
    .select('*, fiscal_period:fiscal_periods(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Årsredovisning hittades inte' }, { status: 404 })
  }

  return NextResponse.json({ data })
}

/**
 * PATCH /api/annual-report/[id]
 * Update annual report (management report, notes, status, board members)
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

  const allowedFields = [
    'management_report',
    'notes_data',
    'status',
    'board_members',
    'auditor_info',
    'report_data',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key]
    }
  }

  // Handle status transitions
  if (updates.status === 'approved') {
    updates.signed_at = new Date().toISOString()
  }
  if (updates.status === 'filed') {
    updates.filed_at = new Date().toISOString()
    if (body.filing_reference) {
      updates.filing_reference = body.filing_reference
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Inga falt att uppdatera' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('annual_reports')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
