'use client'

import { useState, useEffect, useCallback } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useMockData } from '@/lib/extensions/use-mock-data'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import MockDataBanner from '@/components/extensions/shared/MockDataBanner'
import MockDataImportDialog from '@/components/extensions/shared/MockDataImportDialog'
import type { CsvFieldDef } from '@/components/extensions/shared/MockDataImportDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  TrendingUp, TrendingDown, RefreshCw, Info, ArrowUpDown, FlaskConical,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

interface CurrencyExposure {
  currency: string
  totalForeignAmount: number
  bookedSekValue: number
  currentSekValue: number
  unrealizedGainLoss: number
  invoiceCount: number
  averageBookedRate: number
  currentRate: number
}

interface ForeignReceivable {
  invoiceId: string
  invoiceNumber: string
  customerName: string
  customerCountry: string
  currency: string
  foreignAmount: number
  bookedSekAmount: number
  bookedRate: number
  currentSekAmount: number
  currentRate: number
  unrealizedGainLoss: number
  invoiceDate: string
  dueDate: string
  daysOutstanding: number
}

interface MonthlyFXTrend {
  month: string
  realizedGains: number
  realizedLosses: number
  netRealized: number
}

interface ExchangeRateInfo {
  currency: string
  rate: number
  date: string
}

interface RevalPreview {
  totalUnrealizedGainLoss: number
  gains: number
  losses: number
}

interface ReportData {
  referenceDate: string
  exchangeRates: ExchangeRateInfo[]
  exposureByCurrency: CurrencyExposure[]
  receivables: ForeignReceivable[]
  realizedGainLoss: {
    year: number
    gains: number
    losses: number
    net: number
  }
  monthlyTrend: MonthlyFXTrend[]
  revalPreview: RevalPreview
  totals: {
    bookedSekValue: number
    currentSekValue: number
    totalUnrealizedGainLoss: number
    receivableCount: number
    currencyCount: number
  }
}

// ── Helpers ───────────────────────────────────────────────────

function formatSEK(amount: number): string {
  return Math.round(amount).toLocaleString('sv-SE')
}

function formatAmount(amount: number, decimals = 2): string {
  return amount.toLocaleString('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', NOK: 'kr', DKK: 'kr', SEK: 'kr',
}

function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] || code
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
]

function monthLabel(monthKey: string): string {
  const m = parseInt(monthKey.split('-')[1], 10)
  return MONTH_NAMES[m - 1] || monthKey
}

function currentYear(): number { return new Date().getFullYear() }

type SortField = 'unrealizedGainLoss' | 'foreignAmount' | 'daysOutstanding' | 'customerName'
type SortDir = 'asc' | 'desc'

// ── Mock Data Config ──────────────────────────────────────────

const MOCK_CSV_FIELDS: CsvFieldDef[] = [
  { key: 'invoiceNumber', label: 'Fakturanummer', required: true },
  { key: 'customerName', label: 'Kund', required: true },
  { key: 'currency', label: 'Valuta', required: true },
  { key: 'foreignAmount', label: 'Belopp (utl. valuta)', required: true },
  { key: 'bookedSekAmount', label: 'Bokfört (SEK)' },
  { key: 'bookedRate', label: 'Bokförd kurs' },
  { key: 'currentSekAmount', label: 'Aktuellt (SEK)' },
  { key: 'currentRate', label: 'Aktuell kurs' },
  { key: 'invoiceDate', label: 'Fakturadatum' },
  { key: 'dueDate', label: 'Förfallodatum' },
]

const MOCK_CSV_TEMPLATE = `invoiceNumber;customerName;currency;foreignAmount;bookedSekAmount;bookedRate;currentSekAmount;currentRate;invoiceDate;dueDate
1001;Beispiel GmbH;EUR;10000;112500;11.25;114200;11.42;2025-01-15;2025-02-15
1002;Example Corp;USD;25000;262500;10.50;260000;10.40;2025-01-20;2025-02-20
1003;London Ltd;GBP;8000;106400;13.30;108000;13.50;2025-02-01;2025-03-01`

