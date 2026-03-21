import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateIncomeStatement } from '@/lib/reports/income-statement'
import { generateTrialBalance } from '@/lib/reports/trial-balance'
import { generateARLedger } from '@/lib/reports/ar-ledger'
import { generateMonthlyBreakdown } from '@/lib/reports/monthly-breakdown'
import {
  calculateGrossMargin,
  calculateCashPosition,
  calculateRevenueGrowth,
  calculateExpenseRatio,
  calculateAvgPaymentDays,
} from '@/lib/reports/kpi'
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

  // Fetch fiscal period info
  const { data: period, error: periodError } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', periodId)
    .eq('user_id', user.id)
    .single()

  if (periodError || !period) {
    return NextResponse.json({ error: 'Fiscal period not found' }, { status: 404 })
  }

  // Run independent queries in parallel
  const [
    incomeStatement,
    trialBalanceResult,
    arLedger,
    monthlyBreakdown,
    paidInvoicesResult,
  ] = await Promise.all([
    generateIncomeStatement(supabase, user.id, periodId),
    generateTrialBalance(supabase, user.id, periodId),
    generateARLedger(supabase, user.id),
    generateMonthlyBreakdown(supabase, user.id, periodId),
    supabase
      .from('invoices')
      .select('invoice_date, paid_at')
      .eq('user_id', user.id)
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .gte('invoice_date', period.period_start)
      .lte('invoice_date', period.period_end),
  ])

  const paidInvoices = (paidInvoicesResult.data || []) as { invoice_date: string; paid_at: string }[]

  // Calculate VAT liability from trial balance (output VAT - input VAT)
  const vatOutputAccounts = ['2611', '2621', '2631']
  const vatInputAccounts = ['2641', '2645']
  const outputVat = trialBalanceResult.rows
    .filter((r) => vatOutputAccounts.includes(r.account_number))
    .reduce((sum, r) => sum + (r.closing_credit - r.closing_debit), 0)
  const inputVat = trialBalanceResult.rows
    .filter((r) => vatInputAccounts.includes(r.account_number))
    .reduce((sum, r) => sum + (r.closing_debit - r.closing_credit), 0)
  const vatLiability = Math.round((outputVat - inputVat) * 100) / 100

  // Revenue growth: only for closed periods, compare with previous period
  let revenueGrowth: number | null = null
  if (period.is_closed && period.previous_period_id) {
    const prevStatement = await generateIncomeStatement(
      supabase,
      user.id,
      period.previous_period_id
    )
    revenueGrowth = calculateRevenueGrowth(
      incomeStatement.total_revenue,
      prevStatement.total_revenue
    )
  }

  const report: KPIReport = {
    grossMargin: calculateGrossMargin(incomeStatement),
    netResult: incomeStatement.net_result,
    cashPosition: calculateCashPosition(trialBalanceResult.rows),
    outstandingReceivables: arLedger.total_outstanding,
    overdueReceivables: arLedger.total_overdue,
    revenueGrowth,
    expenseRatio: calculateExpenseRatio(incomeStatement),
    avgPaymentDays: calculateAvgPaymentDays(paidInvoices),
    paidInvoiceCount: paidInvoices.length,
    vatLiability,
    totalRevenue: incomeStatement.total_revenue,
    totalExpenses: incomeStatement.total_expenses,
    periodComplete: period.is_closed,
    months: monthlyBreakdown.months,
    period: { start: period.period_start, end: period.period_end },
  }

  return NextResponse.json({ data: report })
}
