import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getBestInvoiceMatch } from '@/lib/invoice/invoice-matching'
import type { Transaction } from '@/types'

/**
 * POST /api/transactions/batch-match-invoices
 * Run invoice matching for all uncategorized income transactions without potential_invoice_id
 */
export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch uncategorized income transactions without a potential match
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .is('is_business', null)
    .gt('amount', 0)
    .is('potential_invoice_id', null)
    .is('invoice_id', null)
    .order('date', { ascending: false })
    .limit(50)

  if (txError || !transactions) {
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  let matched = 0

  for (const tx of transactions) {
    try {
      const bestMatch = await getBestInvoiceMatch(
        user.id,
        tx as Transaction,
        0.50
      )

      if (bestMatch) {
        await supabase
          .from('transactions')
          .update({ potential_invoice_id: bestMatch.invoice.id })
          .eq('id', tx.id)

        matched++
      }
    } catch {
      // Continue with other transactions
    }
  }

  return NextResponse.json({
    processed: transactions.length,
    matched,
  })
}