function parseMockCsvRows(rows: Record<string, string>[]): ReportData {
  const today = new Date().toISOString().slice(0, 10)
  const receivables: ForeignReceivable[] = rows.map(r => {
    const foreignAmount = parseFloat(r.foreignAmount || '0') || 0
    const bookedRate = parseFloat(r.bookedRate || '0') || 0
    const currentRate = parseFloat(r.currentRate || '0') || bookedRate
    const bookedSek = parseFloat(r.bookedSekAmount || '0') || Math.round(foreignAmount * bookedRate * 100) / 100
    const currentSek = parseFloat(r.currentSekAmount || '0') || Math.round(foreignAmount * currentRate * 100) / 100
    const invoiceDate = r.invoiceDate || today
    const dueDate = r.dueDate || today
    const daysOutstanding = Math.max(0, Math.floor((Date.now() - new Date(invoiceDate).getTime()) / 86400000))

    return {
      invoiceId: r.invoiceNumber || '',
      invoiceNumber: r.invoiceNumber || '',
      customerName: r.customerName || '',
      customerCountry: '',
      currency: r.currency || 'EUR',
      foreignAmount,
      bookedSekAmount: bookedSek,
      bookedRate,
      currentSekAmount: currentSek,
      currentRate,
      unrealizedGainLoss: Math.round((currentSek - bookedSek) * 100) / 100,
      invoiceDate,
      dueDate,
      daysOutstanding,
    }
  })

  // Group by currency for exposure
  const currencyMap = new Map<string, CurrencyExposure>()
  for (const r of receivables) {
    const existing = currencyMap.get(r.currency)
    if (existing) {
      existing.totalForeignAmount += r.foreignAmount
      existing.bookedSekValue += r.bookedSekAmount
      existing.currentSekValue += r.currentSekAmount
      existing.unrealizedGainLoss += r.unrealizedGainLoss
      existing.invoiceCount++
    } else {
      currencyMap.set(r.currency, {
        currency: r.currency,
        totalForeignAmount: r.foreignAmount,
        bookedSekValue: r.bookedSekAmount,
        currentSekValue: r.currentSekAmount,
        unrealizedGainLoss: r.unrealizedGainLoss,
        invoiceCount: 1,
        averageBookedRate: r.bookedRate,
        currentRate: r.currentRate,
      })
    }
  }

  const exposureByCurrency = Array.from(currencyMap.values())
  const totalBookedSek = receivables.reduce((s, r) => s + r.bookedSekAmount, 0)
  const totalCurrentSek = receivables.reduce((s, r) => s + r.currentSekAmount, 0)
  const totalUnrealized = Math.round((totalCurrentSek - totalBookedSek) * 100) / 100

  return {
    referenceDate: today,
    exchangeRates: exposureByCurrency.map(e => ({ currency: e.currency, rate: e.currentRate, date: today })),
    exposureByCurrency,
    receivables,
    realizedGainLoss: { year: new Date().getFullYear(), gains: 0, losses: 0, net: 0 },
    monthlyTrend: [],
    revalPreview: {
      totalUnrealizedGainLoss: totalUnrealized,
      gains: Math.max(0, totalUnrealized),
      losses: Math.abs(Math.min(0, totalUnrealized)),
    },
    totals: {
      bookedSekValue: totalBookedSek,
      currentSekValue: totalCurrentSek,
      totalUnrealizedGainLoss: totalUnrealized,
      receivableCount: receivables.length,
      currencyCount: exposureByCurrency.length,
    },
  }
}

function validateMockReport(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Data måste vara ett objekt' }
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.receivables) && !Array.isArray(obj.exposureByCurrency)) {
    return { valid: false, error: 'Fältet "receivables" eller "exposureByCurrency" saknas' }
  }
  if (!obj.totals || typeof obj.totals !== 'object') return { valid: false, error: 'Fältet "totals" saknas' }
  return { valid: true }
}

