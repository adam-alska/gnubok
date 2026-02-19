import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  generateOpeningBalances,
  previewOpeningBalances,
} from '@/lib/year-end/closing-engine'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/year-end/[id]/opening-balances
 * Preview opening balances for the next period
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
    .select('fiscal_period_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !closing) {
    return NextResponse.json({ error: 'Bokslut hittades inte' }, { status: 404 })
  }

  try {
    const preview = await previewOpeningBalances(user.id, closing.fiscal_period_id)
    return NextResponse.json({ data: preview })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte beräkna ingående balanser' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/year-end/[id]/opening-balances
 * Generate opening balances for the next fiscal period
 */
export async function POST(
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

  try {
    const result = await generateOpeningBalances(user.id, id)
    return NextResponse.json({
      data: {
        entryId: result.entryId,
        newPeriodId: result.newPeriodId,
        message: 'Ingående balanser har skapats för nästa räkenskapsår.',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte skapa ingående balanser' },
      { status: 500 }
    )
  }
}
