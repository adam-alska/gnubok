import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateCampaignInput, CampaignStatus } from '@/types'

/**
 * GET /api/campaigns/[id]
 * Get a single campaign with all related data
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('campaigns')
    .select(`
      *,
      customer:customers!campaigns_customer_id_fkey(id, name, email, customer_category, customer_type),
      end_customer:customers!campaigns_end_customer_id_fkey(id, name),
      deliverables(
        id, title, description, deliverable_type, platform, account_handle,
        quantity, specifications, due_date, status, submitted_at, approved_at,
        published_at, notes, created_at
      ),
      exclusivities(
        id, categories, excluded_brands, start_date, end_date,
        start_calculation_type, end_calculation_type, notes, created_at
      ),
      contracts(
        id, filename, file_path, file_size, mime_type, signing_date,
        is_primary, extraction_status, notes, uploaded_at
      ),
      briefings(
        id, briefing_type, title, content, text_content, filename,
        file_size, mime_type, notes, created_at, updated_at
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also fetch related invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, due_date, status, total, currency, payment_status')
    .eq('campaign_id', id)
    .eq('user_id', user.id)
    .order('invoice_date', { ascending: false })

  return NextResponse.json({ data: { ...data, invoices: invoices || [] } })
}

/**
 * PATCH /api/campaigns/[id]
 * Update a campaign
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: Partial<CreateCampaignInput> & { status?: CampaignStatus; contract_signed_at?: string } = await request.json()

  // Verify campaign exists and belongs to user
  const { data: existing, error: fetchError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Validate customer if changed
  if (body.customer_id && body.customer_id !== existing.customer_id) {
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

  // Build update object
  const updateData: Record<string, unknown> = {}

  if (body.name !== undefined) updateData.name = body.name
  if (body.description !== undefined) updateData.description = body.description
  if (body.customer_id !== undefined) updateData.customer_id = body.customer_id || null
  if (body.end_customer_id !== undefined) updateData.end_customer_id = body.end_customer_id || null
  if (body.campaign_type !== undefined) updateData.campaign_type = body.campaign_type
  if (body.status !== undefined) updateData.status = body.status
  if (body.total_value !== undefined) updateData.total_value = body.total_value
  if (body.currency !== undefined) updateData.currency = body.currency
  if (body.vat_included !== undefined) updateData.vat_included = body.vat_included
  if (body.payment_terms !== undefined) updateData.payment_terms = body.payment_terms
  if (body.billing_frequency !== undefined) updateData.billing_frequency = body.billing_frequency
  if (body.brand_name !== undefined) updateData.brand_name = body.brand_name
  if (body.start_date !== undefined) updateData.start_date = body.start_date
  if (body.end_date !== undefined) updateData.end_date = body.end_date
  if (body.publication_date !== undefined) updateData.publication_date = body.publication_date
  if (body.draft_deadline !== undefined) updateData.draft_deadline = body.draft_deadline
  if (body.contract_signed_at !== undefined) updateData.contract_signed_at = body.contract_signed_at
  if (body.notes !== undefined) updateData.notes = body.notes

  // Update the campaign
  const { data, error } = await supabase
    .from('campaigns')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
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

/**
 * DELETE /api/campaigns/[id]
 * Delete a campaign (cascades to deliverables, exclusivities, contracts)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // First, delete any contract files from storage
  const { data: contracts } = await supabase
    .from('contracts')
    .select('file_path')
    .eq('campaign_id', id)

  if (contracts && contracts.length > 0) {
    const filePaths = contracts.map(c => c.file_path)
    await supabase.storage.from('contracts').remove(filePaths)
  }

  // Delete the campaign (cascades to related tables)
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
