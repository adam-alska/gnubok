'use client'

import { useState, useEffect, use, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Download, Loader2, TrendingUp, TrendingDown, BarChart3, DollarSign } from 'lucide-react'
import Link from 'next/link'
import BudgetVsActualTable from '@/components/budget/BudgetVsActualTable'
import MonthlyTrendChart from '@/components/budget/MonthlyTrendChart'
import VarianceIndicator from '@/components/budget/VarianceIndicator'
import type { BudgetVsActualReport } from '@/types/budget-costcenters'

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function BudgetReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: budgetId } = use(params)
  const [report, setReport] = useState<BudgetVsActualReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)

  const { toast } = useToast()

  useEffect(() => {
    fetchReport()
  }, [budgetId])

  async function fetchReport() {
    setIsLoading(true)
    const response = await fetch(`/api/budgets/${budgetId}/vs-actual`)
    if (response.ok) {
      const result = await response.json()
      setReport(result.data)
    } else {
      const result = await response.json()
      toast({ title: 'Fel', description: result.error, variant: 'destructive' })
    }
    setIsLoading(false)
  }

  async function handleExportCSV() {
    setIsExporting(true)
    try {
      const response = await fetch(`/api/budgets/${budgetId}/vs-actual?format=csv`)
      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `budget-vs-utfall-${budgetId}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast({ title: 'Exporterat', description: 'CSV-filen har laddats ner' })
      }
    } catch {
      toast({ title: 'Fel', description: 'Kunde inte exportera', variant: 'destructive' })
    }
    setIsExporting(false)
  }

  // Calculate chart data from report
  const revenueChartData = useMemo(() => {
    if (!report) return { budget: new Array(12).fill(0), actual: new Array(12).fill(0) }

    const revenueSection = report.sections.find(s => s.account_class === 3)
    if (!revenueSection) return { budget: new Array(12).fill(0), actual: new Array(12).fill(0) }

    const budget = new Array(12).fill(0)
    const actual = new Array(12).fill(0)

    for (const row of revenueSection.rows) {
      for (let i = 0; i < 12; i++) {
        budget[i] += row.budget_months[i] || 0
        actual[i] += row.actual_months[i] || 0
      }
    }

    return { budget, actual }
  }, [report])

  const expenseChartData = useMemo(() => {
    if (!report) return { budget: new Array(12).fill(0), actual: new Array(12).fill(0) }

    const expenseSections = report.sections.filter(s => s.account_class >= 4)
    const budget = new Array(12).fill(0)
    const actual = new Array(12).fill(0)

    for (const section of expenseSections) {
      for (const row of section.rows) {
        for (let i = 0; i < 12; i++) {
          budget[i] += row.budget_months[i] || 0
          actual[i] += row.actual_months[i] || 0
        }
      }
    }

    return { budget, actual }
  }, [report])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <Link href={`/budgets/${budgetId}`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Tillbaka till budget
        </Link>
        <p>Rapporten kunde inte laddas.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href={`/budgets/${budgetId}`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Tillbaka till budget
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Budget vs Utfall</h1>
          <p className="text-muted-foreground">
            {report.budget_name} ({report.period_start} - {report.period_end})
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          Exportera CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3 w-3" />
              Intäkter
            </div>
            <div className="text-xl font-semibold">{formatSEK(report.total_revenue_actual)}</div>
            <div className="mt-1">
              <VarianceIndicator
                amount={report.total_revenue_actual - report.total_revenue_budget}
                percentage={report.total_revenue_budget !== 0
                  ? ((report.total_revenue_actual - report.total_revenue_budget) / Math.abs(report.total_revenue_budget)) * 100
                  : 0}
                isRevenue={true}
                compact
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Budget: {formatSEK(report.total_revenue_budget)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingDown className="h-3 w-3" />
              Kostnader
            </div>
            <div className="text-xl font-semibold">{formatSEK(report.total_expense_actual)}</div>
            <div className="mt-1">
              <VarianceIndicator
                amount={report.total_expense_actual - report.total_expense_budget}
                percentage={report.total_expense_budget !== 0
                  ? ((report.total_expense_actual - report.total_expense_budget) / Math.abs(report.total_expense_budget)) * 100
                  : 0}
                isRevenue={false}
                compact
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Budget: {formatSEK(report.total_expense_budget)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3 w-3" />
              Nettoresultat
            </div>
            <div className="text-xl font-semibold">{formatSEK(report.net_result_actual)}</div>
            <div className="mt-1">
              <VarianceIndicator
                amount={report.net_result_actual - report.net_result_budget}
                isRevenue={true}
                compact
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Budget: {formatSEK(report.net_result_budget)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <BarChart3 className="h-3 w-3" />
              Resultatgrad
            </div>
            <div className="text-xl font-semibold">
              {report.total_revenue_actual !== 0
                ? `${((report.net_result_actual / report.total_revenue_actual) * 100).toFixed(1)}%`
                : '-'
              }
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Budget: {report.total_revenue_budget !== 0
                ? `${((report.net_result_budget / report.total_revenue_budget) * 100).toFixed(1)}%`
                : '-'
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MonthlyTrendChart
          budgetMonths={revenueChartData.budget}
          actualMonths={revenueChartData.actual}
          title="Intäkter: Budget vs Utfall"
        />
        <MonthlyTrendChart
          budgetMonths={expenseChartData.budget}
          actualMonths={expenseChartData.actual}
          title="Kostnader: Budget vs Utfall"
        />
      </div>

      {/* Detailed table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detaljerad jämförelse</CardTitle>
        </CardHeader>
        <CardContent>
          <BudgetVsActualTable report={report} />
        </CardContent>
      </Card>
    </div>
  )
}
