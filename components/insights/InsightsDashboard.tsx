'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  ArrowRight,
  HelpCircle,
  Receipt,
  Camera,
  Users,
  ArrowLeftRight,
  ChevronRight,
} from 'lucide-react'
import FinancialHealthScore from './FinancialHealthScore'
import CashFlowChart from './CashFlowChart'
import InsightFeed from './InsightFeed'
import KPIMetricCard from './KPIMetricCard'
import QuickStatsRow from './QuickStatsRow'
import RevenueTrendChart from './RevenueTrendChart'
import ProfitTrendChart from './ProfitTrendChart'
import FSkattWarningCard from '@/components/dashboard/FSkattWarningCard'
import { UpcomingDeadlinesWidget } from '@/components/calendar/UpcomingDeadlinesWidget'
import NewUserChecklist from '@/components/onboarding/NewUserChecklist'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
} from 'lucide-react'
import type {
  FinancialHealthScore as HealthScoreType,
  CashFlowForecastDay,
  FinancialInsight,
  KPISnapshot,
  QuickStats,
  MonthlyTrendPoint,
} from '@/types/financial-insights'
import type {
  CompanySettings,
  EntityType,
  MileageEntry,
  SchablonavdragSettings,
  Deadline,
  ReceiptQueueSummary,
  OnboardingProgress,
  TaxWarningStatus,
} from '@/types'

interface InsightsDashboardProps {
  firstName: string | null
  settings: CompanySettings | null
  taxWarning: TaxWarningStatus
  summary: {
    ytd: { income: number; expenses: number; net: number }
    mtd: { income: number; expenses: number; net: number }
    uncategorizedCount: number
    unpaidInvoicesCount: number
    unpaidInvoicesTotal: number
    overdueInvoicesCount: number
    overdueInvoicesTotal: number
    bankBalance: number | null
    mileageEntries: MileageEntry[]
    deadlines: Deadline[]
    receiptQueue: ReceiptQueueSummary | null
    upcomingPaymentsTotal: number
    upcomingPaymentsCount: number
    taxObligationsThisMonth: number
  }
  onboardingProgress?: OnboardingProgress
}

