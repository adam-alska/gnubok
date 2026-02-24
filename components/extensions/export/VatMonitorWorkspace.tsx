'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import KPICard from '@/components/extensions/shared/KPICard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  ArrowUp, ArrowDown, Minus, BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

interface VatBoxData {
  boxNumber: string
  label: string
  amount: number
  accounts: string[]
}

interface RevenueBreakdown {
  domestic: { amount: number; percentage: number }
  euGoods: { amount: number; percentage: number }
  euServices: { amount: number; percentage: number }
  exportGoods: { amount: number; percentage: number }
  exportServices: { amount: number; percentage: number }
  triangular: { amount: number; percentage: number }
  totalRevenue: number
}

interface PeriodDelta {
  current: number
  previous: number
  change: number
  changePercent: number | null
}

interface PeriodComparison {
  domestic: PeriodDelta
  euGoods: PeriodDelta
  euServices: PeriodDelta
  exportGoods: PeriodDelta
  exportServices: PeriodDelta
  triangular: PeriodDelta
  totalRevenue: PeriodDelta
  netVat: PeriodDelta
}

interface VatMonitorWarning {
  type: string
  severity: 'error' | 'warning'
  invoiceId?: string
  invoiceNumber?: string
  customerName?: string
  message: string
}

interface ReportData {
  period: { year: number; month?: number; quarter?: number }
  boxes: VatBoxData[]
  revenueBreakdown: RevenueBreakdown
  vatSummary: {
    outputVat25: number
    outputVat12: number
    outputVat6: number
    totalOutputVat: number
    inputVat: number
    netVat: number
    isRefund: boolean
  }
  warnings: VatMonitorWarning[]
  comparison: PeriodComparison | null
}

// ── Helpers ───────────────────────────────────────────────────

function formatSEK(amount: number): string {
  return Math.round(amount).toLocaleString('sv-SE')
}

const MONTHS = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
]

const QUARTERS = ['Q1 (jan–mar)', 'Q2 (apr–jun)', 'Q3 (jul–sep)', 'Q4 (okt–dec)']

function currentYear(): number {
  return new Date().getFullYear()
}

function currentMonth(): number {
  return new Date().getMonth() + 1
}

function currentQuarter(): number {
  return Math.ceil(currentMonth() / 3)
}

// Revenue breakdown cards config
const REVENUE_CARDS: { key: keyof Omit<RevenueBreakdown, 'totalRevenue'>; label: string; compKey: keyof PeriodComparison }[] = [
  { key: 'domestic', label: 'Inrikes', compKey: 'domestic' },
  { key: 'euGoods', label: 'EU varor', compKey: 'euGoods' },
  { key: 'euServices', label: 'EU tjänster', compKey: 'euServices' },
  { key: 'exportGoods', label: 'Export varor', compKey: 'exportGoods' },
  { key: 'exportServices', label: 'Export tjänster', compKey: 'exportServices' },
  { key: 'triangular', label: 'Trepartshandel', compKey: 'triangular' },
]

// Box display order (only show relevant ones)
const DISPLAY_BOX_ORDER = ['05', '10', '11', '12', '35', '36', '38', '39', '40', '48', '49']

// ── Component ─────────────────────────────────────────────────

