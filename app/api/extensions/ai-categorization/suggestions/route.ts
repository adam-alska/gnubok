import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { categorizeTransactions } from '@/extensions/general/ai-categorization'
import type { CategorizationSuggestion } from '@/extensions/general/ai-categorization/categorizer'

/**
 * GET /api/extensions/ai-categorization/suggestions?transaction_ids=id1,id2,...
 * Fetch pre-computed AI suggestions for given transaction IDs
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('transaction_ids')

  if (!idsParam) {
    return NextResponse.json({ error: 'transaction_ids is required' }, { status: 400 })
  }

  const transactionIds = idsParam.split(',').filter(Boolean).slice(0, 50)

  // Read stored suggestions from extension_data
  const keys = transactionIds.map((id) => `suggestion:${id}`)

  const { data: records } = await supabase
    .from('extension_data')
    .select('key, value')
    .eq('user_id', user.id)
    .eq('extension_id', 'ai-categorization')
    .in('key', keys)

  const suggestions: Record<string, CategorizationSuggestion> = {}
  if (records) {
    for (const record of records) {
      const txId = record.key.replace('suggestion:', '')
      suggestions[txId] = record.value as unknown as CategorizationSuggestion
    }
  }

  return NextResponse.json({ suggestions })
}

/**
 * POST /api/extensions/ai-categorization/suggestions
 * Trigger on-demand AI categorization for given transaction IDs
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { transaction_ids } = body

  if (!Array.isArray(transaction_ids) || transaction_ids.length === 0) {
    return NextResponse.json({ error: 'transaction_ids is required' }, { status: 400 })
  }

  const ids = transaction_ids.slice(0, 50)

  try {
    const suggestions = await categorizeTransactions(user.id, ids)

    // Group by transaction ID
    const grouped: Record<string, CategorizationSuggestion> = {}
    for (const s of suggestions) {
      grouped[s.transactionId] = s
    }

    return NextResponse.json({ suggestions: grouped })
  } catch (error) {
    console.error('[ai-categorization] On-demand categorization failed:', error)
    return NextResponse.json(
      { error: 'AI categorization failed' },
      { status: 500 }
    )
  }
}
