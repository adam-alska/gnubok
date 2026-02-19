import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
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

  // Verify the asset belongs to the user
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (assetError || !asset) {
    return NextResponse.json({ error: 'Tillgång hittades inte' }, { status: 404 })
  }

  const { data: schedule, error } = await supabase
    .from('depreciation_schedule')
    .select('*')
    .eq('asset_id', id)
    .order('period_date', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: schedule })
}
