import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ number: string }> }
) {
  const { number } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const { data, error } = await supabase
    .from('chart_of_accounts')
    .update({
      account_name: body.account_name,
      is_active: body.is_active,
      description: body.description,
      default_vat_code: body.default_vat_code,
    })
    .eq('user_id', user.id)
    .eq('account_number', number)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
