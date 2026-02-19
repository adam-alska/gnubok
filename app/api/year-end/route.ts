import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateChecklist } from '@/lib/year-end/closing-engine'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import type { EntityType } from '@/types'

/**
 * GET /api/year-end
 * List all year-end closings for the current user
 */
export async function GET() {
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
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/year-end
 * Start a new year-end closing for a fiscal period
 * Body: { fiscal_period_id: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const body = await request.json()
  const { fiscal_period_id } = body

  if (!fiscal_period_id) {
    return NextResponse.json({ error: 'fiscal_period_id kravs' }, { status: 400 })
  }

  // Check period exists and belongs to user
  const { data: period, error: periodError } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', fiscal_period_id)
    .eq('user_id', user.id)
    .single()

  if (periodError || !period) {
    return NextResponse.json({ error: 'Rakenskap sar hittades inte' }, { status: 404 })
  }

  if (period.is_closed) {
    return NextResponse.json({ error: 'Räkenskapsåret är redan stängt' }, { status: 400 })
  }

  // Check no existing closing for this period
  const { data: existing } = await supabase
    .from('year_end_closings')
    .select('id')
    .eq('fiscal_period_id', fiscal_period_id)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Bokslut finns redan for denna period', data: existing }, { status: 409 })
  }

  // Get entity type for checklist
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type')
    .eq('user_id', user.id)
    .single()

  const entityType: EntityType = (settings?.entity_type as EntityType) || 'enskild_firma'

  // Generate checklist
  const checklist = generateChecklist(entityType)

  // Create closing record
  const { data: closing, error: createError } = await supabase
    .from('year_end_closings')
    .insert({
      user_id: user.id,
      fiscal_period_id,
      status: 'checklist',
      started_at: new Date().toISOString(),
      checklist_data: checklist,
    })
    .select('*, fiscal_period:fiscal_periods(*)')
    .single()

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  return NextResponse.json({ data: closing })
}
