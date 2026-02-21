import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getReconciliationStatus } from '@/lib/reconciliation/bank-reconciliation'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get('date_from') || undefined
  const dateTo = searchParams.get('date_to') || undefined

  const status = await getReconciliationStatus(supabase, user.id, dateFrom, dateTo)

  return NextResponse.json({ data: status })
}
