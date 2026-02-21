import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ number: string }> }
) {
  const { number } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch the account to check if it's a system account
  const { data: account, error: fetchError } = await supabase
    .from('chart_of_accounts')
    .select('id, is_system_account')
    .eq('user_id', user.id)
    .eq('account_number', number)
    .single()

  if (fetchError || !account) {
    return NextResponse.json({ error: 'Kontot hittades inte' }, { status: 404 })
  }

  if (account.is_system_account) {
    return NextResponse.json(
      { error: 'Systemkonton kan inte tas bort' },
      { status: 400 }
    )
  }

  // Check if account is referenced in posted journal entries
  const { count } = await supabase
    .from('journal_entry_lines')
    .select('id', { count: 'exact', head: true })
    .eq('account_number', number)

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Kontot kan inte tas bort eftersom det används i bokförda verifikationer. Inaktivera det istället.' },
      { status: 400 }
    )
  }

  const { error: deleteError } = await supabase
    .from('chart_of_accounts')
    .delete()
    .eq('id', account.id)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

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

  // Build update object with only provided fields
  const updates: Record<string, unknown> = {}
  if (body.account_name !== undefined) updates.account_name = body.account_name
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.description !== undefined) updates.description = body.description
  if (body.default_vat_code !== undefined) updates.default_vat_code = body.default_vat_code
  if (body.sru_code !== undefined) updates.sru_code = body.sru_code

  const { data, error } = await supabase
    .from('chart_of_accounts')
    .update(updates)
    .eq('user_id', user.id)
    .eq('account_number', number)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
