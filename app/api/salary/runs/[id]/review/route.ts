import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'

ensureInitialized()

/** draft → review (freeze calculations) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const companyId = await requireCompanyId(supabase, user.id)

  const { data: run, error } = await supabase
    .from('salary_runs')
    .update({ status: 'review' })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .select()
    .single()

  if (error || !run) {
    return NextResponse.json({ error: 'Lönekörningen måste vara i utkaststatus' }, { status: 400 })
  }

  return NextResponse.json({ data: run })
}
