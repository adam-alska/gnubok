import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { correctEntry } from '@/lib/core/bookkeeping/storno-service'
import { ensureInitialized } from '@/lib/init'
import { validateBody } from '@/lib/api/validate'
import { CorrectJournalEntrySchema } from '@/lib/api/schemas'
import { requireCompanyId } from '@/lib/company/context'

ensureInitialized()

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

  const validation = await validateBody(request, CorrectJournalEntrySchema)
  if (!validation.success) return validation.response
  const body = validation.data

  try {
    const result = await correctEntry(supabase, companyId, user.id, id, body.lines)
    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to correct entry' },
      { status: 400 }
    )
  }
}
