import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  validateYearEndReadiness,
  previewYearEndClosing,
  executeYearEndClosing,
} from '@/lib/core/bookkeeping/year-end-service'

/**
 * GET: Validate readiness and preview year-end closing
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [validation, preview] = await Promise.all([
      validateYearEndReadiness(supabase, user.id, id),
      previewYearEndClosing(supabase, user.id, id),
    ])

    return NextResponse.json({ data: { validation, preview } })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to preview year-end' },
      { status: 400 }
    )
  }
}

/**
 * POST: Execute year-end closing
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await executeYearEndClosing(supabase, user.id, id)
    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to execute year-end closing' },
      { status: 400 }
    )
  }
}
