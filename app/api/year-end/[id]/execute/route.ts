import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { executeClosing, closeFiscalPeriod } from '@/lib/year-end/closing-engine'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/year-end/[id]/execute
 * Execute the year-end closing: create closing entries, close period
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
    // Execute closing entries
    const result = await executeClosing(user.id, id)

    // Close the fiscal period
    await closeFiscalPeriod(user.id, id)

    return NextResponse.json({
      data: {
        closingEntryId: result.closingEntryId,
        netResult: result.netResult,
        message: 'Bokslutet är genomfört. Räkenskapsåret är nu låst.',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte genomföra bokslut' },
      { status: 500 }
    )
  }
}
