'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Loader2,
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ImportSource = 'Clio' | 'Maconomy' | 'CSV' | 'Annat'
type ImportStatus = 'Importerad' | 'Validerad' | 'Fel'

interface ImportedRow {
  id: string
  date: string
  lawyerName: string
  caseRef: string
  clientName: string
  hours: number
  description: string
  billable: boolean
  status: ImportStatus
  errorMessage: string
}

interface ImportBatch {
  id: string
  source: ImportSource
  importDate: string
  fileName: string
  rowCount: number
  validCount: number
  errorCount: number
  rows: ImportedRow[]
}

const IMPORT_SOURCES: ImportSource[] = ['Clio', 'Maconomy', 'CSV', 'Annat']

const STATUS_COLORS: Record<ImportStatus, string> = {
  'Importerad': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Validerad': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Fel': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function parseCsv(text: string): ImportedRow[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(';').map((h) => h.trim().toLowerCase())
  const rows: ImportedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';').map((c) => c.trim())
    if (cols.length < 3) continue

    const dateIdx = headers.findIndex((h) => h.includes('datum') || h === 'date')
    const lawyerIdx = headers.findIndex((h) => h.includes('jurist') || h.includes('lawyer') || h.includes('namn'))
    const caseIdx = headers.findIndex((h) => h.includes('arende') || h.includes('case') || h.includes('matter'))
    const clientIdx = headers.findIndex((h) => h.includes('klient') || h.includes('client'))
    const hoursIdx = headers.findIndex((h) => h.includes('timmar') || h.includes('hours') || h.includes('tid'))
    const descIdx = headers.findIndex((h) => h.includes('beskrivning') || h.includes('description') || h.includes('text'))
    const billableIdx = headers.findIndex((h) => h.includes('debiterbar') || h.includes('billable'))

    const hours = hoursIdx >= 0 ? parseFloat(cols[hoursIdx]?.replace(',', '.') || '0') : 0
    const hasError = isNaN(hours) || hours <= 0 || (dateIdx >= 0 && !cols[dateIdx])

    rows.push({
      id: generateId(),
      date: dateIdx >= 0 ? cols[dateIdx] || '' : '',
      lawyerName: lawyerIdx >= 0 ? cols[lawyerIdx] || '' : '',
      caseRef: caseIdx >= 0 ? cols[caseIdx] || '' : '',
      clientName: clientIdx >= 0 ? cols[clientIdx] || '' : '',
      hours: isNaN(hours) ? 0 : hours,
      description: descIdx >= 0 ? cols[descIdx] || '' : '',
      billable: billableIdx >= 0 ? cols[billableIdx]?.toLowerCase() === 'ja' || cols[billableIdx] === '1' : true,
      status: hasError ? 'Fel' : 'Importerad',
      errorMessage: hasError ? (isNaN(hours) || hours <= 0 ? 'Ogiltigt timantal' : 'Datum saknas') : '',
    })
  }
  return rows
}

