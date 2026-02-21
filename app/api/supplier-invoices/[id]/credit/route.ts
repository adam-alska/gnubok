import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createSupplierCreditNoteEntry } from '@/lib/bookkeeping/supplier-invoice-entries'
import type { SupplierInvoice, SupplierInvoiceItem, AccountingMethod } from '@/types'

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

  // Fetch original invoice with supplier and items
  const { data: original, error: fetchError } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(*), items:supplier_invoice_items(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (original.status === 'credited') {
    return NextResponse.json(
      { error: 'Fakturan har redan krediterats' },
      { status: 400 }
    )
  }

  // Get next arrival number
  const { data: arrivalNum } = await supabase
    .rpc('get_next_arrival_number', { p_user_id: user.id })

  // Create credit note invoice (negative amounts)
  const { data: creditNote, error: creditError } = await supabase
    .from('supplier_invoices')
    .insert({
      user_id: user.id,
      supplier_id: original.supplier_id,
      arrival_number: arrivalNum,
      supplier_invoice_number: `KREDIT-${original.supplier_invoice_number}`,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date().toISOString().split('T')[0],
      status: 'registered',
      currency: original.currency,
      exchange_rate: original.exchange_rate,
      vat_treatment: original.vat_treatment,
      reverse_charge: original.reverse_charge,
      subtotal: original.subtotal,
      subtotal_sek: original.subtotal_sek,
      vat_amount: original.vat_amount,
      vat_amount_sek: original.vat_amount_sek,
      total: original.total,
      total_sek: original.total_sek,
      remaining_amount: 0,
      is_credit_note: true,
      credited_invoice_id: id,
    })
    .select()
    .single()

  if (creditError || !creditNote) {
    return NextResponse.json({ error: creditError?.message || 'Failed to create credit note' }, { status: 500 })
  }

  // Copy items to credit note
  const creditItems = (original.items || []).map((item: SupplierInvoiceItem) => ({
    supplier_invoice_id: creditNote.id,
    sort_order: item.sort_order,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    line_total: item.line_total,
    account_number: item.account_number,
    vat_code: item.vat_code,
    vat_rate: item.vat_rate,
    vat_amount: item.vat_amount,
  }))

  await supabase.from('supplier_invoice_items').insert(creditItems)

  // Fetch accounting method
  const { data: settings } = await supabase
    .from('company_settings')
    .select('accounting_method')
    .eq('user_id', user.id)
    .single()

  const accountingMethod = (settings?.accounting_method as AccountingMethod) || 'accrual'

  // Create credit note journal entry (accrual only)
  // Cash method: skip — no original registration entry exists to reverse; deferred until refund
  let journalEntryId: string | null = null
  if (accountingMethod === 'accrual') {
    try {
      const journalEntry = await createSupplierCreditNoteEntry(
        user.id,
        creditNote as SupplierInvoice,
        creditItems as SupplierInvoiceItem[],
        original.supplier?.supplier_type || 'swedish_business'
      )
      if (journalEntry) {
        journalEntryId = journalEntry.id
        await supabase
          .from('supplier_invoices')
          .update({ registration_journal_entry_id: journalEntry.id })
          .eq('id', creditNote.id)
      }
    } catch (err) {
      console.error('Failed to create credit note journal entry:', err)
    }
  }

  // Update original invoice: reduce remaining_amount
  const newRemaining = Math.max(0, original.remaining_amount - original.total)
  const newStatus = newRemaining <= 0 ? 'credited' : original.status

  await supabase
    .from('supplier_invoices')
    .update({
      status: newStatus,
      remaining_amount: newRemaining,
    })
    .eq('id', id)

  return NextResponse.json({
    data: creditNote,
    journal_entry_id: journalEntryId,
  })
}
