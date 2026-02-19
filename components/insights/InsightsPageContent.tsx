'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  BarChart3,
  TrendingUp,
  Zap,
  Heart,
  Sparkles,
  RefreshCw,
  Activity,
} from 'lucide-react'
import FinancialHealthScore from './FinancialHealthScore'
import CashFlowChart from './CashFlowChart'
import InsightCard from './InsightCard'
import KPIGrid from './KPIGrid'
import RevenueTrendChart from './RevenueTrendChart'
import ProfitTrendChart from './ProfitTrendChart'
import AIAdviceCard from './AIAdviceCard'
import type {
  FinancialHealthScore as HealthScoreType,
  CashFlowForecastDay,
  FinancialInsight,
  KPISnapshot,
  MonthlyTrendPoint,
} from '@/types/financial-insights'

interface InsightsPageContentProps {
  companyName: string | null
}

export default function InsightsPageContent({ companyName }: InsightsPageContentProps) {
  const [healthScore, setHealthScore] = useState<HealthScoreType | null>(null)
  const [cashFlow, setCashFlow] = useState<CashFlowForecastDay[]>([])
  const [insights, setInsights] = useState<FinancialInsight[]>([])
  const [kpis, setKpis] = useState<KPISnapshot | null>(null)
  const [previousKpis, setPreviousKpis] = useState<KPISnapshot | null>(null)
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrendPoint[]>([])
  const [loading, setLoading] = useState({
    health: true,
    cashFlow: true,
    insights: true,
    kpis: true,
  })

  // Fetch all data in parallel
  useEffect(() => {
    // Health score
    fetch('/api/insights/health-score')
      .then(r => r.json())
      .then(({ data }) => setHealthScore(data))
      .catch(() => {})
      .finally(() => setLoading(prev => ({ ...prev, health: false })))

    // Cash flow
    fetch('/api/insights/cash-flow?days=90')
      .then(r => r.json())
      .then(({ data }) => setCashFlow(data || []))
      .catch(() => {})
      .finally(() => setLoading(prev => ({ ...prev, cashFlow: false })))

    // KPIs
    fetch('/api/insights/kpis')
      .then(r => r.json())
      .then(({ data }) => {
        if (data?.current) setKpis(data.current)
        if (data?.previousMonth) setPreviousKpis(data.previousMonth)
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
      .finally(() => setLoading(prev => ({ ...prev, kpis: false })))
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

  const handleRefreshInsights = async () => {
    setLoading(prev => ({ ...prev, insights: true }))
    try {
      await fetch('/api/insights/generate', { method: 'POST' })
      fetchInsights()
    } catch {
      setLoading(prev => ({ ...prev, insights: false }))
    }
  }

  const handleDismissInsight = (id: string) => {
    setInsights(prev => prev.filter(i => i.id !== id))
  }

  // Group insights by severity
  const criticalInsights = insights.filter(i => i.severity === 'critical')
  const warningInsights = insights.filter(i => i.severity === 'warning')
  const infoInsights = insights.filter(i => i.severity === 'info')

  return (
    <div className="stagger-enter">
      {/* Page Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-1">
              Finansiella insikter
            </h1>
            <p className="text-muted-foreground text-lg">
              {companyName ? `Overblik for ${companyName}` : 'Din finansiella overblik'}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleRefreshInsights}
            disabled={loading.insights}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading.insights ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Overblik
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Insikter
            {insights.length > 0 && (
              <Badge variant="default" className="ml-1 text-[9px] px-1 py-0">
                {insights.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="cashflow" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />
            Kassaflode
          </TabsTrigger>
          <TabsTrigger value="kpis" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Nyckeltal
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            AI-rad
          </TabsTrigger>
        </TabsList>

        {/* ══════════════ OVERVIEW TAB ══════════════ */}
        <TabsContent value="overview" className="space-y-6">
          {/* Health Score + Key Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <FinancialHealthScore score={healthScore} loading={loading.health} />
            <div className="lg:col-span-2">
              <CashFlowChart forecast={cashFlow} loading={loading.cashFlow} />
            </div>
          </div>

          {/* KPIs */}
          {kpis && (
            <KPIGrid current={kpis} previous={previousKpis} />
          )}

          {/* Trend Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueTrendChart data={monthlyTrend} loading={loading.kpis} />
            <ProfitTrendChart data={monthlyTrend} loading={loading.kpis} />
          </div>
        </TabsContent>

        {/* ══════════════ INSIGHTS TAB ══════════════ */}
        <TabsContent value="insights" className="space-y-6">
          {/* Critical */}
          {criticalInsights.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-display text-lg font-medium">Kritiskt</h3>
                <Badge variant="destructive" className="text-[10px]">{criticalInsights.length}</Badge>
              </div>
              <div className="space-y-3">
                {criticalInsights.map(insight => (
                  <InsightCard key={insight.id} insight={insight} onDismiss={handleDismissInsight} />
                ))}
              </div>
            </div>
          )}

          {/* Warning */}
          {warningInsights.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-display text-lg font-medium">Varningar</h3>
                <Badge variant="warning" className="text-[10px]">{warningInsights.length}</Badge>
              </div>
              <div className="space-y-3">
                {warningInsights.map(insight => (
                  <InsightCard key={insight.id} insight={insight} onDismiss={handleDismissInsight} />
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          {infoInsights.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-display text-lg font-medium">Information & tips</h3>
                <Badge variant="secondary" className="text-[10px]">{infoInsights.length}</Badge>
              </div>
              <div className="space-y-3">
                {infoInsights.map(insight => (
                  <InsightCard key={insight.id} insight={insight} onDismiss={handleDismissInsight} />
                ))}
              </div>
            </div>
          )}

          {insights.length === 0 && !loading.insights && (
            <Card>
              <CardContent className="py-16 text-center">
                <Heart className="h-12 w-12 mx-auto text-green-500/50 mb-4" />
                <h3 className="font-display text-lg font-medium mb-2">Allt ser bra ut!</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Vi har analyserat din ekonomi och hittar inga problem just nu. Vi bevakar din ekonomi loppande och meddelar dig om nagot viktigt hander.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════ CASH FLOW TAB ══════════════ */}
        <TabsContent value="cashflow" className="space-y-6">
          <CashFlowChart forecast={cashFlow} loading={loading.cashFlow} />

          {/* Cash flow summary stats */}
          {cashFlow.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Lagsta projicerat saldo</p>
                  <p className={`font-display text-2xl font-bold tabular-nums ${Math.min(...cashFlow.map(d => d.balance)) < 0 ? 'text-destructive' : ''}`}>
                    {formatSEK(Math.min(...cashFlow.map(d => d.balance)))}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(cashFlow.reduce((min, d) => d.balance < min.balance ? d : min, cashFlow[0]).date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Forvantade inbetalningar (30d)</p>
                  <p className="font-display text-2xl font-bold tabular-nums text-green-600">
                    {formatSEK(cashFlow.slice(0, 30).reduce((s, d) => s + d.income, 0))}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Forvantade utbetalningar (30d)</p>
                  <p className="font-display text-2xl font-bold tabular-nums text-red-500">
                    {formatSEK(cashFlow.slice(0, 30).reduce((s, d) => s + d.expenses, 0))}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ══════════════ KPIs TAB ══════════════ */}
        <TabsContent value="kpis" className="space-y-6">
          {kpis ? (
            <>
              <KPIGrid current={kpis} previous={previousKpis} />

              {/* Health Score with details */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <FinancialHealthScore score={healthScore} loading={loading.health} />
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Halsoanalys</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {healthScore ? (
                        <div className="space-y-4">
                          {healthScore.factors.map(factor => (
                            <div key={factor.name} className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{factor.name}</span>
                                <span className="text-sm tabular-nums">{factor.score}/100</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{
                                    backgroundColor:
                                      factor.score >= 70 ? '#22c55e' :
                                      factor.score >= 40 ? '#f59e0b' : '#ef4444'
                                  }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${factor.score}%` }}
                                  transition={{ duration: 0.8 }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">{factor.description}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-16 bg-muted/30 animate-pulse rounded-lg" />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Trend Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RevenueTrendChart data={monthlyTrend} loading={loading.kpis} />
                <ProfitTrendChart data={monthlyTrend} loading={loading.kpis} />
              </div>
            </>
          ) : loading.kpis ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-32 bg-muted/30 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="font-display text-lg font-medium mb-2">Inga nyckeltal tillgangliga</h3>
                <p className="text-muted-foreground text-sm">
                  Nar du borjar registrera transaktioner och fakturor beraknas nyckeltal automatiskt.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════ AI TAB ══════════════ */}
        <TabsContent value="ai" className="space-y-6">
          <AIAdviceCard />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
