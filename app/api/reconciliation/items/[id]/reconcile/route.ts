import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, ReconcileItemSchema } from '@/lib/validation'
import {
  reconcileTransaction,
  createJournalEntryFromReconciliation,
} from '@/lib/reconciliation/reconciliation-engine'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const { id } = await params
  const raw = await request.json()
  const validation = validateBody(ReconcileItemSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  try {
    // Reconcile the transaction
    const matchId = body.matched_invoice_id || body.matched_supplier_invoice_id
    const item = await reconcileTransaction(
      user.id,
      id,
      body.match_type,
      matchId,
      body.notes
    )

    // Create journal entry if accounts are provided
    let journalEntryId: string | null = null
    if (body.debit_account && body.credit_account) {
      try {
        journalEntryId = await createJournalEntryFromReconciliation(
          user.id,
          id,
          body.debit_account,
          body.credit_account,
          body.description
        )
      } catch (err) {
        console.error('Failed to create journal entry:', err)
        // Non-critical - reconciliation still succeeded
      }
    }

    // If matched to an invoice, mark the invoice as paid
    if (body.matched_invoice_id) {
      const tx = item.transaction
      if (tx) {
        await supabase
          .from('invoices')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            paid_amount: Math.abs(tx.amount),
          })
          .eq('id', body.matched_invoice_id)
          .eq('user_id', user.id)

        // Link transaction to invoice
        await supabase
          .from('transactions')
          .update({ invoice_id: body.matched_invoice_id })
          .eq('id', tx.id)
      }
    }

    // If matched to a supplier invoice, mark it as paid
    if (body.matched_supplier_invoice_id) {
      const tx = item.transaction
      if (tx) {
        await supabase
          .from('supplier_invoices')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            paid_amount: Math.abs(tx.amount),
          })
          .eq('id', body.matched_supplier_invoice_id)
          .eq('user_id', user.id)
      }
    }

    return NextResponse.json({
      data: {
        item,
        journal_entry_id: journalEntryId,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte avstamma transaktion' },
      { status: 400 }
    )
  }
}