function formatSEK(amount: number): string {
  if (Math.abs(amount) >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M kr`
  }
  return new Intl.NumberFormat('sv-SE', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' kr'
}

export default function InsightsDashboard({
  firstName,
  settings,
  taxWarning,
  summary,
  onboardingProgress,
}: InsightsDashboardProps) {
  const [healthScore, setHealthScore] = useState<HealthScoreType | null>(null)
  const [cashFlow, setCashFlow] = useState<CashFlowForecastDay[]>([])
  const [insights, setInsights] = useState<FinancialInsight[]>([])
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrendPoint[]>([])
  const [loading, setLoading] = useState({
    health: true,
    cashFlow: true,
    insights: true,
    trend: true,
  })

  // Fetch health score
  useEffect(() => {
    fetch('/api/insights/health-score')
      .then(r => r.json())
      .then(({ data }) => setHealthScore(data))
      .catch(() => {})
      .finally(() => setLoading(prev => ({ ...prev, health: false })))
  }, [])

  // Fetch cash flow
  useEffect(() => {
    fetch('/api/insights/cash-flow?days=90')
      .then(r => r.json())
      .then(({ data }) => setCashFlow(data || []))
      .catch(() => {})
      .finally(() => setLoading(prev => ({ ...prev, cashFlow: false })))
  }, [])

  // Fetch insights
  const fetchInsights = useCallback(() => {
    setLoading(prev => ({ ...prev, insights: true }))
    fetch('/api/insights')
      .then(r => r.json())
      .then(({ data }) => setInsights(data || []))
      .catch(() => {})
      .finally(() => setLoading(prev => ({ ...prev, insights: false })))
  }, [])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  // Fetch monthly trend
  useEffect(() => {
    fetch('/api/insights/kpis')
      .then(r => r.json())
      .then(({ data }) => {
        if (data?.monthlyTrend) {
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
          const trend: MonthlyTrendPoint[] = data.monthlyTrend.map((s: KPISnapshot) => ({
            month: s.snapshot_date.substring(0, 7),
            label: monthNames[parseInt(s.snapshot_date.substring(5, 7)) - 1] || '',
            revenue: s.revenue,
            expenses: s.expenses,
            profit: s.net_income,
          }))
          setMonthlyTrend(trend)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(prev => ({ ...prev, trend: false })))
  }, [])

  const refreshInsights = async () => {
    setLoading(prev => ({ ...prev, insights: true }))
    try {
      await fetch('/api/insights/generate', { method: 'POST' })
      fetchInsights()
    } catch {
      setLoading(prev => ({ ...prev, insights: false }))
    }
  }

  const isNewUser = onboardingProgress && !onboardingProgress.hasInvoices && !onboardingProgress.hasCustomers

  const quickStats: QuickStats = {
    outstandingInvoicesTotal: summary.unpaidInvoicesTotal,
    outstandingInvoicesCount: summary.unpaidInvoicesCount,
    overdueInvoicesTotal: summary.overdueInvoicesTotal,
    overdueInvoicesCount: summary.overdueInvoicesCount,
    overdueAgingDays: 0,
    upcomingPaymentsTotal: summary.upcomingPaymentsTotal,
    upcomingPaymentsCount: summary.upcomingPaymentsCount,
    taxObligationsThisMonth: summary.taxObligationsThisMonth,
    recentTransactions: [],
  }

  // Build TODO items
  const todoItems: { label: string; href: string; count: number; variant: 'destructive' | 'warning' | 'default' }[] = []
  const passedDeadlines = summary.deadlines.filter(d => !d.is_completed && new Date(d.due_date) <= new Date())
  if (passedDeadlines.length > 0) {
    todoItems.push({ label: 'passerade deadlines', href: '/calendar', count: passedDeadlines.length, variant: 'destructive' })
  }
  if (summary.overdueInvoicesCount > 0) {
    todoItems.push({ label: 'försenade fakturor', href: '/invoices?status=unpaid', count: summary.overdueInvoicesCount, variant: 'destructive' })
  }
  if (summary.uncategorizedCount > 0) {
    todoItems.push({ label: 'okategoriserade transaktioner', href: '/transactions', count: summary.uncategorizedCount, variant: 'warning' })
  }

  const quickActions = [
    { href: '/invoices/new', icon: Receipt, label: 'Ny faktura', desc: 'Skapa och skicka', accent: true },
    { href: '/receipts/scan', icon: Camera, label: 'Skanna kvitto', desc: 'Fotografera & spara' },
    { href: '/customers', icon: Users, label: 'Ny kund', desc: 'Lägg till kunduppgifter' },
    { href: '/transactions', icon: ArrowLeftRight, label: 'Transaktioner', desc: 'Kategorisera' },
  ]

  // Calculate trend data for MTD cards
  const getNetMargin = () => {
    if (summary.mtd.income === 0) return 0
    return Math.round((summary.mtd.net / summary.mtd.income) * 100)
  }

  return (
    <div className="stagger-enter">
      {/* Hero section */}
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight mb-1">
              {(() => {
                const hour = new Date().getHours()
                if (hour < 12) return 'Godmorgon'
                if (hour < 18) return 'God eftermiddag'
                return 'God kväll'
              })()}{firstName ? ` ${firstName}` : ''}{settings?.company_name ? `, ${settings.company_name}` : ''}
            </h1>
            <p className="text-muted-foreground text-lg">
              {summary.overdueInvoicesCount > 0
                ? `${summary.overdueInvoicesCount} försenade fakturor kräver åtgärd`
                : insights.filter(i => i.severity === 'critical').length > 0
                  ? `${insights.filter(i => i.severity === 'critical').length} kritiska insikter`
                  : 'Allt är som det ska'}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <Link href="/insights" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              Alla insikter
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            <Link href="/help" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <HelpCircle className="h-4 w-4" />
              Hjälp
            </Link>
          </div>
        </div>
      </header>

      {/* TODO badges */}
      {todoItems.length > 0 && (
        <section className="mb-6">
          <div className="flex flex-wrap gap-2">
            {todoItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <Badge
                  variant={item.variant === 'destructive' ? 'destructive' : item.variant === 'warning' ? 'outline' : 'secondary'}
                  className="px-3 py-1.5 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                >
                  {item.count} {item.label}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* New user checklist */}
      {onboardingProgress && isNewUser && (
        <section className="mb-8">
          <NewUserChecklist
            hasCustomers={onboardingProgress.hasCustomers}
            hasInvoices={onboardingProgress.hasInvoices}
            hasBankConnected={onboardingProgress.hasBankConnected}
            hasReceipts={onboardingProgress.hasReceipts}
          />
        </section>
      )}

      {/* ══════════════ TOP ROW: Health Score + Key Metrics ══════════════ */}
      <section className="mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Health Score */}
          <div className="lg:col-span-1">
            <FinancialHealthScore score={healthScore} loading={loading.health} />
          </div>

          {/* Key metric cards */}
          <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPIMetricCard
              label="Intäkter denna månad"
              value={formatSEK(summary.mtd.income)}
              subValue={`YTD: ${formatSEK(summary.ytd.income)}`}
              icon={TrendingUp}
              variant="highlight"
            />
            <KPIMetricCard
              label="Kostnader denna månad"
              value={formatSEK(summary.mtd.expenses)}
              subValue={`YTD: ${formatSEK(summary.ytd.expenses)}`}
              icon={TrendingDown}
            />
            <KPIMetricCard
              label="Nettoresultat"
              value={formatSEK(summary.mtd.net)}
              subValue={summary.mtd.income > 0 ? `Marginal ${getNetMargin()}%` : undefined}
              icon={DollarSign}
              variant={summary.mtd.net >= 0 ? 'default' : 'danger'}
            />
            <KPIMetricCard
              label="Kassabehållning"
              value={summary.bankBalance !== null ? formatSEK(summary.bankBalance) : 'Ej kopplad'}
              subValue={summary.bankBalance !== null ? 'Banksaldo' : 'Koppla din bank'}
              icon={Wallet}
              variant={summary.bankBalance !== null && summary.bankBalance <= 0 ? 'danger' : 'default'}
            />
          </div>
        </div>
      </section>

      {/* ══════════════ SECOND ROW: Cash Flow Forecast ══════════════ */}
      <section className="mb-8">
        <CashFlowChart forecast={cashFlow} loading={loading.cashFlow} />
      </section>

      {/* ══════════════ THIRD ROW: Insights + Quick Actions ══════════════ */}
      <section className="mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Insights feed */}
          <div className="lg:col-span-2">
            <InsightFeed
              insights={insights}
              onRefresh={refreshInsights}
              loading={loading.insights}
            />
          </div>

          {/* Quick actions + Deadlines sidebar */}
          <div className="space-y-6">
            {/* Quick actions */}
            <div>
              <h3 className="font-display text-lg font-medium mb-3">Snabbåtgärder</h3>
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map((action) => {
                  const Icon = action.icon
                  return (
                    <Link key={action.href} href={action.href} className="group">
                      <Card className={`h-full hover-lift text-center ${action.accent ? 'bg-primary/5 border-primary/20' : ''}`}>
                        <CardContent className="p-3 flex flex-col items-center gap-1.5">
                          <div className={`p-2.5 rounded-xl ${action.accent ? 'bg-primary/10' : 'bg-muted/50'} group-hover:scale-105 transition-transform`}>
                            <Icon className={`h-4 w-4 ${action.accent ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                          <p className="text-xs font-medium">{action.label}</p>
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* F-skatt warning */}
            <FSkattWarningCard
              warningStatus={taxWarning}
              onAdjustClick={() => { window.location.href = '/settings' }}
            />

            {/* Upcoming deadlines */}
            {summary.deadlines && summary.deadlines.length > 0 && (
              <UpcomingDeadlinesWidget deadlines={summary.deadlines} maxItems={5} />
            )}
          </div>
        </div>
      </section>

      {/* ══════════════ FOURTH ROW: Quick Stats Grid ══════════════ */}
      <section className="mb-8">
        <h3 className="font-display text-lg font-medium mb-4">Överblick</h3>
        <QuickStatsRow stats={quickStats} />
      </section>

      {/* ══════════════ FIFTH ROW: Trend Charts ══════════════ */}
      <section className="mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RevenueTrendChart data={monthlyTrend} loading={loading.trend} />
          <ProfitTrendChart data={monthlyTrend} loading={loading.trend} />
        </div>
      </section>
    </div>
  )
}
