import type { SupabaseClient } from '@supabase/supabase-js'

export interface ARReconciliationResult {
  ar_ledger_total: number
  account_1510_balance: number
  difference: number
  is_reconciled: boolean
}

/**
 * Compare sum of open customer invoices against account 1510 balance.
 * Account 1510 is debit-normal (asset): balance = debits - credits.
 */
export async function generateARReconciliation(
  supabase: SupabaseClient,
  userId: string,
  periodId: string
): Promise<ARReconciliationResult> {

  // Get total outstanding from customer invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total, paid_amount')
    .eq('user_id', userId)
    .in('status', ['sent', 'overdue'])

  const arLedgerTotal = (invoices || [])
    .reduce((sum, inv) => Math.round((sum + (Number(inv.total) || 0) - (Number(inv.paid_amount) || 0)) * 100) / 100, 0)

  // Get account 1510 balance from posted journal entry lines in this period
  const { data: journalLines } = await supabase
    .from('journal_entry_lines')
    .select(`
      debit_amount,
      credit_amount,
      journal_entry:journal_entries!inner(
        status,
        user_id,
        fiscal_period_id
      )
    `)
    .eq('account_number', '1510')
    .eq('journal_entries.user_id', userId)
    .eq('journal_entries.fiscal_period_id', periodId)
    .eq('journal_entries.status', 'posted')

  // Account 1510 is an asset: debit normal balance
  // Balance = debits - credits
  let account1510Balance = 0
  if (journalLines) {
    for (const line of journalLines) {
      account1510Balance = Math.round((account1510Balance + (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0)) * 100) / 100
    }
  }

  const difference = Math.round((arLedgerTotal - account1510Balance) * 100) / 100

  return {
    ar_ledger_total: Math.round(arLedgerTotal * 100) / 100,
    account_1510_balance: Math.round(account1510Balance * 100) / 100,
    difference,
    is_reconciled: Math.abs(difference) < 0.01,
  }
}
