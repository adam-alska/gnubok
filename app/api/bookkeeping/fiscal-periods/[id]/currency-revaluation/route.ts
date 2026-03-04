import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  previewCurrencyRevaluation,
  executeCurrencyRevaluation,
} from '@/lib/bookkeeping/currency-revaluation'

/**
 * GET: Preview currency revaluation for a fiscal period
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
    // Fetch period to get closing date
    const { data: period, error: periodError } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (periodError || !period) {
      return NextResponse.json({ error: 'Fiscal period not found' }, { status: 404 })
    }

    const preview = await previewCurrencyRevaluation(supabase, user.id, period.period_end)
    return NextResponse.json({ data: preview })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to preview currency revaluation' },
      { status: 400 }
    )
  }
}

/**
 * POST: Execute currency revaluation for a fiscal period
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
    // Fetch period to get closing date
    const { data: period, error: periodError } = await supabase
      .from('fiscal_periods')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (periodError || !period) {
      return NextResponse.json({ error: 'Fiscal period not found' }, { status: 404 })
    }

    if (period.is_closed) {
      return NextResponse.json({ error: 'Period is already closed' }, { status: 400 })
    }

    const result = await executeCurrencyRevaluation(supabase, user.id, period.period_end, id)

    if (!result) {
      return NextResponse.json({ data: null, message: 'No foreign currency items to revalue' })
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to execute currency revaluation' },
      { status: 400 }
    )
  }
}
