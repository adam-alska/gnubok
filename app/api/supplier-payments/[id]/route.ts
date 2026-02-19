import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { createSupplierPaymentJournalEntry } from '@/lib/suppliers/supplier-invoice-booking'
import type { SupplierInvoice } from '@/types/suppliers'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const { data, error } = await supabase
    .from('supplier_payments')
    .select(`
      *,
      items:supplier_payment_items(
        *,
        supplier_invoice:supplier_invoices(
          id, invoice_number, total, currency,
          supplier:suppliers(id, name, bankgiro, plusgiro)
        )
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Betalning hittades inte' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: patchRl, remaining: patchRem, reset: patchReset } = apiLimiter.check(user.id)
  if (!patchRl) return rateLimitResponse(patchReset)

  const body = await request.json()

  // Fetch current payment
  const { data: current, error: currentError } = await supabase
    .from('supplier_payments')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (currentError || !current) {
    return NextResponse.json({ error: 'Betalning hittades inte' }, { status: 404 })
  }

  // Validate status transitions
  if (body.status) {
    const validTransitions: Record<string, string[]> = {
      draft: ['approved'],
      approved: ['sent', 'draft'],
      sent: ['confirmed'],
      confirmed: [],
    }

    const allowed = validTransitions[current.status] || []
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Kan inte ändra status från "${current.status}" till "${body.status}"` },
        { status: 400 }
      )
    }
  }

  const updateData: Record<string, unknown> = {}
  if (body.status !== undefined) updateData.status = body.status
  if (body.payment_date !== undefined) updateData.payment_date = body.payment_date

  const { data, error } = await supabase
    .from('supplier_payments')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If confirmed, mark all invoices as paid and create journal entries
  if (body.status === 'confirmed') {
    const { data: paymentItems } = await supabase
      .from('supplier_payment_items')
      .select('supplier_invoice_id, amount')
      .eq('payment_id', id)

    if (paymentItems) {
      for (const item of paymentItems) {
        if (!item.supplier_invoice_id) continue

        // Update invoice status to paid
        await supabase
          .from('supplier_invoices')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            paid_amount: item.amount,
          })
          .eq('id', item.supplier_invoice_id)
          .eq('user_id', user.id)

        // Create payment journal entry
        try {
          const { data: invoice } = await supabase
            .from('supplier_invoices')
            .select('*, supplier:suppliers(name)')
            .eq('id', item.supplier_invoice_id)
            .single()

          if (invoice) {
            await createSupplierPaymentJournalEntry(
              user.id,
              invoice as SupplierInvoice,
              data.payment_date
            )
          }
        } catch (err) {
          console.error('Failed to create payment journal entry:', err)
        }
      }
    }
  }

  return NextResponse.json({ data })
}
