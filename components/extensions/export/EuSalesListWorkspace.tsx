'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useMockData } from '@/lib/extensions/use-mock-data'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import MockDataBanner from '@/components/extensions/shared/MockDataBanner'
import MockDataImportDialog from '@/components/extensions/shared/MockDataImportDialog'
import type { CsvFieldDef } from '@/components/extensions/shared/MockDataImportDialog'
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
  AlertTriangle, CheckCircle2, FileSpreadsheet, FileCode,
  Clock, ChevronDown, ChevronUp, Users, Package, Briefcase,
  FlaskConical,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

interface ECSalesListLine {
  customerVatNumber: string
  customerName: string
  customerCountry: string
  customerId: string
  goodsAmount: number
  servicesAmount: number
  triangulationAmount: number
  invoiceCount: number
}

interface ECSalesListWarning {
  type: string
  severity: 'error' | 'warning'
  invoiceId?: string
  invoiceNumber?: string
  customerId?: string
  customerName?: string
  message: string
}

interface CrossCheckResult {
  box35Match: boolean
  box35ReportTotal: number
  box35GLTotal: number
  box39Match: boolean
  box39ReportTotal: number
  box39GLTotal: number
}

interface ReportData {
  period: { year: number; month?: number; quarter?: number }
  filingType: 'monthly' | 'quarterly'
  reporterVatNumber: string
  reporterName: string
  lines: ECSalesListLine[]
  totals: { goods: number; services: number; triangulation: number; total: number }
  warnings: ECSalesListWarning[]
  crossCheck: CrossCheckResult | null
  invoiceCount: number
  customerCount: number
  deadline: string
  daysUntilDeadline: number
}

type SortField = 'country' | 'vatNumber' | 'goods' | 'services' | 'invoices'
type SortDir = 'asc' | 'desc'

// ── Helpers ───────────────────────────────────────────────────

function formatSEK(amount: number): string {
  return Math.round(amount).toLocaleString('sv-SE')
}

function formatDeadlineDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' })
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

// ── Mock Data Config ──────────────────────────────────────────

const MOCK_CSV_FIELDS: CsvFieldDef[] = [
  { key: 'customerVatNumber', label: 'VAT-nummer', required: true },
  { key: 'customerName', label: 'Kundnamn', required: true },
  { key: 'customerCountry', label: 'Land', required: true },
  { key: 'goodsAmount', label: 'Varor (SEK)' },
  { key: 'servicesAmount', label: 'Tjänster (SEK)' },
  { key: 'triangulationAmount', label: 'Trepartshandel (SEK)' },
  { key: 'invoiceCount', label: 'Antal fakturor' },
]

const MOCK_CSV_TEMPLATE = `customerVatNumber;customerName;customerCountry;goodsAmount;servicesAmount;triangulationAmount;invoiceCount
DE123456789;Beispiel GmbH;DE;150000;25000;0;3
FR987654321;Exemple SARL;FR;0;80000;0;2
NL456789012;Voorbeeld BV;NL;45000;0;12000;1`

function parseMockCsvRows(rows: Record<string, string>[]): ReportData {
  const lines: ECSalesListLine[] = rows.map(r => ({
    customerVatNumber: r.customerVatNumber || '',
    customerName: r.customerName || '',
    customerCountry: r.customerCountry || '',
    customerId: r.customerVatNumber || '',
    goodsAmount: parseFloat(r.goodsAmount || '0') || 0,
    servicesAmount: parseFloat(r.servicesAmount || '0') || 0,
    triangulationAmount: parseFloat(r.triangulationAmount || '0') || 0,
    invoiceCount: parseInt(r.invoiceCount || '1', 10) || 1,
  }))

  const goods = lines.reduce((s, l) => s + l.goodsAmount, 0)
  const services = lines.reduce((s, l) => s + l.servicesAmount, 0)
  const triangulation = lines.reduce((s, l) => s + l.triangulationAmount, 0)
  const invoiceCount = lines.reduce((s, l) => s + l.invoiceCount, 0)

  return {
    period: { year: new Date().getFullYear(), quarter: Math.ceil((new Date().getMonth() + 1) / 3) },
    filingType: 'quarterly',
    reporterVatNumber: 'SE000000000001',
    reporterName: 'Testdata',
    lines,
    totals: { goods, services, triangulation, total: goods + services + triangulation },
    warnings: [],
    crossCheck: null,
    invoiceCount,
    customerCount: lines.length,
    deadline: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    daysUntilDeadline: 30,
  }
}

function validateMockReport(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Data måste vara ett objekt' }
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.lines)) return { valid: false, error: 'Fältet "lines" saknas eller är inte en array' }
  if (!obj.totals || typeof obj.totals !== 'object') return { valid: false, error: 'Fältet "totals" saknas' }
  return { valid: true }
}

// ── Component ─────────────────────────────────────────────────

