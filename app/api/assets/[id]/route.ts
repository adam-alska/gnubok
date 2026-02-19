import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, UpdateAssetInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data: asset, error } = await supabase
    .from('assets')
    .select('*, category:asset_categories(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Tillgång hittades inte' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also fetch recent depreciation schedule entries
  const { data: schedule } = await supabase
    .from('depreciation_schedule')
    .select('*')
    .eq('asset_id', id)
    .order('period_date', { ascending: true })
    .limit(200)

  return NextResponse.json({ data: { ...asset, depreciation_schedule: schedule || [] } })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, remaining, reset: rlReset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(rlReset)

  const raw = await request.json()
  const validation = validateBody(UpdateAssetInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const updateData: Record<string, unknown> = {}
  if (body.name !== undefined) updateData.name = body.name
  if (body.description !== undefined) updateData.description = body.description
  if (body.category_id !== undefined) updateData.category_id = body.category_id
  if (body.residual_value !== undefined) updateData.residual_value = body.residual_value
  if (body.location !== undefined) updateData.location = body.location
  if (body.serial_number !== undefined) updateData.serial_number = body.serial_number
  if (body.supplier_name !== undefined) updateData.supplier_name = body.supplier_name
  if (body.warranty_expires !== undefined) updateData.warranty_expires = body.warranty_expires
  if (body.notes !== undefined) updateData.notes = body.notes
  if (body.cost_center_id !== undefined) updateData.cost_center_id = body.cost_center_id
  if (body.project_id !== undefined) updateData.project_id = body.project_id

  const { data, error } = await supabase
    .from('assets')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, category:asset_categories(*)')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Tillgång hittades inte' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, remaining, reset: rlReset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(rlReset)

  // Check if asset has posted depreciation entries
  const { count } = await supabase
    .from('depreciation_schedule')
    .select('id', { count: 'exact', head: true })
    .eq('asset_id', id)
    .eq('is_posted', true)

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Kan inte ta bort tillgång med bokförda avskrivningar. Avyttra istället.' },
      { status: 400 }
    )
  }

  // Delete schedule entries first (cascades, but explicit for safety)
  await supabase
    .from('depreciation_schedule')
    .delete()
    .eq('asset_id', id)

  const { error } = await supabase
    .from('assets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
