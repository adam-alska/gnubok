import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { ensureInitialized } from '@/lib/init'
import { eventBus } from '@/lib/events/bus'
import { createSupplierInvoiceRegistrationEntry } from '@/lib/bookkeeping/supplier-invoice-entries'
import type { InvoiceExtractionResult } from '@/extensions/general/invoice-inbox/types'
import type { SupplierInvoice, SupplierInvoiceItem } from '@/types'

ensureInitialized()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Fetch inbox item
  const { data: inboxItem, error: findError } = await supabase
    .from('invoice_inbox_items')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (findError || !inboxItem) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (inboxItem.status === 'confirmed') {
    return NextResponse.json({ error: 'Already confirmed' }, { status: 400 })
  }

  if (!inboxItem.extracted_data) {
    return NextResponse.json({ error: 'No extracted data available' }, { status: 400 })
  }

  const extraction = inboxItem.extracted_data as unknown as InvoiceExtractionResult
  const body = await request.json().catch(() => ({}))

  try {
    // Resolve supplier: use matched, use body override, or create new
    let supplierId = body.supplier_id || inboxItem.matched_supplier_id

    if (!supplierId) {
      // Create new supplier from extracted data
      const supplierName = extraction.supplier.name
      if (!supplierName) {
        return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 })
      }

      const { data: newSupplier, error: supplierError } = await supabase
        .from('suppliers')
        .insert({
          user_id: user.id,
          name: supplierName,
          supplier_type: 'swedish_business',
          org_number: extraction.supplier.orgNumber || null,
          vat_number: extraction.supplier.vatNumber || null,
          bankgiro: extraction.supplier.bankgiro || null,
          plusgiro: extraction.supplier.plusgiro || null,
          default_expense_account: '6200',
          default_payment_terms: 30,
          default_currency: extraction.invoice.currency || 'SEK',
        })
        .select()
        .single()

      if (supplierError || !newSupplier) {
        return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
      }

      supplierId = newSupplier.id
    }

    // Verify supplier exists and belongs to user
    const { data: supplier, error: supplierCheckError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .eq('user_id', user.id)
      .single()

    if (supplierCheckError || !supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    // Get next arrival number
    const { data: arrivalNum, error: arrivalError } = await supabase
      .rpc('get_next_arrival_number', { p_user_id: user.id })

    if (arrivalError) {
      return NextResponse.json({ error: 'Failed to get arrival number' }, { status: 500 })
    }

    // Build line items from extraction
    const items = extraction.lineItems.map((item, index) => {
      const vatRate = item.vatRate != null ? item.vatRate / 100 : 0.25
      const lineTotal = Math.round(item.lineTotal * 100) / 100
      const vatAmount = Math.round(lineTotal * vatRate * 100) / 100
      return {
        sort_order: index,
        description: item.description,
        quantity: item.quantity || 1,
        unit: 'st',
        unit_price: item.unitPrice != null ? item.unitPrice : lineTotal,
        line_total: lineTotal,
        account_number: item.accountSuggestion || supplier.default_expense_account || '6200',
        vat_code: null,
        vat_rate: vatRate,
        vat_amount: vatAmount,
      }
    })

    // If no line items, create a single item from totals
    if (items.length === 0 && extraction.totals.total) {
      const total = extraction.totals.total
      const vatAmount = extraction.totals.vatAmount || 0
      const subtotal = extraction.totals.subtotal || total - vatAmount
      const vatRate = subtotal > 0 ? Math.round((vatAmount / subtotal) * 100) / 100 : 0.25
      items.push({
        sort_order: 0,
        description: 'Fakturabelopp',
        quantity: 1,
        unit: 'st',
        unit_price: subtotal,
        line_total: subtotal,
        account_number: supplier.default_expense_account || '6200',
        vat_code: null,
        vat_rate: vatRate,
        vat_amount: Math.round(vatAmount * 100) / 100,
      })
    }

    const subtotal = items.reduce((sum, i) => sum + i.line_total, 0)
    const vatAmount = items.reduce((sum, i) => sum + i.vat_amount, 0)
    const total = Math.round((subtotal + vatAmount) * 100) / 100

    // Determine VAT treatment
    const primaryVatRate = items[0]?.vat_rate || 0.25
    let vatTreatment = 'standard_25'
    if (primaryVatRate === 0.12) vatTreatment = 'reduced_12'
    else if (primaryVatRate === 0.06) vatTreatment = 'reduced_6'
    else if (primaryVatRate === 0) vatTreatment = 'exempt'

    // Insert supplier invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('supplier_invoices')
      .insert({
        user_id: user.id,
        supplier_id: supplierId,
        arrival_number: arrivalNum,
        supplier_invoice_number: extraction.invoice.invoiceNumber || `INBOX-${Date.now()}`,
        invoice_date: extraction.invoice.invoiceDate || new Date().toISOString().split('T')[0],
        due_date: extraction.invoice.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        status: 'registered',
        currency: extraction.invoice.currency || 'SEK',
        vat_treatment: vatTreatment,
        payment_reference: extraction.invoice.paymentReference || null,
        subtotal: Math.round(subtotal * 100) / 100,
        vat_amount: Math.round(vatAmount * 100) / 100,
        total: Math.round(total * 100) / 100,
        remaining_amount: Math.round(total * 100) / 100,
        document_id: inboxItem.document_id || null,
        notes: body.notes || null,
      })
      .select()
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: invoiceError?.message || 'Failed to create invoice' }, { status: 500 })
    }

    // Insert line items
    const itemInserts = items.map((item) => ({
      supplier_invoice_id: invoice.id,
      ...item,
    }))

    const { error: itemsError } = await supabase
      .from('supplier_invoice_items')
      .insert(itemInserts)

    if (itemsError) {
      await supabase.from('supplier_invoices').delete().eq('id', invoice.id)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }

    // Accrual method: create registration journal entry
    const { data: settings } = await supabase
      .from('company_settings')
      .select('accounting_method')
      .eq('user_id', user.id)
      .single()

    const accountingMethod = settings?.accounting_method || 'accrual'
    let registrationJournalEntryId: string | null = null

    if (accountingMethod === 'accrual') {
      try {
        const journalEntry = await createSupplierInvoiceRegistrationEntry(
          user.id,
          invoice as SupplierInvoice,
          items as SupplierInvoiceItem[],
          supplier.supplier_type
        )
        if (journalEntry) {
          registrationJournalEntryId = journalEntry.id
          await supabase
            .from('supplier_invoices')
            .update({ registration_journal_entry_id: journalEntry.id })
            .eq('id', invoice.id)
        }
      } catch (err) {
        console.error('[invoice-inbox] Failed to create registration journal entry:', err)
      }
    }

    // Update inbox item as confirmed
    await supabase
      .from('invoice_inbox_items')
      .update({
        status: 'confirmed',
        matched_supplier_id: supplierId,
        created_supplier_invoice_id: invoice.id,
      })
      .eq('id', inboxItem.id)

    // Emit confirmed event
    try {
      await eventBus.emit({
        type: 'supplier_invoice.confirmed',
        payload: {
          inboxItem: { ...inboxItem, status: 'confirmed' },
          supplierInvoice: invoice as SupplierInvoice,
          userId: user.id,
        },
      })
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      data: {
        ...invoice,
        items: itemInserts,
        registration_journal_entry_id: registrationJournalEntryId,
      },
    })
  } catch (error) {
    console.error('[invoice-inbox] Confirm failed:', error)
    return NextResponse.json({ error: 'Confirmation failed' }, { status: 500 })
  }
}