export default function VatMonitorWorkspace({ userId }: WorkspaceComponentProps) {
  void userId

  const [year, setYear] = useState(currentYear())
  const [periodType, setPeriodType] = useState<'monthly' | 'quarterly'>('monthly')
  const [month, setMonth] = useState(currentMonth())
  const [quarter, setQuarter] = useState(currentQuarter())
  const [compareEnabled, setCompareEnabled] = useState(true)

  const [report, setReport] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [warningsExpanded, setWarningsExpanded] = useState(false)

  const years = useMemo(() => {
    const cy = currentYear()
    return [cy, cy - 1, cy - 2]
  }, [])

  const fetchReport = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams({ year: String(year) })
    if (periodType === 'monthly') {
      params.set('month', String(month))
    } else {
      params.set('quarter', String(quarter))
    }
    if (compareEnabled) {
      params.set('compare', 'previous')
    }

    try {
      const res = await fetch(`/api/extensions/export/vat-monitor/report?${params}`)
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Kunde inte generera rapporten')
        setReport(null)
        return
      }
      const json = await res.json()
      setReport(json.data)
    } catch {
      setError('Nätverksfel — kunde inte hämta rapporten')
      setReport(null)
    } finally {
      setIsLoading(false)
    }
  }, [year, month, quarter, periodType, compareEnabled])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const errorCount = report?.warnings.filter(w => w.severity === 'error').length ?? 0
  const warningCount = report?.warnings.filter(w => w.severity === 'warning').length ?? 0

  // Filter boxes to only show ones in display order that have data or are always shown
  const displayBoxes = useMemo(() => {
    if (!report) return []
    const boxMap = new Map(report.boxes.map(b => [b.boxNumber, b]))
    return DISPLAY_BOX_ORDER
      .map(num => boxMap.get(num))
      .filter((b): b is VatBoxData => b !== undefined)
  }, [report])

  if (isLoading && !report) {
    return <ExtensionLoadingSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* ── Period Selector ─────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">År</label>
          <Select value={String(year)} onValueChange={v => setYear(parseInt(v, 10))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Periodtyp</label>
          <Select value={periodType} onValueChange={v => setPeriodType(v as 'monthly' | 'quarterly')}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Månad</SelectItem>
              <SelectItem value="quarterly">Kvartal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {periodType === 'monthly' ? 'Månad' : 'Kvartal'}
          </label>
          {periodType === 'monthly' ? (
            <Select value={String(month)} onValueChange={v => setMonth(parseInt(v, 10))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={String(quarter)} onValueChange={v => setQuarter(parseInt(v, 10))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUARTERS.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="ml-auto">
          <Button
            variant={compareEnabled ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCompareEnabled(!compareEnabled)}
          >
            <BarChart3 className="h-4 w-4 mr-1.5" />
            {compareEnabled ? 'Jämförelse på' : 'Jämför perioder'}
          </Button>
        </div>
      </div>

      {/* ── Error state ────────────────────────────────────── */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          {/* ── Revenue Breakdown Cards ──────────────────────── */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Intäktsfördelning</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {REVENUE_CARDS.map(({ key, label, compKey }) => {
                const data = report.revenueBreakdown[key]
                const delta = report.comparison?.[compKey]
                return (
                  <Card key={key} className={cn(data.amount === 0 && 'opacity-50')}>
                    <CardContent className="pt-4 pb-3 px-4">
                      <p className="text-xs text-muted-foreground truncate">{label}</p>
                      <p className="text-lg font-semibold tabular-nums mt-0.5">
                        {formatSEK(data.amount)}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">
                          {data.percentage}%
                        </span>
                        {delta && <DeltaIndicator delta={delta} />}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* ── VAT Summary + Moms Box Table ─────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* VAT Summary cards */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Moms</h3>
              <KPICard
                label="Utgående moms"
                value={formatSEK(report.vatSummary.totalOutputVat)}
                suffix="SEK"
              />
              <KPICard
                label="Ingående moms"
                value={formatSEK(report.vatSummary.inputVat)}
                suffix="SEK"
              />
              <Card className={cn(
                report.vatSummary.isRefund ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30' : ''
              )}>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">
                    {report.vatSummary.isRefund ? 'Moms att få tillbaka' : 'Moms att betala'}
                  </p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={cn(
                      'text-2xl font-semibold tracking-tight',
                      report.vatSummary.isRefund && 'text-green-700 dark:text-green-400'
                    )}>
                      {formatSEK(Math.abs(report.vatSummary.netVat))}
                    </span>
                    <span className="text-sm text-muted-foreground">SEK</span>
                  </div>
                  {report.comparison && (
                    <div className="mt-1">
                      <DeltaIndicator delta={report.comparison.netVat} invert />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Momsdeklaration preview table */}
            <div className="lg:col-span-2">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Momsdeklaration (förhandsvisning)
              </h3>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Ruta</TableHead>
                        <TableHead>Beskrivning</TableHead>
                        <TableHead className="text-right w-36">Belopp (SEK)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayBoxes.map(box => {
                        const isNetVat = box.boxNumber === '49'
                        const isInputVat = box.boxNumber === '48'
                        return (
                          <TableRow
                            key={box.boxNumber}
                            className={cn(isNetVat && 'font-medium border-t-2')}
                          >
                            <TableCell>
                              <Badge
                                variant={isNetVat ? 'default' : isInputVat ? 'secondary' : 'outline'}
                                className="font-mono text-xs"
                              >
                                {box.boxNumber}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{box.label}</TableCell>
                            <TableCell className="text-right font-mono text-sm tabular-nums">
                              {formatSEK(box.amount)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {displayBoxes.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            Ingen bokföringsdata för perioden.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── Warnings ─────────────────────────────────────── */}
          {report.warnings.length > 0 && (
            <Card className={cn(
              'border-l-4',
              errorCount > 0 ? 'border-l-destructive' : 'border-l-warning'
            )}>
              <CardContent className="pt-6">
                <button
                  className="flex items-center gap-2 w-full text-left"
                  onClick={() => setWarningsExpanded(!warningsExpanded)}
                >
                  <AlertTriangle className={cn(
                    'h-4 w-4 shrink-0',
                    errorCount > 0 ? 'text-destructive' : 'text-warning-foreground'
                  )} />
                  <span className="text-sm font-medium flex-1">
                    {errorCount > 0 && (
                      <span className="text-destructive">{errorCount} fel</span>
                    )}
                    {errorCount > 0 && warningCount > 0 && ', '}
                    {warningCount > 0 && (
                      <span className="text-warning-foreground">{warningCount} varningar</span>
                    )}
                  </span>
                  {warningsExpanded
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  }
                </button>

                {warningsExpanded && (
                  <div className="mt-4 space-y-2">
                    {report.warnings.map((w, i) => (
                      <div
                        key={i}
                        className={cn(
                          'flex items-start gap-2 text-sm py-2 px-3 rounded-md',
                          w.severity === 'error'
                            ? 'bg-destructive/5 text-destructive'
                            : 'bg-warning/10 text-warning-foreground'
                        )}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{w.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Total Revenue Footer ─────────────────────────── */}
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>
              Total omsättning: {formatSEK(report.revenueBreakdown.totalRevenue)} SEK
            </span>
            <span>
              {report.period.year}
              {report.period.month !== undefined && `, ${MONTHS[report.period.month - 1]}`}
              {report.period.quarter !== undefined && `, ${QUARTERS[report.period.quarter - 1]}`}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function DeltaIndicator({ delta, invert = false }: { delta: PeriodDelta; invert?: boolean }) {
  if (delta.changePercent === null || delta.change === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
      </span>
    )
  }

  // For most metrics, positive = green (revenue growing)
  // For netVat (invert=true), positive = red (paying more VAT)
  const isPositive = delta.change > 0
  const isGood = invert ? !isPositive : isPositive

  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs',
      isGood ? 'text-green-600' : 'text-red-600'
    )}>
      {isPositive
        ? <ArrowUp className="h-3 w-3" />
        : <ArrowDown className="h-3 w-3" />
      }
      <span>{delta.changePercent > 0 ? '+' : ''}{delta.changePercent}%</span>
    </span>
  )
}
