import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { eventBus } from '@/lib/events'
import { ensureInitialized } from '@/lib/init'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'
import type { SupplierInvoice } from '@/types'

ensureInitialized()

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

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const companyId = await requireCompanyId(supabase, user.id)

  const { data: invoice } = await supabase
    .from('supplier_invoices')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
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
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    await eventBus.emit({
      type: 'supplier_invoice.approved',
      payload: { supplierInvoice: data as SupplierInvoice, companyId, userId: user.id },
    })
  } catch {
    // Non-blocking
  }

  return NextResponse.json({ data })
}
