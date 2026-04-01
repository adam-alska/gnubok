import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getOpeningBalances } from '@/lib/reports/opening-balances'
import { requireCompanyId } from '@/lib/company/context'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)
  const { id } = await params

  // Fetch the fiscal period
  const { data: period, error: periodError } = await supabase
    .from('fiscal_periods')
    .select('period_start, opening_balance_entry_id')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (periodError || !period) {
    return NextResponse.json({ error: 'Fiscal period not found' }, { status: 404 })
  }

  // Get opening balances
  const { balances } = await getOpeningBalances(supabase, companyId, period)

  // Fetch account names for the accounts that have balances
  const accountNumbers = Array.from(balances.keys())

  if (accountNumbers.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('account_number, account_name')
    .eq('company_id', companyId)
    .in('account_number', accountNumbers)

  const accountNameMap = new Map(
    (accounts || []).map(a => [a.account_number, a.account_name])
  )

  // Build response with account names and net balances
  const data = accountNumbers
    .sort()
    .map(accountNumber => {
      const bal = balances.get(accountNumber)!
      const net = Math.round((bal.debit - bal.credit) * 100) / 100
      return {
        account_number: accountNumber,
        account_name: accountNameMap.get(accountNumber) || accountNumber,
        balance: net,
      }
    })
    .filter(row => row.balance !== 0)

  return NextResponse.json({ data })
}