export function TidrapportImportJuridikWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [batches, setBatches] = useState<ImportBatch[]>([])

  const [importSource, setImportSource] = useState<ImportSource>('CSV')
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')

  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [batchToDelete, setBatchToDelete] = useState<ImportBatch | null>(null)

  const saveBatches = useCallback(async (newBatches: ImportBatch[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'import_batches',
        config_value: newBatches,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'import_batches')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setBatches(data.config_value as ImportBatch[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchBatches() }, [fetchBatches])

  const summary = useMemo(() => {
    const totalRows = batches.reduce((s, b) => s + b.rowCount, 0)
    const totalValid = batches.reduce((s, b) => s + b.validCount, 0)
    const totalErrors = batches.reduce((s, b) => s + b.errorCount, 0)
    const totalHours = batches.reduce((s, b) => s + b.rows.reduce((rs, r) => rs + (r.status !== 'Fel' ? r.hours : 0), 0), 0)
    return { totalRows, totalValid, totalErrors, totalHours, batchCount: batches.length }
  }, [batches])

  async function handleImport() {
    if (!csvText.trim()) return

    const rows = parseCsv(csvText)
    if (rows.length === 0) return

    const validCount = rows.filter((r) => r.status !== 'Fel').length
    const errorCount = rows.filter((r) => r.status === 'Fel').length

    const batch: ImportBatch = {
      id: generateId(),
      source: importSource,
      importDate: new Date().toISOString().slice(0, 10),
      fileName: fileName || `import-${new Date().toISOString().slice(0, 10)}.csv`,
      rowCount: rows.length,
      validCount,
      errorCount,
      rows,
    }

    const updated = [batch, ...batches]
    setBatches(updated)
    setCsvText('')
    setFileName('')
    setSelectedBatch(batch)
    await saveBatches(updated)
  }

  async function handleValidateBatch(batch: ImportBatch) {
    const updatedRows = batch.rows.map((r) =>
      r.status === 'Importerad' ? { ...r, status: 'Validerad' as ImportStatus } : r
    )
    const updatedBatch = { ...batch, rows: updatedRows, validCount: updatedRows.filter((r) => r.status === 'Validerad').length }
    const updated = batches.map((b) => b.id === batch.id ? updatedBatch : b)
    setBatches(updated)
    if (selectedBatch?.id === batch.id) setSelectedBatch(updatedBatch)
    await saveBatches(updated)
  }

  function openDeleteConfirmation(batch: ImportBatch) {
    setBatchToDelete(batch)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteBatch() {
    if (!batchToDelete) return
    const updated = batches.filter((b) => b.id !== batchToDelete.id)
    setBatches(updated)
    setDeleteDialogOpen(false)
    setBatchToDelete(null)
    if (selectedBatch?.id === batchToDelete.id) setSelectedBatch(null)
    await saveBatches(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="import"
        sectorName="Juridik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
      >
        <Tabs defaultValue="import" className="space-y-6">
          <TabsList>
            <TabsTrigger value="import">Importera</TabsTrigger>
            <TabsTrigger value="historik">Importhistorik</TabsTrigger>
            <TabsTrigger value="detaljer">Detaljer</TabsTrigger>
          </TabsList>

          {/* Import tab */}
          <TabsContent value="import" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Totalt importerade" value={String(summary.totalRows)} />
              <KPICard label="Validerade" value={String(summary.totalValid)} />
              <KPICard label="Felaktiga" value={String(summary.totalErrors)} trend={summary.totalErrors > 0 ? 'down' : 'up'} />
              <KPICard label="Importerade timmar" value={fmt(summary.totalHours)} unit="h" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Importera tidrapporter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="import-source">Kalla</Label>
                    <Select value={importSource} onValueChange={(val) => setImportSource(val as ImportSource)}>
                      <SelectTrigger id="import-source"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {IMPORT_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="import-file">Filnamn</Label>
                    <Input
                      id="import-file"
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      placeholder="tidrapport.csv"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="import-csv">CSV-data (semikolonseparerad)</Label>
                  <Textarea
                    id="import-csv"
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder={"Datum;Jurist;Arende;Klient;Timmar;Beskrivning;Debiterbar\n2024-01-15;Anna Svensson;2024-001;Klient AB;2.5;Kontraktsgranskning;Ja"}
                    className="min-h-[150px] font-mono text-xs"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={handleImport} disabled={!csvText.trim() || saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Importera
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Format: semikolonseparerad CSV med rubriker. Stod for Clio- och Maconomy-format.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History */}
          <TabsContent value="historik" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : batches.length === 0 ? (
              <EmptyModuleState
                icon={FileText}
                title="Ingen importhistorik"
                description="Importera tidrapporter for att bygga upp historiken."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">Kalla</TableHead>
                      <TableHead className="font-medium">Fil</TableHead>
                      <TableHead className="font-medium text-right">Rader</TableHead>
                      <TableHead className="font-medium text-right">OK</TableHead>
                      <TableHead className="font-medium text-right">Fel</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((batch) => (
                      <TableRow key={batch.id} className={cn(selectedBatch?.id === batch.id && 'bg-accent/50')}>
                        <TableCell>{batch.importDate}</TableCell>
                        <TableCell><Badge variant="outline">{batch.source}</Badge></TableCell>
                        <TableCell className="font-mono text-sm">{batch.fileName}</TableCell>
                        <TableCell className="text-right tabular-nums">{batch.rowCount}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">{batch.validCount}</TableCell>
                        <TableCell className="text-right tabular-nums text-red-600">{batch.errorCount}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedBatch(batch)}>
                              Visa
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleValidateBatch(batch)} disabled={batch.validCount === batch.rowCount - batch.errorCount}>
                              <CheckCircle className="mr-1 h-3.5 w-3.5" />
                              Validera
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(batch)} title="Ta bort">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Details */}
          <TabsContent value="detaljer" className="space-y-4">
            {!selectedBatch ? (
              <EmptyModuleState
                icon={FileText}
                title="Ingen import vald"
                description="Valj en import fran historiken for att se detaljerna."
              />
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">{selectedBatch.fileName}</h3>
                    <p className="text-xs text-muted-foreground">{selectedBatch.importDate} - {selectedBatch.source} - {selectedBatch.rowCount} rader</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Jurist</TableHead>
                        <TableHead className="font-medium">Arende</TableHead>
                        <TableHead className="font-medium">Klient</TableHead>
                        <TableHead className="font-medium text-right">Timmar</TableHead>
                        <TableHead className="font-medium">Debiterbar</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedBatch.rows.map((row) => (
                        <TableRow key={row.id} className={cn(row.status === 'Fel' && 'bg-red-50 dark:bg-red-950/10')}>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{row.lawyerName}</TableCell>
                          <TableCell className="font-mono text-sm">{row.caseRef}</TableCell>
                          <TableCell>{row.clientName}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(row.hours)}</TableCell>
                          <TableCell>{row.billable ? 'Ja' : 'Nej'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className={STATUS_COLORS[row.status]}>{row.status}</Badge>
                              {row.status === 'Fel' && (
                                <span className="text-xs text-red-600">{row.errorMessage}</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort import</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort importen{' '}
              <span className="font-semibold">{batchToDelete?.fileName}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteBatch}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
