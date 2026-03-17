import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  createInvoicePaymentJournalEntry,
  createInvoiceCashEntry,
} from '@/lib/bookkeeping/invoice-entries'
import { createJournalEntry, findFiscalPeriod } from '@/lib/bookkeeping/engine'
import { MarkInvoicePaidSchema } from '@/lib/api/schemas'
import { ensureInitialized } from '@/lib/init'
import type { CreateJournalEntryInput, EntityType, Invoice } from '@/types'

ensureInitialized()

/**
 * POST /api/invoices/[id]/mark-paid
 *
 * Manually marks an invoice as paid (for payments received outside bank sync).
 *
 * Faktureringsmetoden (accrual):
 *   Creates payment clearing entry: Debit 1930, Credit 1510
 *
 * Kontantmetoden (cash):
 *   Creates combined revenue entry: Debit 1930, Credit 30xx, Credit 26xx
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*, customer:customers(*), items:invoice_items(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'Fakturan hittades inte' }, { status: 404 })
  }

  if (invoice.status !== 'sent' && invoice.status !== 'overdue') {
    return NextResponse.json(
      { error: 'Fakturan kan inte markeras som betald i nuvarande status' },
      { status: 400 }
    )
  }

  // Parse optional body (backward compatible — body may be empty)
  let exchangeRateDifference: number | undefined
  let bodyPaymentDate: string | undefined
  let customLines: { account_number: string; debit_amount: number; credit_amount: number; line_description?: string }[] | undefined
  let rawBody: unknown
  try {
    const text = await request.text()
    if (text) rawBody = JSON.parse(text)
  } catch {
    // No body or invalid JSON — use defaults
  }

  if (rawBody) {
    const parsed = MarkInvoicePaidSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Ogiltig förfrågan', details: parsed.error.flatten() }, { status: 400 })
    }
    exchangeRateDifference = parsed.data.exchange_rate_difference
    bodyPaymentDate = parsed.data.payment_date
    customLines = parsed.data.lines
  }

  const now = new Date().toISOString()
  const paymentDate = bodyPaymentDate || now.split('T')[0]

  // Fetch accounting method
  const { data: settings } = await supabase
    .from('company_settings')
    .select('accounting_method, entity_type')
    .eq('user_id', user.id)
    .single()

  const accountingMethod = settings?.accounting_method || 'accrual'
  const entityType = (settings?.entity_type as EntityType) || 'enskild_firma'

  // Create journal entry FIRST — only mark paid if accounting succeeds
  const isRealInvoice = !invoice.document_type || invoice.document_type === 'invoice'
  let journalEntryId: string | null = null

  if (isRealInvoice) {
    try {
    if (customLines) {
      // Server-side balance validation — never commit imbalanced entries
      const totalDebit = customLines.reduce((s, l) => s + l.debit_amount, 0)
      const totalCredit = customLines.reduce((s, l) => s + l.credit_amount, 0)
      if (Math.round((totalDebit - totalCredit) * 100) !== 0 || totalDebit <= 0) {
        return NextResponse.json(
          { error: 'Verifikationsraderna är inte balanserade (debet ≠ kredit)' },
          { status: 400 }
        )
      }

      // User-provided lines from PaymentBookingDialog
      const fiscalPeriodId = await findFiscalPeriod(supabase, user.id, paymentDate)
      if (!fiscalPeriodId) {
        return NextResponse.json(
          { error: 'Ingen öppen räkenskapsperiod för betalningsdatumet' },
          { status: 400 }
        )
      }
      const sourceType = accountingMethod === 'accrual' ? 'invoice_paid' : 'invoice_cash_payment'
      const input: CreateJournalEntryInput = {
        fiscal_period_id: fiscalPeriodId,
        entry_date: paymentDate,
        description: `Betalning faktura ${invoice.invoice_number}`,
        source_type: sourceType,
        source_id: invoice.id,
        lines: customLines,
      }
      const journalEntry = await createJournalEntry(supabase, user.id, input)
      journalEntryId = journalEntry?.id ?? null
    } else if (accountingMethod === 'accrual') {
      // Faktureringsmetoden: clear receivable (Debit 1930, Credit 1510)
      const journalEntry = await createInvoicePaymentJournalEntry(
        supabase,
        user.id,
        invoice as Invoice,
        paymentDate,
        exchangeRateDifference
      )
      journalEntryId = journalEntry?.id ?? null
    } else {
      // Kontantmetoden: combined revenue entry (Debit 1930, Credit 30xx, Credit 26xx)
      const journalEntry = await createInvoiceCashEntry(
        supabase,
        user.id,
        invoice as Invoice,
        paymentDate,
        entityType
      )
      journalEntryId = journalEntry?.id ?? null
    }
    } catch (err) {
      console.error('Failed to create payment journal entry:', err)
      return NextResponse.json(
        { error: 'Kunde inte bokföra betalningen' },
        { status: 500 }
      )
    }
  }

  // Update status to paid — only after journal entry succeeds
  const { error: updateError } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: now,
      paid_amount: invoice.total,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: 'Kunde inte uppdatera status' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    status: 'paid',
    paid_at: now,
    paid_amount: invoice.total,
    journal_entry_id: journalEntryId,
  })
}
