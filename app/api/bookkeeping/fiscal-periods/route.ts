import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { CreateFiscalPeriodInput } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('user_id', user.id)
    .order('period_start', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as CreateFiscalPeriodInput

  const { data, error } = await supabase
    .from('fiscal_periods')
    .insert({
      user_id: user.id,
      name: body.name,
      period_start: body.period_start,
      period_end: body.period_end,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
