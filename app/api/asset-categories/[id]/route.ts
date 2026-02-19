import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, UpdateAssetCategoryInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

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
  const validation = validateBody(UpdateAssetCategoryInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  const updateData: Record<string, unknown> = {}
  if (body.code !== undefined) updateData.code = body.code
  if (body.name !== undefined) updateData.name = body.name
  if (body.asset_account !== undefined) updateData.asset_account = body.asset_account
  if (body.depreciation_account !== undefined) updateData.depreciation_account = body.depreciation_account
  if (body.expense_account !== undefined) updateData.expense_account = body.expense_account
  if (body.default_useful_life_months !== undefined) updateData.default_useful_life_months = body.default_useful_life_months
  if (body.default_depreciation_method !== undefined) updateData.default_depreciation_method = body.default_depreciation_method

  const { data, error } = await supabase
    .from('asset_categories')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Kategori hittades inte' }, { status: 404 })
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

  // Check if any assets use this category
  const { count } = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id)
    .eq('user_id', user.id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Kan inte ta bort kategori som används av tillgångar' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('asset_categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
