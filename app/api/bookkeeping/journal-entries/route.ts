import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createJournalEntry } from '@/lib/bookkeeping/engine'
import { ensureInitialized } from '@/lib/init'
import { validateBody } from '@/lib/api/validate'
import { CreateJournalEntrySchema } from '@/lib/api/schemas'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'

ensureInitialized()

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period_id')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const sortDate = searchParams.get('sort_date') // 'asc' | 'desc'

  const dateAscending = sortDate === 'asc'

  let query = supabase
    .from('journal_entries')
    .select('*, lines:journal_entry_lines(*)', { count: 'exact' })
    .eq('company_id', companyId)

  if (sortDate === 'asc' || sortDate === 'desc') {
    query = query
      .order('entry_date', { ascending: dateAscending })
      .order('voucher_number', { ascending: dateAscending })
  } else {
    query = query
      .order('voucher_series', { ascending: true })
      .order('voucher_number', { ascending: true })
  }

  query = query.range(offset, offset + limit - 1)

  if (periodId) {
    query = query.eq('fiscal_period_id', periodId)
  }

  if (status) {
    query = query.eq('status', status)
  }

  if (dateFrom) {
    query = query.gte('entry_date', dateFrom)
  }

  if (dateTo) {
    query = query.lte('entry_date', dateTo)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, count })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const companyId = await requireCompanyId(supabase, user.id)

  const validation = await validateBody(request, CreateJournalEntrySchema)
  if (!validation.success) return validation.response
  const body = validation.data

  try {
    const entry = await createJournalEntry(supabase, companyId, user.id, body)
    return NextResponse.json({ data: entry })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create journal entry' },
      { status: 400 }
    )
  }
}
