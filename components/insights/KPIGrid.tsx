'use client'

import KPIMetricCard from './KPIMetricCard'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Clock,
  Scale,
  Flame,
} from 'lucide-react'
import type { KPISnapshot } from '@/types/financial-insights'

interface KPIGridProps {
  current: KPISnapshot
  previous?: KPISnapshot | null
}

function formatSEK(amount: number): string {
  if (Math.abs(amount) >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M kr`
  }
  if (Math.abs(amount) >= 1000) {
    return `${Math.round(amount / 1000)}k kr`
  }
  return `${amount} kr`
}

function calcChange(current: number, previous: number | undefined): { direction: 'up' | 'down' | 'flat'; value: string } | undefined {
  if (previous === undefined || previous === 0) return undefined
  const change = ((current - previous) / Math.abs(previous)) * 100
  if (Math.abs(change) < 1) return { direction: 'flat', value: '0%' }
  return {
    direction: change > 0 ? 'up' : 'down',
    value: `${change > 0 ? '+' : ''}${Math.round(change)}%`,
  }
}

export default function KPIGrid({ current, previous }: KPIGridProps) {
  const revenueChange = calcChange(current.revenue, previous?.revenue)
  const expensesChange = calcChange(current.expenses, previous?.expenses)
  const marginChange = calcChange(current.operating_margin_pct, previous?.operating_margin_pct)

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KPIMetricCard
        label="Intakter YTD"
        value={formatSEK(current.revenue)}
        icon={TrendingUp}
        variant="highlight"
        trend={revenueChange ? { ...revenueChange, positive: revenueChange.direction === 'up' } : undefined}
      />
      <KPIMetricCard
        label="Kostnader YTD"
        value={formatSEK(current.expenses)}
        icon={TrendingDown}
        trend={expensesChange ? { ...expensesChange, positive: expensesChange.direction === 'down' } : undefined}
      />
      <KPIMetricCard
        label="Nettoresultat"
        value={formatSEK(current.net_income)}
        icon={DollarSign}
        variant={current.net_income >= 0 ? 'default' : 'danger'}
        subValue={`Marginal ${current.operating_margin_pct}%`}
        trend={marginChange ? { ...marginChange, positive: marginChange.direction === 'up' } : undefined}
      />
      <KPIMetricCard
        label="Kassabehallning"
        value={formatSEK(current.cash_balance)}
        icon={Wallet}
        variant={current.cash_balance > 0 ? 'default' : 'danger'}
      />
      <KPIMetricCard
        label="Kundfordringar"
        value={formatSEK(current.accounts_receivable)}
        icon={Receipt}
        subValue={`${current.invoice_count} fakturor`}
      />
      <KPIMetricCard
        label="DSO"
        value={`${current.days_sales_outstanding} dagar`}
        icon={Clock}
        subValue="Genomsnittlig betalningstid"
        variant={current.days_sales_outstanding > 45 ? 'warning' : 'default'}
      />
      <KPIMetricCard
        label="Likviditetskvot"
        value={`${current.current_ratio}x`}
        icon={Scale}
        subValue={current.current_ratio >= 1.5 ? 'God likviditet' : current.current_ratio >= 1 ? 'Acceptabel' : 'Lag likviditet'}
        variant={current.current_ratio < 1 ? 'danger' : current.current_ratio < 1.5 ? 'warning' : 'default'}
      />
      {current.burn_rate > 0 ? (
        <KPIMetricCard
          label="Runway"
          value={`${current.runway_months} man`}
          icon={Flame}
          subValue={`Burn rate: ${formatSEK(current.burn_rate)}/man`}
          variant={current.runway_months < 6 ? 'danger' : current.runway_months < 12 ? 'warning' : 'default'}
        />
      ) : (
        <KPIMetricCard
          label="Snittfaktura"
          value={formatSEK(current.average_invoice_value)}
          icon={Receipt}
          subValue={`Leverantorsskulder: ${formatSEK(current.accounts_payable)}`}
        />
      )}
    </div>
  )
}
