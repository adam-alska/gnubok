import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, SplitTransactionSchema } from '@/lib/validation'
import { splitTransaction } from '@/lib/reconciliation/reconciliation-engine'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const { id } = await params
  const raw = await request.json()
  const validation = validateBody(SplitTransactionSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  try {
    const journalEntryIds = await splitTransaction(
      user.id,
      id,
      body.splits.map(s => ({
        amount: s.amount,
        description: s.description,
        debitAccount: s.debit_account,
        creditAccount: s.credit_account,
      }))
    )

    return NextResponse.json({
      data: {
        journal_entry_ids: journalEntryIds,
        splits_count: body.splits.length,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte dela transaktion' },
      { status: 400 }
    )
  }
}
