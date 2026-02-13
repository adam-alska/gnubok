import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateCampaignInput } from '@/types'

/**
 * GET /api/campaigns
 * List campaigns for the authenticated user
 * Query params:
 *   - status: CampaignStatus (optional, comma-separated for multiple)
 *   - type: CampaignType (optional)
 *   - customer_id: string (optional)
 *   - from: ISO date string (optional, start_date >=)
 *   - to: ISO date string (optional, end_date <=)
 *   - limit: number (default: 50)
 *   - offset: number (default: 0)
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
  const status = searchParams.get('status')
  const type = searchParams.get('type')
  const customerId = searchParams.get('customer_id')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  // Build query with relations
  let query = supabase
    .from('campaigns')
    .select(`
      *,
      customer:customers!campaigns_customer_id_fkey(id, name, customer_category),
      end_customer:customers!campaigns_end_customer_id_fkey(id, name),
      deliverables(id, title, status, due_date, platform, deliverable_type),
      exclusivities(id, categories, start_date, end_date),
      contracts(id, filename, is_primary)
    `, { count: 'exact' })
    .eq('user_id', user.id)

  // Apply filters
  if (status) {
    const statuses = status.split(',')
    if (statuses.length === 1) {
      query = query.eq('status', status)
    } else {
      query = query.in('status', statuses)
    }
  }

  if (type) {
    query = query.eq('campaign_type', type)
  }

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  if (from) {
    query = query.gte('start_date', from)
  }

  if (to) {
    query = query.lte('end_date', to)
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, count })
}

/**
 * POST /api/campaigns
 * Create a new campaign
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: CreateCampaignInput = await request.json()

  // Validate required fields
  if (!body.name) {
    return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 })
  }

  // Validate customer exists if provided
  if (body.customer_id) {
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', body.customer_id)
      .eq('user_id', user.id)
      .single()

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
  }

  // Validate end_customer exists if provided
  if (body.end_customer_id) {
    const { data: endCustomer, error: endCustomerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', body.end_customer_id)
      .eq('user_id', user.id)
      .single()

    if (endCustomerError || !endCustomer) {
      return NextResponse.json({ error: 'End customer not found' }, { status: 404 })
    }
  }

  // Insert the campaign
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      user_id: user.id,
      customer_id: body.customer_id || null,
      end_customer_id: body.end_customer_id || null,
      name: body.name,
      description: body.description || null,
      brand_name: body.brand_name || null,
      campaign_type: body.campaign_type || 'influencer',
      status: 'negotiation',
      total_value: body.total_value || null,
      currency: body.currency || 'SEK',
      vat_included: body.vat_included || false,
      payment_terms: body.payment_terms || null,
      billing_frequency: body.billing_frequency || null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      publication_date: body.publication_date || null,
      draft_deadline: body.draft_deadline || null,
      notes: body.notes || null,
    })
    .select(`
      *,
      customer:customers!campaigns_customer_id_fkey(id, name),
      end_customer:customers!campaigns_end_customer_id_fkey(id, name)
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
