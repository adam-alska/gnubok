import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateIncomeStatement } from '@/lib/reports/income-statement'
import { generateTrialBalance } from '@/lib/reports/trial-balance'
import { generateARLedger } from '@/lib/reports/ar-ledger'
import { generateMonthlyBreakdown } from '@/lib/reports/monthly-breakdown'
import { calculateCashPosition } from '@/lib/reports/kpi'
import type { KPIReport } from '@/types'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period_id')
  if (!periodId) {
    return NextResponse.json({ error: 'period_id is required' }, { status: 400 })
  }

  const { data: period, error: periodError } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', periodId)
    .eq('user_id', user.id)
    .single()

  if (periodError || !period) {
    return NextResponse.json({ error: 'Fiscal period not found' }, { status: 404 })
  }

  const [incomeStatement, trialBalanceResult, arLedger, monthlyBreakdown] =
    await Promise.all([
      generateIncomeStatement(supabase, user.id, periodId),
      generateTrialBalance(supabase, user.id, periodId),
      generateARLedger(supabase, user.id),
      generateMonthlyBreakdown(supabase, user.id, periodId),
    ])

  // VAT liability from trial balance (output VAT - input VAT)
  const vatOutputAccounts = ['2611', '2621', '2631']
  const vatInputAccounts = ['2641', '2645']
  const outputVat = trialBalanceResult.rows
    .filter((r) => vatOutputAccounts.includes(r.account_number))
    .reduce((sum, r) => sum + (r.closing_credit - r.closing_debit), 0)
  const inputVat = trialBalanceResult.rows
    .filter((r) => vatInputAccounts.includes(r.account_number))
    .reduce((sum, r) => sum + (r.closing_debit - r.closing_credit), 0)

  const report: KPIReport = {
    netResult: incomeStatement.net_result,
    cashPosition: calculateCashPosition(trialBalanceResult.rows),
    outstandingReceivables: arLedger.total_outstanding,
    overdueReceivables: arLedger.total_overdue,
    vatLiability: Math.round((outputVat - inputVat) * 100) / 100,
    totalRevenue: incomeStatement.total_revenue,
    totalExpenses: incomeStatement.total_expenses,
    periodComplete: period.is_closed,
    months: monthlyBreakdown.months,
    period: { start: period.period_start, end: period.period_end },
  }

  return NextResponse.json({ data: report })
}
