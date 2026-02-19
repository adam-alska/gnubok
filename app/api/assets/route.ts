import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CreateAssetInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { generateAndSaveSchedule } from '@/lib/assets/depreciation-engine'
import type { Asset } from '@/types/fixed-assets'

function getPaginationParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const per_page = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') || '50')))
  const from = (page - 1) * per_page
  const to = from + per_page - 1
  return { page, per_page, from, to }
}

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { searchParams } = new URL(request.url)
  const { page, per_page, from, to } = getPaginationParams(searchParams)
  const status = searchParams.get('status')
  const category_id = searchParams.get('category_id')
  const search = searchParams.get('search')

  let query = supabase
    .from('assets')
    .select('*, category:asset_categories(id, code, name)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('asset_number', { ascending: true })
    .range(from, to)

  if (status) {
    query = query.eq('status', status)
  }

  if (category_id) {
    query = query.eq('category_id', category_id)
  }

  if (search) {
    query = query.or(
      `asset_number.ilike.%${search}%,name.ilike.%${search}%,serial_number.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query

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

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, remaining, reset: rlReset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(rlReset)

  const raw = await request.json()
  const validation = validateBody(CreateAssetInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  // Generate asset number: AT-YYYY-NNNN
  const year = new Date().getFullYear()
  const { count: existingCount } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const nextNum = ((existingCount || 0) + 1).toString().padStart(4, '0')
  const assetNumber = `AT-${year}-${nextNum}`

  const { data: asset, error } = await supabase
    .from('assets')
    .insert({
      user_id: user.id,
      asset_number: assetNumber,
      name: body.name,
      description: body.description || null,
      category_id: body.category_id || null,
      acquisition_date: body.acquisition_date,
      acquisition_cost: body.acquisition_cost,
      residual_value: body.residual_value ?? 0,
      useful_life_months: body.useful_life_months,
      depreciation_method: body.depreciation_method || 'straight_line',
      declining_balance_rate: body.declining_balance_rate || null,
      status: 'active',
      location: body.location || null,
      serial_number: body.serial_number || null,
      supplier_name: body.supplier_name || null,
      warranty_expires: body.warranty_expires || null,
      notes: body.notes || null,
      cost_center_id: body.cost_center_id || null,
      project_id: body.project_id || null,
    })
    .select('*, category:asset_categories(id, code, name)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Tillgångsnummer finns redan' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Generate and save depreciation schedule
  try {
    await generateAndSaveSchedule(asset as Asset, supabase)
  } catch (err) {
    console.error('Failed to generate depreciation schedule:', err)
    // Don't fail the asset creation, schedule can be regenerated
  }

  return NextResponse.json({ data: asset })
}
