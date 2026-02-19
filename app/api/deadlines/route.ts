import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateDeadlineInput } from '@/types'
import { validateBody, CreateDeadlineInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

function getPaginationParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const per_page = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') || '50')))
  const from = (page - 1) * per_page
  const to = from + per_page - 1
  return { page, per_page, from, to }
}

/**
 * GET /api/deadlines
 * List deadlines for the authenticated user
 * Query params:
 *   - status: 'all' | 'pending' | 'completed' (default: 'all')
 *   - type: DeadlineType (optional)
 *   - from: ISO date string (optional)
 *   - to: ISO date string (optional)
 *   - page: page number (default 1)
 *   - per_page: items per page (default 50, max 100)
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Parse query params
  const { searchParams } = new URL(request.url)
  const { page, per_page, from: rangeFrom, to: rangeTo } = getPaginationParams(searchParams)
  const status = searchParams.get('status') || 'all'
  const type = searchParams.get('type')
  const dateFrom = searchParams.get('from')
  const dateTo = searchParams.get('to')

  // Build query
  let query = supabase
    .from('deadlines')
    .select('*, customer:customers(id, name)', { count: 'exact' })
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

  if (dateFrom) {
    query = query.gte('due_date', dateFrom)
  }

  if (dateTo) {
    query = query.lte('due_date', dateTo)
  }

  const { data, error, count } = await query
    .order('due_date', { ascending: true })
    .range(rangeFrom, rangeTo)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = count ?? 0

  return NextResponse.json({
    data,
    pagination: {
      page,
      per_page,
      total,
      total_pages: Math.ceil(total / per_page),
    },
  })
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

  const { success: postRl, remaining: postRem, reset: postReset } = apiLimiter.check(user.id)
  if (!postRl) return rateLimitResponse(postReset)

  const raw = await request.json()
  const validation = validateBody(CreateDeadlineInputSchema, raw)
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
