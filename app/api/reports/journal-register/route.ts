import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateJournalRegister } from '@/lib/reports/journal-register'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period_id')

  if (!periodId) {
    return NextResponse.json({ error: 'period_id is required' }, { status: 400 })
  }

  const data = await generateJournalRegister(user.id, periodId)

  return NextResponse.json({ data })
}
