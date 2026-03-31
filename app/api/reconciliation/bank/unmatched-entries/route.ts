import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchUnlinkedGLLines } from '@/lib/reconciliation/bank-reconciliation'
import { requireCompanyId } from '@/lib/company/context'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get('date_from') || undefined
  const dateTo = searchParams.get('date_to') || undefined

  const lines = await fetchUnlinkedGLLines(supabase, companyId, dateFrom, dateTo)

  return NextResponse.json({ data: lines })
}
