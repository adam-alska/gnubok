'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { useExtensionData } from '@/lib/extensions/use-extension-data'
import { useMockData } from '@/lib/extensions/use-mock-data'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import MockDataBanner from '@/components/extensions/shared/MockDataBanner'
import MockDataImportDialog from '@/components/extensions/shared/MockDataImportDialog'
import type { CsvFieldDef } from '@/components/extensions/shared/MockDataImportDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertTriangle, Plus, Pencil, Trash2, FileSpreadsheet, Clock,
  ChevronDown, ChevronUp, Package, FlaskConical,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

interface IntrastatLine {
  cnCode: string
  partnerCountry: string
  countryOfOrigin: string
  transactionNature: string
  deliveryTerms: string
  invoicedValue: number
  netMass: number
  supplementaryUnit: number | null
  supplementaryUnitType: string | null
  partnerVatId: string
}

interface ThresholdStatus {
  cumulativeValue: number
  threshold: number
  isObligated: boolean
  percentageUsed: number
}

interface IntrastatWarning {
  type: string
  severity: 'error' | 'warning'
  invoiceId?: string
  invoiceNumber?: string
  productId?: string
  message: string
}

interface ReportData {
  period: { year: number; month: number }
  reporterVatNumber: string
  reporterName: string
  lines: IntrastatLine[]
  totals: { invoicedValue: number; netMass: number; lineCount: number }
  thresholdStatus: ThresholdStatus
  warnings: IntrastatWarning[]
  invoiceCount: number
}

interface ProductRecord {
  key: string
  productId: string
  description: string
  cn_code: string | null
  net_weight_kg: number | null
  country_of_origin: string
}

interface ProductForm {
  productId: string
  description: string
  cnCode: string
  netWeightKg: string
  countryOfOrigin: string
}

// ── Helpers ───────────────────────────────────────────────────

function formatSEK(amount: number): string {
  return Math.round(amount).toLocaleString('sv-SE')
}

const MONTHS = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
]

function currentYear(): number { return new Date().getFullYear() }
function currentMonth(): number { return new Date().getMonth() + 1 }

const EMPTY_PRODUCT: ProductForm = {
  productId: '', description: '', cnCode: '', netWeightKg: '', countryOfOrigin: 'SE',
}

// ── Mock Data Config ──────────────────────────────────────────

const MOCK_CSV_FIELDS: CsvFieldDef[] = [
  { key: 'cnCode', label: 'CN-kod', required: true },
  { key: 'partnerCountry', label: 'Partnerland', required: true },
  { key: 'countryOfOrigin', label: 'Ursprungsland' },
  { key: 'transactionNature', label: 'Transaktionstyp' },
  { key: 'deliveryTerms', label: 'Leveransvillkor' },
  { key: 'invoicedValue', label: 'Fakturerat värde (SEK)', required: true },
  { key: 'netMass', label: 'Nettovikt (kg)' },
  { key: 'partnerVatId', label: 'Partner VAT-ID' },
]

const MOCK_CSV_TEMPLATE = `cnCode;partnerCountry;countryOfOrigin;transactionNature;deliveryTerms;invoicedValue;netMass;partnerVatId
72163100;DE;SE;11;DAP;245000;4500;DE123456789
84713000;FR;CN;11;EXW;128000;85;FR987654321
39269090;NL;SE;11;FCA;67000;320;NL456789012`

