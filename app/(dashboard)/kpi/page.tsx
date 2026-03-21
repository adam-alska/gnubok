'use client'

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { KPIHeroCards } from '@/components/kpi/KPIHeroCards'
import { KPIOperationalGrid } from '@/components/kpi/KPIOperationalGrid'
import { KPITrendChart } from '@/components/kpi/KPITrendChart'
import type { FiscalPeriod, KPIReport } from '@/types'

export default function KpiPage() {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [report, setReport] = useState<KPIReport | null>(null)
  const [isLoadingInit, setIsLoadingInit] = useState(true)
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPeriods() {
      try {
        const res = await fetch('/api/bookkeeping/fiscal-periods')
        const { data } = await res.json()
        setPeriods(data || [])
        if (data && data.length > 0) {
          setSelectedPeriod(data[0].id)
        }
      } catch {
        setError('Kunde inte hämta räkenskapsår')
      } finally {
        setIsLoadingInit(false)
      }
    }
    fetchPeriods()
  }, [])

  useEffect(() => {
    if (!selectedPeriod) return
    let cancelled = false

    async function fetchReport() {
      setIsLoadingReport(true)
      setError(null)
      try {
        const res = await fetch(`/api/reports/kpi?period_id=${selectedPeriod}`)
        if (!res.ok) throw new Error('Kunde inte hämta nyckeltal')
        const { data } = await res.json()
        if (!cancelled) setReport(data)
      } catch {
        if (!cancelled) setError('Kunde inte hämta nyckeltal')
      } finally {
        if (!cancelled) setIsLoadingReport(false)
      }
    }
    fetchReport()
    return () => { cancelled = true }
  }, [selectedPeriod])

  if (isLoadingInit) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">Nyckeltal</h1>
          <p className="text-muted-foreground">Översikt av företagets ekonomiska hälsa</p>
        </div>
        <LoadingSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">Nyckeltal</h1>
          <p className="text-muted-foreground">Översikt av företagets ekonomiska hälsa</p>
        </div>
      </div>

      {/* Period selector */}
      {periods.length > 0 && (
        <div>
          <Label>Räkenskapsår</Label>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="w-full mt-1 max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.period_start} — {p.period_end})
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

      {isLoadingReport && <LoadingSkeleton />}

      {!isLoadingReport && !error && report && (
        <>
          <KPIHeroCards report={report} />
          <KPIOperationalGrid report={report} />
          {report.months.length > 0 && <KPITrendChart months={report.months} />}
        </>
      )}

      {!isLoadingReport && !error && !report && periods.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Inget räkenskapsår hittades. Skapa ett räkenskapsår för att se nyckeltal.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-2">
              <div className="h-3 bg-muted rounded w-20 animate-pulse" />
              <div className="h-7 bg-muted rounded w-28 animate-pulse" />
              <div className="h-3 bg-muted rounded w-16 animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-2">
              <div className="h-3 bg-muted rounded w-24 animate-pulse" />
              <div className="h-6 bg-muted rounded w-20 animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="h-4 bg-muted rounded w-40 animate-pulse" />
          <div className="h-56 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    </div>
  )
}
