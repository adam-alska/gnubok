'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  BookOpen,
  Lock,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  PlayCircle,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import type { FiscalPeriod } from '@/types'
import type { YearEndClosing, YearEndClosingStatus } from '@/types/year-end'
import { YEAR_END_STATUS_LABELS } from '@/types/year-end'

export default function YearEndOverviewPage() {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([])
  const [closings, setClosings] = useState<YearEndClosing[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [periodsRes, closingsRes] = await Promise.all([
        fetch('/api/bookkeeping/fiscal-periods'),
        fetch('/api/year-end'),
      ])

      const periodsData = await periodsRes.json()
      const closingsData = await closingsRes.json()

      setPeriods(periodsData.data || [])
      setClosings(closingsData.data || [])
    } catch {
      setError('Kunde inte hämta data')
    } finally {
      setLoading(false)
    }
  }

  async function startClosing(periodId: string) {
    setStarting(periodId)
    try {
      const res = await fetch('/api/year-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscal_period_id: periodId }),
      })
      const result = await res.json()
      if (result.error) {
        // If already exists, navigate to it
        if (result.data?.id) {
          window.location.href = `/year-end/${result.data.id}`
          return
        }
        setError(result.error)
      } else if (result.data) {
        window.location.href = `/year-end/${result.data.id}`
      }
    } catch {
      setError('Kunde inte starta bokslut')
    } finally {
      setStarting(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bokslut</h1>
          <p className="text-muted-foreground">
            Arsavslut, bokslutsverifikationer och arsredovisning
          </p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Map closings by period ID for quick lookup
  const closingByPeriod = new Map<string, YearEndClosing>()
  for (const c of closings) {
    closingByPeriod.set(c.fiscal_period_id, c)
  }

  // Sort periods: open first, then by start date descending
  const sortedPeriods = [...periods].sort((a, b) => {
    if (a.is_closed !== b.is_closed) return a.is_closed ? 1 : -1
    return new Date(b.period_start).getTime() - new Date(a.period_start).getTime()
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bokslut</h1>
        <p className="text-muted-foreground">
          Arsavslut, bokslutsverifikationer och arsredovisning
        </p>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Info card */}
      <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Så här gör du bokslut
              </p>
              <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mt-1">
                Välj ett räkenskapsår och följ guiden steg för steg: förberedelser,
                avstämning, justeringar, bokslutsverifikation, ingående balanser
                och årsredovisning.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Period cards */}
      {sortedPeriods.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Inga räkenskapsår</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Skapa ett räkenskapsår under Inställningar för att komma igång.
            </p>
            <Link href="/settings">
              <Button variant="outline">
                Gå till inställningar
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sortedPeriods.map((period) => {
            const closing = closingByPeriod.get(period.id)
            return (
              <PeriodCard
                key={period.id}
                period={period}
                closing={closing}
                isStarting={starting === period.id}
                onStart={() => startClosing(period.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function PeriodCard({
  period,
  closing,
  isStarting,
  onStart,
}: {
  period: FiscalPeriod
  closing?: YearEndClosing
  isStarting: boolean
  onStart: () => void
}) {
  const isCompleted = closing?.status === 'completed'
  const isInProgress = closing && closing.status !== 'completed'

  return (
    <Card
      className={
        isCompleted
          ? 'border-green-200'
          : isInProgress
          ? 'border-blue-200'
          : ''
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full ${
                isCompleted
                  ? 'bg-green-100'
                  : period.is_closed
                  ? 'bg-gray-100'
                  : 'bg-blue-100'
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : period.is_closed ? (
                <Lock className="h-5 w-5 text-gray-500" />
              ) : (
                <CalendarDays className="h-5 w-5 text-blue-600" />
              )}
            </div>
            <div>
              <CardTitle className="text-lg">{period.name}</CardTitle>
              <CardDescription>
                {period.period_start} -- {period.period_end}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {closing && (
              <StatusBadge status={closing.status} />
            )}
            {period.is_closed && !closing && (
              <Badge className="bg-gray-100 text-gray-600">Last</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between">
          {/* Status info */}
          <div className="text-sm text-muted-foreground">
            {isCompleted && closing?.completed_at && (
              <span>
                Bokslut avslutat{' '}
                {new Date(closing.completed_at).toLocaleDateString('sv-SE')}
              </span>
            )}
            {isInProgress && closing?.started_at && (
              <span>
                Paborjat{' '}
                {new Date(closing.started_at).toLocaleDateString('sv-SE')}
              </span>
            )}
            {!closing && !period.is_closed && (
              <span>Inget bokslut paborjat</span>
            )}
            {!closing && period.is_closed && (
              <span>Rakenskap saret ar last</span>
            )}
          </div>

          {/* Action button */}
          <div>
            {isCompleted && closing && (
              <Link href={`/year-end/${closing.id}`}>
                <Button variant="outline" size="sm">
                  Visa bokslut
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            )}
            {isInProgress && closing && (
              <Link href={`/year-end/${closing.id}`}>
                <Button size="sm">
                  Fortsätt bokslut
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            )}
            {!closing && !period.is_closed && (
              <Button size="sm" onClick={onStart} disabled={isStarting}>
                {isStarting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Startar...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Starta bokslut
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Progress indicator for in-progress closings */}
        {isInProgress && closing && (
          <div className="mt-3 pt-3 border-t">
            <ClosingProgressBar closing={closing} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: YearEndClosingStatus }) {
  const colorMap: Record<YearEndClosingStatus, string> = {
    not_started: 'bg-gray-100 text-gray-800',
    checklist: 'bg-blue-100 text-blue-800',
    adjustments: 'bg-orange-100 text-orange-800',
    review: 'bg-purple-100 text-purple-800',
    closing: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
  }

  return (
    <Badge className={colorMap[status]}>
      {YEAR_END_STATUS_LABELS[status]}
    </Badge>
  )
}

function ClosingProgressBar({ closing }: { closing: YearEndClosing }) {
  const checklist = closing.checklist_data
  const completed = checklist?.completedCount || 0
  const total = checklist?.totalCount || 1
  const percent = Math.round((completed / total) * 100)

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>Checklista: {completed}/{total}</span>
        <span>{percent}%</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
