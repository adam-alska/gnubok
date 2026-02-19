import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createJournalEntry, findFiscalPeriod } from '@/lib/bookkeeping/engine'
import type { Transaction, Invoice, CreateJournalEntryInput } from '@/types'
import { validateBody, MatchInvoiceInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

interface MatchInvoiceRequest {
  invoice_id: string
}

/**
 * Ensure a fiscal period exists for the given date, create one if needed
 */
async function ensureFiscalPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  date: string
): Promise<string | null> {
  // Check if a fiscal period already covers this date
  const existingPeriodId = await findFiscalPeriod(userId, date)
  if (existingPeriodId) {
    return existingPeriodId
  }

  // No fiscal period exists - create one for the year of the transaction
  const transactionDate = new Date(date)
  const year = transactionDate.getFullYear()

  const periodStart = `${year}-01-01`
  const periodEnd = `${year}-12-31`

  const { data, error } = await supabase
    .from('fiscal_periods')
    .upsert({
      user_id: userId,
      name: `Räkenskapsår ${year}`,
      period_start: periodStart,
      period_end: periodEnd,
    }, {
      onConflict: 'user_id,period_start,period_end',
    })
    .select('id')
    .single()

  if (error) {
    console.error('Failed to create fiscal period:', error)
    return null
  }

  return data?.id || null
}

/**
 * POST /api/transactions/[id]/match-invoice
 *
 * Confirms an invoice match for a transaction:
 * 1. Links transaction to invoice (sets invoice_id)
 * 2. Updates invoice status to 'paid'
 * 3. Sets paid_at and paid_amount on invoice
 * 4. Creates journal entry for payment receipt
 *    - Debit 1930 Företagskonto (Bank)
 *    - Credit 1510 Kundfordringar (Accounts Receivable)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: transactionId } = await params

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  // Parse and validate request body
  const raw = await request.json()
  const validation = validateBody(MatchInvoiceInputSchema, raw)
  if (!validation.success) return validation.response
  const { invoice_id } = validation.data

  // Fetch the transaction (validates ownership)
  const { data: transaction, error: fetchTxError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('user_id', user.id)
    .single()

  if (fetchTxError || !transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // Verify transaction is income (amount > 0)
  if (transaction.amount <= 0) {
    return NextResponse.json(
      { error: 'Only income transactions can be matched to invoices' },
      { status: 400 }
    )
  }

  // Check if transaction is already linked to an invoice
  if (transaction.invoice_id) {
    return NextResponse.json(
      { error: 'Transaction is already linked to an invoice' },
      { status: 400 }
    )
  }

  // Fetch the invoice (validates ownership)
  const { data: invoice, error: fetchInvError } = await supabase
    .from('invoices')
    .select('*, customer:customers(*)')
    .eq('id', invoice_id)
    .eq('user_id', user.id)
    .single()

  if (fetchInvError || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Verify invoice is unpaid
  if (invoice.status !== 'sent' && invoice.status !== 'overdue') {
    return NextResponse.json(
      { error: 'Invoice is not in an unpaid state' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const paidAmount = transaction.amount

  // Create journal entry for payment receipt
  let journalEntryId: string | null = null
  let journalEntryError: string | null = null

  try {
    const fiscalPeriodId = await ensureFiscalPeriod(supabase, user.id, transaction.date)

    if (fiscalPeriodId) {
      const journalInput: CreateJournalEntryInput = {
        fiscal_period_id: fiscalPeriodId,
        entry_date: transaction.date,
        description: `Betalning mottagen: Faktura ${invoice.invoice_number}`,
        source_type: 'invoice_paid',
        source_id: invoice.id,
        lines: [
          {
            account_number: '1930', // Företagskonto (Bank)
            debit_amount: paidAmount,
            credit_amount: 0,
            line_description: `Inbetalning faktura ${invoice.invoice_number}`,
          },
          {
            account_number: '1510', // Kundfordringar (Accounts Receivable)
            debit_amount: 0,
            credit_amount: paidAmount,
            line_description: `Faktura ${invoice.invoice_number} betald`,
          },
        ],
      }

      const journalEntry = await createJournalEntry(user.id, journalInput)
      journalEntryId = journalEntry.id
    }
  } catch (err) {
    console.error('Failed to create payment journal entry:', err)
    journalEntryError = err instanceof Error ? err.message : 'Unknown error'
    // Continue - we still want to update the invoice and transaction
  }

  // Update invoice to paid status
  const { error: updateInvError } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: now,
      paid_amount: paidAmount,
    })
    .eq('id', invoice_id)

  if (updateInvError) {
    console.error('Failed to update invoice:', updateInvError)
    return NextResponse.json(
      { error: 'Failed to update invoice status' },
      { status: 500 }
    )
  }

  // Update transaction to link to invoice and clear potential match
  const { error: updateTxError } = await supabase
    .from('transactions')
    .update({
      invoice_id: invoice_id,
      potential_invoice_id: null,
      journal_entry_id: journalEntryId,
      is_business: true,
      category: 'income_services', // Default to services income
    })
    .eq('id', transactionId)

  if (updateTxError) {
    console.error('Failed to update transaction:', updateTxError)
    return NextResponse.json(
      { error: 'Failed to link transaction to invoice' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    invoice_status: 'paid',
    paid_at: now,
    paid_amount: paidAmount,
    journal_entry_id: journalEntryId,
    journal_entry_error: journalEntryError,
  })
}
