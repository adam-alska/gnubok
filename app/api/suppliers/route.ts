import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, CreateSupplierInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

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
  const search = searchParams.get('search')
  const active = searchParams.get('active')

  let query = supabase
    .from('suppliers')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('name', { ascending: true })
    .range(from, to)

  if (active === 'true') {
    query = query.eq('is_active', true)
  } else if (active === 'false') {
    query = query.eq('is_active', false)
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,org_number.ilike.%${search}%`)
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

  const { success: postRl, remaining: postRem, reset: postReset } = apiLimiter.check(user.id)
  if (!postRl) return rateLimitResponse(postReset)

  const raw = await request.json()
  const validation = validateBody(CreateSupplierInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      user_id: user.id,
      name: body.name,
      org_number: body.org_number || null,
      vat_number: body.vat_number || null,
      email: body.email || null,
      phone: body.phone || null,
      address_line1: body.address_line1 || null,
      postal_code: body.postal_code || null,
      city: body.city || null,
      country: body.country || 'SE',
      bankgiro: body.bankgiro || null,
      plusgiro: body.plusgiro || null,
      iban: body.iban || null,
      bic: body.bic || null,
      clearing_number: body.clearing_number || null,
      account_number: body.account_number || null,
      default_payment_terms: body.default_payment_terms ?? 30,
      category: body.category || null,
      notes: body.notes || null,
      is_active: body.is_active ?? true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
