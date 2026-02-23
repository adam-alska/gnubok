import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody } from '@/lib/api/validate'
import { CreateDeadlineSchema } from '@/lib/api/schemas'

/**
 * GET /api/deadlines
 * List deadlines for the authenticated user
 * Query params:
 *   - status: 'all' | 'pending' | 'completed' (default: 'all')
 *   - type: DeadlineType (optional)
 *   - from: ISO date string (optional)
 *   - to: ISO date string (optional)
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse query params
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'all'
  const type = searchParams.get('type')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Build query
  let query = supabase
    .from('deadlines')
    .select('*, customer:customers(id, name)')
    .eq('user_id', user.id)

  // Apply filters
  if (status === 'pending') {
    query = query.eq('is_completed', false)
  } else if (status === 'completed') {
    query = query.eq('is_completed', true)
  }

  if (type) {
    query = query.eq('deadline_type', type)
  }

  if (from) {
    query = query.gte('due_date', from)
  }

  if (to) {
    query = query.lte('due_date', to)
  }

  const { data, error } = await query.order('due_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/deadlines
 * Create a new deadline
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const validation = await validateBody(request, CreateDeadlineSchema)
  if (!validation.success) return validation.response
  const body = validation.data

  // Insert the deadline
  const { data, error } = await supabase
    .from('deadlines')
    .insert({
      user_id: user.id,
      title: body.title,
      due_date: body.due_date,
      due_time: body.due_time || null,
      deadline_type: body.deadline_type,
      priority: body.priority || 'normal',
      customer_id: body.customer_id || null,
      notes: body.notes || null,
    })
    .select('*, customer:customers(id, name)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
