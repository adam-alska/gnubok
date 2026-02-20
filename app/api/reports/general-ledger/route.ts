import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateGeneralLedger } from '@/lib/reports/general-ledger'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period_id')
  const accountFrom = searchParams.get('account_from') || undefined
  const accountTo = searchParams.get('account_to') || undefined

  if (!periodId) {
    return NextResponse.json({ error: 'period_id is required' }, { status: 400 })
  }

  const data = await generateGeneralLedger(user.id, periodId, accountFrom, accountTo)

  return NextResponse.json({ data })
}
