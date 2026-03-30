import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { lockPeriod } from '@/lib/core/bookkeeping/period-service'
import { requireCompanyId } from '@/lib/company/context'

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

  const companyId = await requireCompanyId(supabase, user.id)

  try {
    const period = await lockPeriod(supabase, companyId, user.id, id)
    return NextResponse.json({ data: period })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to lock period' },
      { status: 400 }
    )
  }
}