// ── Component ─────────────────────────────────────────────────

export default function CurrencyReceivablesWorkspace({ userId }: WorkspaceComponentProps) {
  void userId

  // Mock data
  const { mockReport, isMockActive, isLoading: mockLoading, importedAt, saveMockData, clearMockData } = useMockData<ReportData>('export', 'currency-receivables')
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  const [year, setYear] = useState(currentYear())
  const [report, setReport] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [sortField, setSortField] = useState<SortField>('unrealizedGainLoss')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const years = [currentYear(), currentYear() - 1, currentYear() - 2]

  const fetchReport = useCallback(async () => {
    if (isMockActive && mockReport) {
      setReport(mockReport)
      setIsLoading(false)
      setRefreshing(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ year: String(year) })
      const res = await fetch(`/api/extensions/export/currency-receivables/report?${params}`)
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Kunde inte hämta rapporten')
        setReport(null)
        return
      }
      const json = await res.json()
      setReport(json.data)
    } catch {
      setError('Nätverksfel')
      setReport(null)
    } finally {
      setIsLoading(false)
      setRefreshing(false)
    }
  }, [year, isMockActive, mockReport])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  const handleMockImport = useCallback(async (data: ReportData, meta: { source: 'csv' | 'json'; fileName: string; rowCount: number }) => {
    await saveMockData(data, meta)
    setReport(data)
  }, [saveMockData])

  const handleMockClear = useCallback(async () => {
    await clearMockData()
    setReport(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ year: String(year) })
      const res = await fetch(`/api/extensions/export/currency-receivables/report?${params}`)
      if (res.ok) {
        const json = await res.json()
        setReport(json.data)
      }
    } catch { /* ignore */ }
    setIsLoading(false)
  }, [clearMockData, year])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchReport()
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sortedReceivables = report?.receivables.slice().sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1
    switch (sortField) {
      case 'unrealizedGainLoss': return mul * (Math.abs(a.unrealizedGainLoss) - Math.abs(b.unrealizedGainLoss))
      case 'foreignAmount': return mul * (a.foreignAmount - b.foreignAmount)
      case 'daysOutstanding': return mul * (a.daysOutstanding - b.daysOutstanding)
      case 'customerName': return mul * a.customerName.localeCompare(b.customerName)
      default: return 0
    }
  }) || []

  // Only show trend months that have data or are <= current month
  const activeTrend = report?.monthlyTrend.filter(t => {
    const m = parseInt(t.month.split('-')[1], 10)
    const trendYear = parseInt(t.month.split('-')[0], 10)
    if (trendYear < currentYear()) return true
    return m <= new Date().getMonth() + 1
  }) || []

  if ((isLoading || mockLoading) && !report) {
    return <ExtensionLoadingSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">År (realiserade)</label>
          <Select value={String(year)} onValueChange={v => setYear(parseInt(v, 10))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
            <FlaskConical className="h-4 w-4 mr-1.5" />
            Importera testdata
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn('h-4 w-4 mr-1.5', refreshing && 'animate-spin')} />
            {refreshing ? 'Uppdaterar...' : 'Uppdatera kurser'}
          </Button>
        </div>
      </div>

      {/* ── Mock Data Banner ──────────────────────────────── */}
      {isMockActive && (
        <MockDataBanner
          importedAt={importedAt}
          onClear={handleMockClear}
          onReplace={() => setImportDialogOpen(true)}
        />
      )}

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          {/* ── Exchange Rates ──────────────────────────── */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm font-medium">Växelkurser</p>
                <Badge variant="outline" className="text-xs">
                  {report.referenceDate}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-4">
                {report.exchangeRates.map(r => (
                  <div key={r.currency} className="flex items-baseline gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{r.currency}:</span>
                    <span className="text-sm font-mono tabular-nums">{formatAmount(r.rate, 4)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ── Exposure Cards ─────────────────────────── */}
          {report.exposureByCurrency.length > 0 ? (
            <div className={cn(
              'grid gap-4',
              report.exposureByCurrency.length === 1 ? 'grid-cols-1 sm:grid-cols-2' :
              report.exposureByCurrency.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
              'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            )}>
              {report.exposureByCurrency.map(exp => (
                <ExposureCard key={exp.currency} exposure={exp} />
              ))}

              {/* Total card */}
              <Card className="border-2">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-muted-foreground">Totalt</span>
                    <Badge variant="outline">{report.totals.receivableCount} fakturor</Badge>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {formatSEK(report.totals.currentSekValue)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">SEK (aktuell kurs)</p>
                  <div className="mt-3 pt-3 border-t">
                    <FXIndicator label="Orealiserat" amount={report.totals.totalUnrealizedGainLoss} />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground text-center py-6">
                  Inga öppna fordringar i utländsk valuta.
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Receivables Table ──────────────────────── */}
          {sortedReceivables.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Öppna fordringar</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Faktura</TableHead>
                        <SortableHead field="customerName" label="Kund" current={sortField} dir={sortDir} onSort={toggleSort} />
                        <TableHead>Valuta</TableHead>
                        <SortableHead field="foreignAmount" label="Belopp" current={sortField} dir={sortDir} onSort={toggleSort} className="text-right" />
                        <TableHead className="text-right">Bokfört (SEK)</TableHead>
                        <TableHead className="text-right">Aktuellt (SEK)</TableHead>
                        <SortableHead field="unrealizedGainLoss" label="Orealiserat" current={sortField} dir={sortDir} onSort={toggleSort} className="text-right" />
                        <SortableHead field="daysOutstanding" label="Dagar" current={sortField} dir={sortDir} onSort={toggleSort} className="text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedReceivables.map(r => (
                        <TableRow key={r.invoiceId}>
                          <TableCell className="font-mono text-sm">{r.invoiceNumber}</TableCell>
                          <TableCell className="text-sm">
                            <div>
                              <span>{r.customerName}</span>
                              {r.customerCountry && (
                                <Badge variant="outline" className="ml-1.5 text-xs">{r.customerCountry}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{r.currency}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {currencySymbol(r.currency)}{formatAmount(r.foreignAmount)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatSEK(r.bookedSekAmount)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatSEK(r.currentSekAmount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <FXBadge amount={r.unrealizedGainLoss} />
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            <span className={cn(
                              r.daysOutstanding > 30 ? 'text-destructive font-medium' :
                              r.daysOutstanding > 14 ? 'text-warning-foreground' : ''
                            )}>
                              {r.daysOutstanding}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Realized FX Trend ──────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Realiserade kursdifferenser {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Inga realiserade kursdifferenser för {year}.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Månad</TableHead>
                        <TableHead className="text-right">Vinst (3960)</TableHead>
                        <TableHead className="text-right">Förlust (7960)</TableHead>
                        <TableHead className="text-right">Netto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeTrend.map(t => (
                        <TableRow key={t.month}>
                          <TableCell className="text-sm">{monthLabel(t.month)}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-green-600">
                            {t.realizedGains > 0 ? `+${formatSEK(t.realizedGains)}` : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums text-red-600">
                            {t.realizedLosses > 0 ? `-${formatSEK(t.realizedLosses)}` : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            <FXBadge amount={t.netRealized} />
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals row */}
                      <TableRow className="border-t-2 font-medium">
                        <TableCell className="text-sm">Totalt {year}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-green-600">
                          +{formatSEK(report.realizedGainLoss.gains)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-red-600">
                          -{formatSEK(report.realizedGainLoss.losses)}
                        </TableCell>
                        <TableCell className="text-right">
                          <FXBadge amount={report.realizedGainLoss.net} />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Revaluation Preview ────────────────────── */}
          {report.receivables.length > 0 && (
            <Card className="border-l-4 border-l-blue-500/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Omvärdering vid periodbokslut</p>
                    <p className="text-sm text-muted-foreground">
                      Om bokslut görs idag: netto orealiserad{' '}
                      <span className={cn(
                        'font-medium',
                        report.revalPreview.totalUnrealizedGainLoss >= 0 ? 'text-green-600' : 'text-red-600'
                      )}>
                        {report.revalPreview.totalUnrealizedGainLoss >= 0 ? 'vinst' : 'förlust'}{' '}
                        {report.revalPreview.totalUnrealizedGainLoss >= 0 ? '+' : ''}
                        {formatSEK(report.revalPreview.totalUnrealizedGainLoss)} SEK
                      </span>
                    </p>
                    {report.revalPreview.gains > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Konto 3969 (orealiserad kursvinst): {formatSEK(report.revalPreview.gains)} kr
                      </p>
                    )}
                    {report.revalPreview.losses > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Konto 7969 (orealiserad kursförlust): {formatSEK(report.revalPreview.losses)} kr
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground italic">
                      Bokföringsposterna skapas inte av detta tillägg. Använd värdena ovan som underlag vid periodbokslut.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Mock Data Import Dialog ───────────────────────── */}
      <MockDataImportDialog<ReportData>
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        csvFields={MOCK_CSV_FIELDS}
        parseCsvRows={parseMockCsvRows}
        validateReport={validateMockReport}
        templateCsvContent={MOCK_CSV_TEMPLATE}
        templateFileName="currency-receivables-template.csv"
        onImport={handleMockImport}
      />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function ExposureCard({ exposure }: { exposure: CurrencyExposure }) {
  const sym = currencySymbol(exposure.currency)
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <Badge variant="outline" className="text-sm font-medium">{exposure.currency}</Badge>
          <span className="text-xs text-muted-foreground">{exposure.invoiceCount} fakturor</span>
        </div>
        <p className="text-lg font-mono tabular-nums">
          {sym}{formatAmount(exposure.totalForeignAmount)}
        </p>
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatSEK(exposure.currentSekValue)} SEK
        </p>
        <div className="mt-3 pt-3 border-t space-y-1">
          <FXIndicator label="Orealiserat" amount={exposure.unrealizedGainLoss} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Bokförd kurs: {formatAmount(exposure.averageBookedRate, 4)}</span>
            <span>Aktuell: {formatAmount(exposure.currentRate, 4)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FXIndicator({ label, amount }: { label: string; amount: number }) {
  const isGain = amount >= 0
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className={cn(
        'flex items-center gap-1 text-sm font-medium tabular-nums',
        isGain ? 'text-green-600' : 'text-red-600'
      )}>
        {isGain ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
        <span>{isGain ? '+' : ''}{formatSEK(amount)} kr</span>
      </div>
    </div>
  )
}

function FXBadge({ amount }: { amount: number }) {
  if (amount === 0) return <span className="text-sm text-muted-foreground">—</span>
  const isGain = amount > 0
  return (
    <span className={cn(
      'text-sm font-mono tabular-nums font-medium',
      isGain ? 'text-green-600' : 'text-red-600'
    )}>
      {isGain ? '+' : ''}{formatSEK(amount)}
    </span>
  )
}

function SortableHead({
  field, label, current, dir, onSort, className,
}: {
  field: SortField
  label: string
  current: SortField
  dir: SortDir
  onSort: (f: SortField) => void
  className?: string
}) {
  const isActive = current === field
  return (
    <TableHead className={className}>
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(field)}
      >
        {label}
        <ArrowUpDown className={cn('h-3 w-3', isActive ? 'text-foreground' : 'text-muted-foreground/50')} />
        {isActive && <span className="text-xs">{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </TableHead>
  )
}