export default function EuSalesListWorkspace({ userId }: WorkspaceComponentProps) {
  void userId

  // Mock data
  const { mockReport, isMockActive, isLoading: mockLoading, importedAt, saveMockData, clearMockData } = useMockData<ReportData>('export', 'eu-sales-list')
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // Period selection state
  const [year, setYear] = useState(currentYear())
  const [periodType, setPeriodType] = useState<'monthly' | 'quarterly'>('quarterly')
  const [month, setMonth] = useState(currentMonth())
  const [quarter, setQuarter] = useState(currentQuarter())

  // Report state
  const [report, setReport] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Table sort
  const [sortField, setSortField] = useState<SortField>('country')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Warning expansion
  const [warningsExpanded, setWarningsExpanded] = useState(false)

  // Download state
  const [downloading, setDownloading] = useState<'csv' | 'xml' | null>(null)

  // Available years (current year and 2 previous)
  const years = useMemo(() => {
    const cy = currentYear()
    return [cy, cy - 1, cy - 2]
  }, [])

  // Fetch report
  const fetchReport = useCallback(async () => {
    if (isMockActive && mockReport) {
      setReport(mockReport)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    const params = new URLSearchParams({ year: String(year) })
    if (periodType === 'monthly') {
      params.set('month', String(month))
    } else {
      params.set('quarter', String(quarter))
    }

    try {
      const res = await fetch(`/api/extensions/export/eu-sales-list/report?${params}`)
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
  }, [year, month, quarter, periodType, isMockActive, mockReport])

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
    // Re-fetch from API
    setIsLoading(true)
    setError(null)
    const params = new URLSearchParams({ year: String(year) })
    if (periodType === 'monthly') {
      params.set('month', String(month))
    } else {
      params.set('quarter', String(quarter))
    }
    try {
      const res = await fetch(`/api/extensions/export/eu-sales-list/report?${params}`)
      if (res.ok) {
        const json = await res.json()
        setReport(json.data)
      }
    } catch { /* ignore */ }
    setIsLoading(false)
  }, [clearMockData, year, month, quarter, periodType])

  // Sort lines
  const sortedLines = useMemo(() => {
    if (!report) return []
    const lines = [...report.lines]
    lines.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'country':
          cmp = a.customerCountry.localeCompare(b.customerCountry)
          break
        case 'vatNumber':
          cmp = a.customerVatNumber.localeCompare(b.customerVatNumber)
          break
        case 'goods':
          cmp = a.goodsAmount - b.goodsAmount
          break
        case 'services':
          cmp = a.servicesAmount - b.servicesAmount
          break
        case 'invoices':
          cmp = a.invoiceCount - b.invoiceCount
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return lines
  }, [report, sortField, sortDir])

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Download handler
  const handleDownload = async (format: 'csv' | 'xml') => {
    setDownloading(format)
    const params = new URLSearchParams({ year: String(year), format })
    if (periodType === 'monthly') {
      params.set('month', String(month))
    } else {
      params.set('quarter', String(quarter))
    }

    try {
      const res = await fetch(`/api/extensions/export/eu-sales-list/download?${params}`)
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Kunde inte ladda ner filen')
        return
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const filenameMatch = disposition.match(/filename="(.+)"/)
      const filename = filenameMatch ? filenameMatch[1] : `PS_${year}.${format}`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Kunde inte ladda ner filen')
    } finally {
      setDownloading(null)
    }
  }

  // Derived counts
  const errorCount = report?.warnings.filter(w => w.severity === 'error').length ?? 0
  const warningCount = report?.warnings.filter(w => w.severity === 'warning').length ?? 0

  if ((isLoading || mockLoading) && !report) {
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

        {/* Download + Import buttons */}
        <div className="flex gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
          >
            <FlaskConical className="h-4 w-4 mr-1.5" />
            Importera testdata
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload('csv')}
            disabled={downloading !== null || !report || report.lines.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            {downloading === 'csv' ? 'Laddar...' : 'CSV'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleDownload('xml')}
            disabled={downloading !== null || !report || report.lines.length === 0}
          >
            <FileCode className="h-4 w-4 mr-1.5" />
            {downloading === 'xml' ? 'Laddar...' : 'SKV XML'}
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
          {/* ── KPI Cards ────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Varuförsäljning EU"
              value={formatSEK(report.totals.goods)}
              suffix="SEK"
            />
            <KPICard
              label="Tjänsteförsäljning EU"
              value={formatSEK(report.totals.services)}
              suffix="SEK"
            />
            <KPICard
              label="Trepartshandel"
              value={formatSEK(report.totals.triangulation)}
              suffix="SEK"
            />
            <KPICard
              label="Kunder"
              value={report.customerCount}
              suffix={`(${report.invoiceCount} fakturor)`}
            />
          </div>

          {/* ── Deadline + Cross-Check Row ────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Deadline */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Inlämningsdeadline</p>
                    <p className="text-lg font-semibold mt-0.5">
                      {formatDeadlineDate(report.deadline)}
                    </p>
                    <p className={cn(
                      'text-sm mt-1',
                      report.daysUntilDeadline <= 7 ? 'text-destructive font-medium' :
                      report.daysUntilDeadline <= 14 ? 'text-warning-foreground' :
                      'text-muted-foreground'
                    )}>
                      {report.daysUntilDeadline > 0
                        ? `${report.daysUntilDeadline} dagar kvar`
                        : report.daysUntilDeadline === 0
                          ? 'Deadline idag!'
                          : `${Math.abs(report.daysUntilDeadline)} dagar försenad`
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cross-check */}
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm font-medium mb-3">Avstämning mot huvudbok</p>
                {report.crossCheck ? (
                  <div className="space-y-2">
                    <CrossCheckRow
                      label="Ruta 35 — varor"
                      reportTotal={report.crossCheck.box35ReportTotal}
                      glTotal={report.crossCheck.box35GLTotal}
                      match={report.crossCheck.box35Match}
                    />
                    <CrossCheckRow
                      label="Ruta 39 — tjänster"
                      reportTotal={report.crossCheck.box39ReportTotal}
                      glTotal={report.crossCheck.box39GLTotal}
                      match={report.crossCheck.box39Match}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ingen bokföringsdata tillgänglig för perioden.
                  </p>
                )}
              </CardContent>
            </Card>
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

          {/* ── Customer Table ────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Kunder per land
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sortedLines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Inga EU-försäljningar hittades för vald period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead field="country" current={sortField} dir={sortDir} onSort={toggleSort}>
                          Land
                        </SortableHead>
                        <SortableHead field="vatNumber" current={sortField} dir={sortDir} onSort={toggleSort}>
                          VAT-nummer
                        </SortableHead>
                        <TableHead className="text-left">Kund</TableHead>
                        <SortableHead field="goods" current={sortField} dir={sortDir} onSort={toggleSort} className="text-right">
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-3.5 w-3.5" />
                            Varor (ruta 35)
                          </span>
                        </SortableHead>
                        <SortableHead field="services" current={sortField} dir={sortDir} onSort={toggleSort} className="text-right">
                          <span className="inline-flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5" />
                            Tjänster (ruta 39)
                          </span>
                        </SortableHead>
                        <SortableHead field="invoices" current={sortField} dir={sortDir} onSort={toggleSort} className="text-right">
                          Fakturor
                        </SortableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedLines.map(line => (
                        <TableRow key={line.customerVatNumber}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {line.customerCountry}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {line.customerVatNumber}
                          </TableCell>
                          <TableCell className="text-sm">{line.customerName}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {line.goodsAmount !== 0 ? formatSEK(line.goodsAmount) : '—'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {line.servicesAmount !== 0 ? formatSEK(line.servicesAmount) : '—'}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {line.invoiceCount}
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* Totals row */}
                      <TableRow className="border-t-2 font-medium">
                        <TableCell colSpan={3} className="text-sm">
                          Summa ({sortedLines.length} kunder)
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatSEK(report.totals.goods)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatSEK(report.totals.services)}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {report.invoiceCount}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Filing Info Footer ────────────────────────────── */}
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>
              Uppgiftslämnare: {report.reporterName} ({report.reporterVatNumber})
            </span>
            <span>
              Redovisningsperiod: {report.period.year}
              {report.period.month !== undefined && `, ${MONTHS[report.period.month - 1]}`}
              {report.period.quarter !== undefined && `, ${QUARTERS[report.period.quarter - 1]}`}
            </span>
          </div>
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
        templateFileName="eu-sales-list-template.csv"
        onImport={handleMockImport}
      />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function CrossCheckRow({
  label,
  reportTotal,
  glTotal,
  match,
}: {
  label: string
  reportTotal: number
  glTotal: number
  match: boolean
}) {
  const diff = Math.round(reportTotal * 100) / 100 - Math.round(glTotal * 100) / 100

  return (
    <div className="flex items-center gap-2 text-sm">
      {match ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
      )}
      <span className="flex-1">{label}</span>
      <span className="font-mono tabular-nums text-muted-foreground">
        {formatSEK(reportTotal)} SEK
      </span>
      {!match && (
        <span className="font-mono tabular-nums text-destructive text-xs">
          (diff: {diff > 0 ? '+' : ''}{formatSEK(diff)})
        </span>
      )}
    </div>
  )
}

function SortableHead({
  field,
  current,
  dir,
  onSort,
  className,
  children,
}: {
  field: SortField
  current: SortField
  dir: SortDir
  onSort: (field: SortField) => void
  className?: string
  children: React.ReactNode
}) {
  const isActive = current === field
  return (
    <TableHead className={cn('cursor-pointer select-none', className)} onClick={() => onSort(field)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {isActive && (
          dir === 'asc'
            ? <ChevronUp className="h-3 w-3" />
            : <ChevronDown className="h-3 w-3" />
        )}
      </span>
    </TableHead>
  )
}
