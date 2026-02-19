'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import VarianceIndicator from './VarianceIndicator'
import AccountGroupRow from './AccountGroupRow'
import { MONTH_NAMES_SV } from '@/types/budget-costcenters'
import type { BudgetVsActualReport, BudgetVsActualSection } from '@/types/budget-costcenters'

interface BudgetVsActualTableProps {
  report: BudgetVsActualReport
  className?: string
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

type ViewMode = 'ytd' | 'monthly'

export default function BudgetVsActualTable({
  report,
  className,
}: BudgetVsActualTableProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('ytd')
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)

  // Calculate current month index (0-based) for YTD
  const currentMonthIndex = useMemo(() => {
    const now = new Date()
    const periodStart = new Date(report.period_start)
    let idx = (now.getMonth() - periodStart.getMonth() + 12) % 12
    // If we're past the period, show all 12
    if (now > new Date(report.period_end)) idx = 11
    return Math.min(idx, 11)
  }, [report.period_start, report.period_end])

  const displayMonth = selectedMonth ?? currentMonthIndex

  return (
    <div className={cn('space-y-4', className)}>
      {/* View mode toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center rounded-md bg-muted p-1 text-muted-foreground">
          <button
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
              viewMode === 'ytd' && 'bg-background text-foreground shadow-sm'
            )}
            onClick={() => { setViewMode('ytd'); setSelectedMonth(null) }}
          >
            Ackumulerat (YTD)
          </button>
          <button
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
              viewMode === 'monthly' && 'bg-background text-foreground shadow-sm'
            )}
            onClick={() => setViewMode('monthly')}
          >
            Per månad
          </button>
        </div>

        {viewMode === 'monthly' && (
          <div className="flex gap-1 flex-wrap">
            {MONTH_NAMES_SV.map((name, i) => (
              <button
                key={i}
                className={cn(
                  'px-2 py-1 rounded text-xs font-medium transition-colors',
                  displayMonth === i
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                )}
                onClick={() => setSelectedMonth(i)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground min-w-[200px]">
                Konto
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground min-w-[100px]">
                Budget
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground min-w-[100px]">
                Utfall
              </th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground min-w-[140px]">
                Avvikelse
              </th>
            </tr>
          </thead>
          <tbody>
            {report.sections.map((section) => (
              <SectionRows
                key={section.account_class}
                section={section}
                viewMode={viewMode}
                monthIndex={displayMonth}
                currentMonthIndex={currentMonthIndex}
              />
            ))}

            {/* Grand totals */}
            <tr className="bg-muted/30 border-t-2 font-semibold">
              <td className="px-3 py-2.5">Totala intäkter</td>
              <td className="text-right px-3 py-2.5 tabular-nums">
                {formatNumber(report.total_revenue_budget)}
              </td>
              <td className="text-right px-3 py-2.5 tabular-nums">
                {formatNumber(report.total_revenue_actual)}
              </td>
              <td className="text-right px-3 py-2.5">
                <VarianceIndicator
                  amount={report.total_revenue_actual - report.total_revenue_budget}
                  isRevenue={true}
                />
              </td>
            </tr>
            <tr className="bg-muted/30 font-semibold">
              <td className="px-3 py-2.5">Totala kostnader</td>
              <td className="text-right px-3 py-2.5 tabular-nums">
                {formatNumber(report.total_expense_budget)}
              </td>
              <td className="text-right px-3 py-2.5 tabular-nums">
                {formatNumber(report.total_expense_actual)}
              </td>
              <td className="text-right px-3 py-2.5">
                <VarianceIndicator
                  amount={report.total_expense_actual - report.total_expense_budget}
                  isRevenue={false}
                />
              </td>
            </tr>
            <tr className="bg-primary/5 font-bold border-t-2">
              <td className="px-3 py-3">Nettoresultat</td>
              <td className="text-right px-3 py-3 tabular-nums">
                {formatNumber(report.net_result_budget)}
              </td>
              <td className="text-right px-3 py-3 tabular-nums">
                {formatNumber(report.net_result_actual)}
              </td>
              <td className="text-right px-3 py-3">
                <VarianceIndicator
                  amount={report.net_result_actual - report.net_result_budget}
                  isRevenue={true}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SectionRows({
  section,
  viewMode,
  monthIndex,
  currentMonthIndex,
}: {
  section: BudgetVsActualSection
  viewMode: ViewMode
  monthIndex: number
  currentMonthIndex: number
}) {
  const isRevenue = section.account_class === 3

  const getRowBudget = (row: typeof section.rows[0]) => {
    if (viewMode === 'monthly') {
      return row.budget_months[monthIndex] || 0
    }
    // YTD: sum months 0..currentMonthIndex
    return row.budget_months.slice(0, currentMonthIndex + 1).reduce((s, v) => s + v, 0)
  }

  const getRowActual = (row: typeof section.rows[0]) => {
    if (viewMode === 'monthly') {
      return row.actual_months[monthIndex] || 0
    }
    return row.actual_months.slice(0, currentMonthIndex + 1).reduce((s, v) => s + v, 0)
  }

  const sectionBudget = section.rows.reduce((s, r) => s + getRowBudget(r), 0)
  const sectionActual = section.rows.reduce((s, r) => s + getRowActual(r), 0)

  return (
    <AccountGroupRow
      title={section.title}
      subtotal={sectionActual}
    >
      {section.rows.map((row) => {
        const budget = getRowBudget(row)
        const actual = getRowActual(row)
        const variance = actual - budget

        return (
          <tr key={`${row.account_number}-${row.cost_center_id}-${row.project_id}`} className="border-b last:border-b-0 hover:bg-muted/30">
            <td className="px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{row.account_number}</span>
                <span className="text-sm">{row.account_name}</span>
              </div>
            </td>
            <td className="text-right px-3 py-1.5 tabular-nums font-mono text-sm">
              {formatNumber(budget)}
            </td>
            <td className="text-right px-3 py-1.5 tabular-nums font-mono text-sm">
              {formatNumber(actual)}
            </td>
            <td className="text-right px-3 py-1.5">
              <VarianceIndicator
                amount={variance}
                percentage={budget !== 0 ? (variance / Math.abs(budget)) * 100 : 0}
                isRevenue={isRevenue}
                compact
              />
            </td>
          </tr>
        )
      })}

      {/* Section subtotal */}
      <tr className="border-t bg-muted/20 font-medium">
        <td className="px-3 py-1.5 text-sm">Summa {section.title}</td>
        <td className="text-right px-3 py-1.5 tabular-nums font-mono text-sm">
          {formatNumber(sectionBudget)}
        </td>
        <td className="text-right px-3 py-1.5 tabular-nums font-mono text-sm">
          {formatNumber(sectionActual)}
        </td>
        <td className="text-right px-3 py-1.5">
          <VarianceIndicator
            amount={sectionActual - sectionBudget}
            isRevenue={isRevenue}
            compact
          />
        </td>
      </tr>
    </AccountGroupRow>
  )
}
