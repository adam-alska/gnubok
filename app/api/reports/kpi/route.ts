import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateIncomeStatement } from '@/lib/reports/income-statement'
import { generateTrialBalance } from '@/lib/reports/trial-balance'
import { generateARLedger } from '@/lib/reports/ar-ledger'
import { generateMonthlyBreakdown } from '@/lib/reports/monthly-breakdown'
import {
  calculateCashPosition,
  calculateGrossMargin,
  calculateExpenseRatio,
  calculateAvgPaymentDays,
} from '@/lib/reports/kpi'
import { mergeWithDefaults } from '@/lib/reports/kpi-definitions'
import type { KPIReport, KPIPreferences } from '@/types'

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

  // Load user preferences for account overrides
  const { data: prefsData } = await supabase
    .from('extension_data')
    .select('value')
    .eq('user_id', user.id)
    .eq('extension_id', 'core/kpi')
    .eq('key', 'preferences')
    .single()

  const preferences = mergeWithDefaults(
    (prefsData?.value as Partial<KPIPreferences>) ?? {}
  )

  const [incomeStatement, trialBalanceResult, arLedger, monthlyBreakdown, paidInvoicesResult] =
    await Promise.all([
      generateIncomeStatement(supabase, user.id, periodId),
      generateTrialBalance(supabase, user.id, periodId),
      generateARLedger(supabase, user.id),
      generateMonthlyBreakdown(supabase, user.id, periodId),
      supabase
        .from('invoices')
        .select('invoice_date, paid_at')
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .not('paid_at', 'is', null),
    ])

  // Cash position — use account overrides if set
  const cashOverrides = preferences.accountOverrides['cashPosition']
  let cashPosition: number
  if (cashOverrides && cashOverrides.length > 0) {
    const cashRows = trialBalanceResult.rows.filter((r) =>
      cashOverrides.includes(r.account_number)
    )
    cashPosition = Math.round(
      cashRows.reduce((sum, r) => sum + (r.closing_debit - r.closing_credit), 0) * 100
    ) / 100
  } else {
    cashPosition = calculateCashPosition(trialBalanceResult.rows)
  }

  // VAT liability — use account overrides if set
  const vatOverrides = preferences.accountOverrides['vatLiability']
  let vatLiability: number
  if (vatOverrides && vatOverrides.length > 0) {
    const outputVat = trialBalanceResult.rows
      .filter((r) => vatOverrides.includes(r.account_number) && r.account_number.startsWith('26') && !r.account_number.startsWith('264'))
      .reduce((sum, r) => sum + (r.closing_credit - r.closing_debit), 0)
    const inputVat = trialBalanceResult.rows
      .filter((r) => vatOverrides.includes(r.account_number) && r.account_number.startsWith('264'))
      .reduce((sum, r) => sum + (r.closing_debit - r.closing_credit), 0)
    vatLiability = Math.round((outputVat - inputVat) * 100) / 100
  } else {
    const vatOutputAccounts = ['2611', '2621', '2631']
    const vatInputAccounts = ['2641', '2645']
    const outputVat = trialBalanceResult.rows
      .filter((r) => vatOutputAccounts.includes(r.account_number))
      .reduce((sum, r) => sum + (r.closing_credit - r.closing_debit), 0)
    const inputVat = trialBalanceResult.rows
      .filter((r) => vatInputAccounts.includes(r.account_number))
      .reduce((sum, r) => sum + (r.closing_debit - r.closing_credit), 0)
    vatLiability = Math.round((outputVat - inputVat) * 100) / 100
  }

  // Avg payment days from paid invoices
  const paidInvoices = (paidInvoicesResult.data ?? []).map((inv) => ({
    invoice_date: inv.invoice_date as string,
    paid_at: inv.paid_at as string,
  }))

  const report: KPIReport = {
    netResult: incomeStatement.net_result,
    cashPosition,
    outstandingReceivables: arLedger.total_outstanding,
    overdueReceivables: arLedger.total_overdue,
    vatLiability,
    totalRevenue: incomeStatement.total_revenue,
    totalExpenses: incomeStatement.total_expenses,
    grossMargin: calculateGrossMargin(incomeStatement),
    expenseRatio: calculateExpenseRatio(incomeStatement),
    avgPaymentDays: calculateAvgPaymentDays(paidInvoices),
    periodComplete: period.is_closed,
    months: monthlyBreakdown.months,
    period: { start: period.period_start, end: period.period_end },
  }

  return NextResponse.json({ data: report })
}
