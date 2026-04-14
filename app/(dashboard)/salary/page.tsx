'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Users, HandCoins, CalendarDays, ArrowRight } from 'lucide-react'
import { useCanWrite } from '@/lib/hooks/use-can-write'
import { formatCurrency } from '@/lib/utils'
import type { SalaryRun } from '@/types'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Utkast',
  review: 'Granskning',
  approved: 'Godkänd',
  paid: 'Betald',
  booked: 'Bokförd',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  booked: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
}

export default function SalaryPage() {
  const [runs, setRuns] = useState<SalaryRun[]>([])
  const [employeeCount, setEmployeeCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const canWrite = useCanWrite()

  useEffect(() => {
    async function load() {
      const [runsRes, empRes] = await Promise.all([
        fetch('/api/salary/runs'),
        fetch('/api/salary/employees'),
      ])

      if (runsRes.ok) {
        const { data } = await runsRes.json()
        setRuns(data || [])
      }
      if (empRes.ok) {
        const { data } = await empRes.json()
        setEmployeeCount((data || []).length)
      }
      setLoading(false)
    }
    load()
  }, [])

  const currentYear = new Date().getFullYear()
  const yearRuns = runs.filter(r => r.period_year === currentYear)
  const totalGrossYTD = yearRuns.filter(r => r.status === 'booked').reduce((sum, r) => sum + r.total_gross, 0)
  const totalAvgifterYTD = yearRuns.filter(r => r.status === 'booked').reduce((sum, r) => sum + r.total_avgifter, 0)
  const latestRun = runs[0]

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-9 w-40 bg-muted rounded animate-pulse" />
          <div className="h-9 w-32 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">Löner</h1>
          <p className="text-sm text-muted-foreground mt-1">Hantera anställda och lönekörningar</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/salary/employees">
              <Users className="mr-2 h-4 w-4" />
              Anställda
            </Link>
          </Button>
          {canWrite && (
            <Button asChild>
              <Link href="/salary/runs/new">
                <Plus className="mr-2 h-4 w-4" />
                Ny lönekörning
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Anställda</p>
                <p className="text-2xl font-semibold tabular-nums">{employeeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <HandCoins className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Bruttolöner {currentYear}</p>
                <p className="text-2xl font-semibold tabular-nums">{formatCurrency(totalGrossYTD)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Avgifter {currentYear}</p>
                <p className="text-2xl font-semibold tabular-nums">{formatCurrency(totalAvgifterYTD)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lönekörningar</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <HandCoins className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">Inga lönekörningar ännu</p>
              {canWrite && (
                <Button asChild size="sm">
                  <Link href="/salary/runs/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Skapa första lönekörningen
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Utbetalningsdag</th>
                  <th className="px-4 py-2 font-medium text-right">Brutto</th>
                  <th className="px-4 py-2 font-medium text-right">Netto</th>
                  <th className="px-4 py-2 font-medium text-right">Avgifter</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 12).map(run => (
                  <tr key={run.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium tabular-nums">
                      {run.period_year}-{String(run.period_month).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                      {run.payment_date}
                    </td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">
                      {formatCurrency(run.total_gross)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">
                      {formatCurrency(run.total_net)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right tabular-nums">
                      {formatCurrency(run.total_avgifter)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[run.status]}`}>
                        {STATUS_LABELS[run.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/salary/runs/${run.id}`} className="text-muted-foreground hover:text-foreground">
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
