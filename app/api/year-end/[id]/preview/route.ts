import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateClosingEntriesPreview } from '@/lib/year-end/closing-engine'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import type { EntityType } from '@/types'

/**
 * GET /api/year-end/[id]/preview
 * Preview closing entries before executing them
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Fetch closing
  const { data: closing, error } = await supabase
    .from('year_end_closings')
    .select('fiscal_period_id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !closing) {
    return NextResponse.json({ error: 'Bokslut hittades inte' }, { status: 404 })
  }

  // Get entity type
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type')
    .eq('user_id', user.id)
    .single()

  const entityType: EntityType = (settings?.entity_type as EntityType) || 'enskild_firma'

  try {
    const preview = await generateClosingEntriesPreview(
      user.id,
      closing.fiscal_period_id,
      entityType
    )

    return NextResponse.json({ data: preview })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte generera forhandsgranskning' },
      { status: 500 }
    )
  }
}