function parseMockCsvRows(rows: Record<string, string>[]): ReportData {
  const lines: IntrastatLine[] = rows.map(r => ({
    cnCode: r.cnCode || '00000000',
    partnerCountry: r.partnerCountry || '',
    countryOfOrigin: r.countryOfOrigin || 'SE',
    transactionNature: r.transactionNature || '11',
    deliveryTerms: r.deliveryTerms || 'DAP',
    invoicedValue: parseFloat(r.invoicedValue || '0') || 0,
    netMass: parseFloat(r.netMass || '0') || 0,
    supplementaryUnit: null,
    supplementaryUnitType: null,
    partnerVatId: r.partnerVatId || '',
  }))

  const invoicedValue = lines.reduce((s, l) => s + l.invoicedValue, 0)
  const netMass = lines.reduce((s, l) => s + l.netMass, 0)

  return {
    period: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
    reporterVatNumber: 'SE000000000001',
    reporterName: 'Testdata',
    lines,
    totals: { invoicedValue, netMass, lineCount: lines.length },
    thresholdStatus: {
      cumulativeValue: invoicedValue,
      threshold: 9000000,
      isObligated: invoicedValue >= 9000000,
      percentageUsed: Math.round(invoicedValue / 9000000 * 100),
    },
    warnings: [],
    invoiceCount: lines.length,
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

export default function IntrastatWorkspace({ userId }: WorkspaceComponentProps) {
  void userId

  // Mock data
  const { mockReport, isMockActive, isLoading: mockLoading, importedAt, saveMockData, clearMockData } = useMockData<ReportData>('export', 'intrastat')
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  const [year, setYear] = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())

  const [report, setReport] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const [warningsExpanded, setWarningsExpanded] = useState(false)

  // Product CRUD
  const { data: extData, save, remove, isLoading: productsLoading } = useExtensionData('export', 'intrastat')
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<string | null>(null)
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const years = useMemo(() => {
    const cy = currentYear()
    return [cy, cy - 1, cy - 2]
  }, [])

  // Parse products from extension data
  const products: ProductRecord[] = useMemo(() => {
    return extData
      .filter(d => d.key.startsWith('product:'))
      .map(d => ({
        key: d.key,
        productId: d.key.replace('product:', ''),
        description: String(d.value.description || ''),
        cn_code: d.value.cn_code ? String(d.value.cn_code) : null,
        net_weight_kg: d.value.net_weight_kg !== undefined ? Number(d.value.net_weight_kg) : null,
        country_of_origin: String(d.value.country_of_origin || 'SE'),
      }))
      .sort((a, b) => a.description.localeCompare(b.description))
  }, [extData])

  // Fetch report
  const fetchReport = useCallback(async () => {
    if (isMockActive && mockReport) {
      setReport(mockReport)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) })
      const res = await fetch(`/api/extensions/export/intrastat/report?${params}`)
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Kunde inte generera rapporten')
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
    }
  }, [year, month, isMockActive, mockReport])

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
      const params = new URLSearchParams({ year: String(year), month: String(month) })
      const res = await fetch(`/api/extensions/export/intrastat/report?${params}`)
      if (res.ok) {
        const json = await res.json()
        setReport(json.data)
      }
    } catch { /* ignore */ }
    setIsLoading(false)
  }, [clearMockData, year, month])

  // Product CRUD handlers
  const openNewProduct = () => {
    setEditingProduct(null)
    setProductForm(EMPTY_PRODUCT)
    setProductDialogOpen(true)
  }

  const openEditProduct = (productId: string) => {
    const product = products.find(p => p.productId === productId)
    if (!product) return
    setEditingProduct(productId)
    setProductForm({
      productId,
      description: product.description,
      cnCode: product.cn_code || '',
      netWeightKg: product.net_weight_kg !== null ? String(product.net_weight_kg) : '',
      countryOfOrigin: product.country_of_origin,
    })
    setProductDialogOpen(true)
  }

  const saveProduct = async () => {
    const id = editingProduct || productForm.productId.trim()
    if (!id) return

    await save(`product:${id}`, {
      description: productForm.description.trim(),
      cn_code: productForm.cnCode.trim() || null,
      net_weight_kg: productForm.netWeightKg ? parseFloat(productForm.netWeightKg) : null,
      country_of_origin: productForm.countryOfOrigin || 'SE',
    })

    setProductDialogOpen(false)
    // Refresh report to pick up new product metadata
    fetchReport()
  }

  const deleteProduct = async (productId: string) => {
    await remove(`product:${productId}`)
    setDeleteConfirm(null)
    fetchReport()
  }

  // Download handler
  const handleDownload = async () => {
    setDownloading(true)
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) })
      const res = await fetch(`/api/extensions/export/intrastat/download?${params}`)
      if (!res.ok) {
        setError('Kunde inte ladda ner filen')
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename="(.+)"/)
      const filename = match ? match[1] : `INTRASTAT_${year}-${String(month).padStart(2, '0')}.csv`

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
      setDownloading(false)
    }
  }

  const errorCount = report?.warnings.filter(w => w.severity === 'error').length ?? 0
  const warningCount = report?.warnings.filter(w => w.severity === 'warning').length ?? 0

  if ((isLoading || productsLoading || mockLoading) && !report) {
    return <ExtensionLoadingSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* ── Period Selector ─────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">År</label>
          <Select value={String(year)} onValueChange={v => setYear(parseInt(v, 10))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Månad</label>
          <Select value={String(month)} onValueChange={v => setMonth(parseInt(v, 10))}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button
            variant="outline" size="sm"
            onClick={() => setImportDialogOpen(true)}
          >
            <FlaskConical className="h-4 w-4 mr-1.5" />
            Importera testdata
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={handleDownload}
            disabled={downloading || !report || report.lines.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            {downloading ? 'Laddar...' : 'IDEP.web CSV'}
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
          {/* ── Threshold Progress ───────────────────────────── */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Tröskelvärde Intrastat (utförsel)</p>
                <Badge variant={report.thresholdStatus.isObligated ? 'destructive' : 'outline'}>
                  {report.thresholdStatus.isObligated ? 'Obligatorisk rapportering' : 'Frivillig rapportering'}
                </Badge>
              </div>
              <Progress
                value={Math.min(report.thresholdStatus.percentageUsed, 100)}
                className="h-3"
              />
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>
                  Ackumulerat (12 mån): {formatSEK(report.thresholdStatus.cumulativeValue)} SEK
                </span>
                <span>
                  {report.thresholdStatus.percentageUsed}% av {formatSEK(report.thresholdStatus.threshold)} SEK
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ── KPI Row ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Fakturerat värde</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">{formatSEK(report.totals.invoicedValue)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">SEK</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Nettovikt</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">{report.totals.netMass.toLocaleString('sv-SE')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">kg</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Deklarationsrader</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">{report.totals.lineCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{report.invoiceCount} fakturor</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Product Registry ─────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Produktregister
                </CardTitle>
                <Button variant="outline" size="sm" onClick={openNewProduct}>
                  <Plus className="h-4 w-4 mr-1" />
                  Lägg till
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Inga produkter registrerade. Lägg till produkter med CN-kod och vikt för att generera Intrastat-deklarationer.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produkt</TableHead>
                        <TableHead>CN-kod</TableHead>
                        <TableHead className="text-right">Vikt (kg)</TableHead>
                        <TableHead>Ursprung</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map(p => (
                        <TableRow key={p.productId}>
                          <TableCell className="text-sm">
                            <div>
                              <span className="font-medium">{p.description || p.productId}</span>
                              {p.productId !== p.description && (
                                <span className="text-xs text-muted-foreground ml-1">({p.productId})</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {p.cn_code ? (
                              <Badge variant="outline" className="font-mono text-xs">{p.cn_code}</Badge>
                            ) : (
                              <span className="text-destructive text-xs flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> Saknas
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {p.net_weight_kg !== null
                              ? String(p.net_weight_kg)
                              : <span className="text-muted-foreground">—</span>
                            }
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {p.country_of_origin}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              <Button variant="ghost" size="sm" onClick={() => openEditProduct(p.productId)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(p.productId)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Declaration Table ─────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Deklaration {MONTHS[month - 1]} {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Inga EU-varuförsäljningar hittades för perioden.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CN-kod</TableHead>
                        <TableHead>Land</TableHead>
                        <TableHead>Urspr.</TableHead>
                        <TableHead className="text-right">Värde (SEK)</TableHead>
                        <TableHead className="text-right">Vikt (kg)</TableHead>
                        <TableHead>Partner-VAT</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.lines.map((line, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Badge
                              variant={line.cnCode === '00000000' ? 'destructive' : 'outline'}
                              className="font-mono text-xs"
                            >
                              {line.cnCode}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{line.partnerCountry}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{line.countryOfOrigin}</TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatSEK(line.invoicedValue)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {line.netMass > 0 ? line.netMass.toLocaleString('sv-SE') : '—'}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{line.partnerVatId || '—'}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 font-medium">
                        <TableCell colSpan={3} className="text-sm">Summa</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatSEK(report.totals.invoicedValue)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {report.totals.netMass.toLocaleString('sv-SE')}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Warnings ─────────────────────────────────────── */}
          {report.warnings.length > 0 && (
            <Card className={cn('border-l-4', errorCount > 0 ? 'border-l-destructive' : 'border-l-warning')}>
              <CardContent className="pt-6">
                <button className="flex items-center gap-2 w-full text-left" onClick={() => setWarningsExpanded(!warningsExpanded)}>
                  <AlertTriangle className={cn('h-4 w-4 shrink-0', errorCount > 0 ? 'text-destructive' : 'text-warning-foreground')} />
                  <span className="text-sm font-medium flex-1">
                    {errorCount > 0 && <span className="text-destructive">{errorCount} fel</span>}
                    {errorCount > 0 && warningCount > 0 && ', '}
                    {warningCount > 0 && <span className="text-warning-foreground">{warningCount} varningar</span>}
                  </span>
                  {warningsExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {warningsExpanded && (
                  <div className="mt-4 space-y-2">
                    {report.warnings.map((w, i) => (
                      <div key={i} className={cn('flex items-start gap-2 text-sm py-2 px-3 rounded-md', w.severity === 'error' ? 'bg-destructive/5 text-destructive' : 'bg-warning/10 text-warning-foreground')}>
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{w.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Deadline Footer ───────────────────────────────── */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Clock className="h-3.5 w-3.5" />
            <span>
              Deadline: 10:e arbetsdagen efter redovisningsperiodens slut
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
        templateFileName="intrastat-template.csv"
        onImport={handleMockImport}
      />

      {/* ── Product Dialog ────────────────────────────────────── */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Redigera produkt' : 'Lägg till produkt'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editingProduct && (
              <div className="space-y-1.5">
                <Label htmlFor="productId">Produkt-ID (SKU)</Label>
                <Input
                  id="productId"
                  value={productForm.productId}
                  onChange={e => setProductForm(f => ({ ...f, productId: e.target.value }))}
                  placeholder="T.ex. STALBALK-M8"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="description">Beskrivning</Label>
              <Input
                id="description"
                value={productForm.description}
                onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))}
                placeholder="T.ex. Stålbalk M8 200mm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnCode">CN-kod (8 siffror)</Label>
              <Input
                id="cnCode"
                value={productForm.cnCode}
                onChange={e => setProductForm(f => ({ ...f, cnCode: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
                placeholder="T.ex. 72163100"
                maxLength={8}
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="weight">Nettovikt per enhet (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.001"
                  value={productForm.netWeightKg}
                  onChange={e => setProductForm(f => ({ ...f, netWeightKg: e.target.value }))}
                  placeholder="45.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="origin">Ursprungsland</Label>
                <Input
                  id="origin"
                  value={productForm.countryOfOrigin}
                  onChange={e => setProductForm(f => ({ ...f, countryOfOrigin: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="SE"
                  maxLength={2}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>Avbryt</Button>
            <Button
              onClick={saveProduct}
              disabled={!editingProduct && !productForm.productId.trim()}
            >
              {editingProduct ? 'Spara' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ───────────────────────────────── */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort produkt?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Är du säker på att du vill ta bort produkten &ldquo;{deleteConfirm}&rdquo;? Denna åtgärd kan inte ångras.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Avbryt</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteProduct(deleteConfirm)}>
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
