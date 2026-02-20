import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: invoice } = await supabase
    .from('supplier_invoices')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!invoice) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (invoice.status !== 'registered') {
    return NextResponse.json(
      { error: 'Kan bara godkänna registrerade fakturor' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('supplier_invoices')
    .update({ status: 'approved' })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
