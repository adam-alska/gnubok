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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
  Loader2,
  Upload,
  FileUp,
  Check,
  AlertTriangle,
  Trash2,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ImportSource = 'harvest' | 'toggl' | 'clockify' | 'csv'

interface TimeEntry {
  id: string
  date: string
  employee: string
  project: string
  client: string
  hours: number
  description: string
  billable: boolean
}

interface ImportHistory {
  id: string
  date: string
  source: ImportSource
  filename: string
  rowCount: number
  status: 'success' | 'error' | 'partial'
}

interface ColumnMapping {
  date: string
  employee: string
  project: string
  client: string
  hours: string
  description: string
  billable: string
}

const DEFAULT_MAPPING: ColumnMapping = {
  date: 'Date',
  employee: 'User',
  project: 'Project',
  client: 'Client',
  hours: 'Hours',
  description: 'Notes',
  billable: 'Billable',
}

const SOURCE_LABELS: Record<ImportSource, string> = {
  harvest: 'Harvest',
  toggl: 'Toggl Track',
  clockify: 'Clockify',
  csv: 'Generisk CSV',
}

const DEFAULT_HISTORY: ImportHistory[] = [
  { id: '1', date: '2024-06-15', source: 'harvest', filename: 'harvest_june.csv', rowCount: 245, status: 'success' },
  { id: '2', date: '2024-05-30', source: 'toggl', filename: 'toggl_may_export.csv', rowCount: 198, status: 'success' },
  { id: '3', date: '2024-05-01', source: 'csv', filename: 'timmar_april.csv', rowCount: 12, status: 'partial' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n)
}

export function TidrapportImportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [source, setSource] = useState<ImportSource>('harvest')
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_MAPPING)
  const [history, setHistory] = useState<ImportHistory[]>([])
  const [previewData, setPreviewData] = useState<TimeEntry[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [rawCsvRows, setRawCsvRows] = useState<string[][]>([])
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'preview' | 'done'>('upload')

  const saveHistory = useCallback(async (data: ImportHistory[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'import_history',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveMapping = useCallback(async (m: ColumnMapping) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'column_mapping',
        config_value: m,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const saveImportedEntries = useCallback(async (entries: TimeEntry[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Append to existing entries
    const { data: existing } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'time_entries')
      .maybeSingle()

    const prev = (existing?.config_value && Array.isArray(existing.config_value)) ? existing.config_value as TimeEntry[] : []
    const merged = [...prev, ...entries]

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'time_entries',
        config_value: merged,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: histData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'import_history')
      .maybeSingle()

    if (histData?.config_value && Array.isArray(histData.config_value)) {
      setHistory(histData.config_value as ImportHistory[])
    } else {
      setHistory(DEFAULT_HISTORY)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'import_history',
          config_value: DEFAULT_HISTORY,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: mapData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'column_mapping')
      .maybeSingle()

    if (mapData?.config_value && typeof mapData.config_value === 'object') {
      setMapping(mapData.config_value as ColumnMapping)
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  function parseCsv(text: string) {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
    setCsvHeaders(headers)

    const rows = lines.slice(1).map((line) =>
      line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
    )
    setRawCsvRows(rows)

    // Auto-map based on source
    if (source === 'harvest') {
      setMapping({ date: 'Date', employee: 'First Name', project: 'Project', client: 'Client', hours: 'Hours', description: 'Notes', billable: 'Billable?' })
    } else if (source === 'toggl') {
      setMapping({ date: 'Start date', employee: 'User', project: 'Project', client: 'Client', hours: 'Duration', description: 'Description', billable: 'Billable' })
    } else if (source === 'clockify') {
      setMapping({ date: 'Start Date', employee: 'User', project: 'Project', client: 'Client', hours: 'Duration (decimal)', description: 'Description', billable: 'Billable' })
    }

    setImportStep('mapping')
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      parseCsv(text)
    }
    reader.readAsText(file)
  }

  function generatePreview() {
    const headerIndexes: Record<string, number> = {}
    for (const h of csvHeaders) {
      headerIndexes[h] = csvHeaders.indexOf(h)
    }

    const getIdx = (field: string) => headerIndexes[field] ?? -1

    const entries: TimeEntry[] = rawCsvRows
      .map((row, idx) => {
        const dateIdx = getIdx(mapping.date)
        const empIdx = getIdx(mapping.employee)
        const projIdx = getIdx(mapping.project)
        const clientIdx = getIdx(mapping.client)
        const hoursIdx = getIdx(mapping.hours)
        const descIdx = getIdx(mapping.description)
        const billIdx = getIdx(mapping.billable)

        return {
          id: crypto.randomUUID(),
          date: dateIdx >= 0 ? row[dateIdx] ?? '' : '',
          employee: empIdx >= 0 ? row[empIdx] ?? '' : '',
          project: projIdx >= 0 ? row[projIdx] ?? '' : '',
          client: clientIdx >= 0 ? row[clientIdx] ?? '' : '',
          hours: hoursIdx >= 0 ? parseFloat(row[hoursIdx] ?? '0') || 0 : 0,
          description: descIdx >= 0 ? row[descIdx] ?? '' : '',
          billable: billIdx >= 0 ? ['yes', 'true', '1', 'ja'].includes((row[billIdx] ?? '').toLowerCase()) : false,
        }
      })
      .filter((e) => e.date && e.hours > 0)

    setPreviewData(entries)
    setImportStep('preview')
  }

  async function handleImport() {
    setSaving(true)
    await saveImportedEntries(previewData)
    await saveMapping(mapping)

    const newEntry: ImportHistory = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      source,
      filename: 'import.csv',
      rowCount: previewData.length,
      status: 'success',
    }
    const updatedHistory = [newEntry, ...history]
    setHistory(updatedHistory)
    await saveHistory(updatedHistory)

    setImportStep('done')
    setSaving(false)
  }

  const stats = useMemo(() => {
    const totalImports = history.length
    const totalRows = history.reduce((s, h) => s + h.rowCount, 0)
    const successCount = history.filter((h) => h.status === 'success').length
    return { totalImports, totalRows, successCount }
  }, [history])

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="import"
      sectorName="Tech & IT"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="import" className="space-y-6">
          <TabsList>
            <TabsTrigger value="import">Importera</TabsTrigger>
            <TabsTrigger value="historik">Importhistorik</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-6">
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-3">
              <KPICard label="Totalt importer" value={String(stats.totalImports)} unit="st" />
              <KPICard label="Importerade rader" value={String(stats.totalRows)} unit="st" />
              <KPICard label="Lyckade importer" value={String(stats.successCount)} unit="st" />
            </div>

            <Separator />

            {/* Step 1: Upload */}
            {importStep === 'upload' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Steg 1: Välj källa och ladda upp CSV
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 max-w-xs">
                    <Label>Tidrapportsystem</Label>
                    <Select value={source} onValueChange={(v) => setSource(v as ImportSource)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(SOURCE_LABELS) as [ImportSource, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>CSV-fil</Label>
                    <Input type="file" accept=".csv" onChange={handleFileUpload} className="max-w-sm" />
                    <p className="text-xs text-muted-foreground">
                      Exportera tidrapporter från {SOURCE_LABELS[source]} som CSV och ladda upp här.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Mapping */}
            {importStep === 'mapping' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileUp className="h-4 w-4" />
                    Steg 2: Mappa kolumner
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">Mappa CSV-kolumner till rätt fält. Hittade {csvHeaders.length} kolumner och {rawCsvRows.length} rader.</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {(Object.keys(mapping) as (keyof ColumnMapping)[]).map((field) => (
                      <div key={field} className="grid gap-1.5">
                        <Label className="text-xs capitalize">{field}</Label>
                        <Select value={mapping[field]} onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setImportStep('upload')}>Tillbaka</Button>
                    <Button size="sm" onClick={generatePreview}>Förhandsvisa</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Preview */}
            {importStep === 'preview' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Steg 3: Förhandsvisa och importera ({previewData.length} rader)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-border overflow-hidden max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Anställd</TableHead>
                          <TableHead className="font-medium">Projekt</TableHead>
                          <TableHead className="font-medium">Kund</TableHead>
                          <TableHead className="font-medium text-right">Timmar</TableHead>
                          <TableHead className="font-medium">Debiterbara</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.slice(0, 20).map((e) => (
                          <TableRow key={e.id}>
                            <TableCell>{e.date}</TableCell>
                            <TableCell>{e.employee}</TableCell>
                            <TableCell>{e.project}</TableCell>
                            <TableCell>{e.client}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(e.hours)}</TableCell>
                            <TableCell>
                              {e.billable ? (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Ja</Badge>
                              ) : (
                                <Badge variant="outline">Nej</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {previewData.length > 20 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                              ...och {previewData.length - 20} rader till
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setImportStep('mapping')}>Tillbaka</Button>
                    <Button size="sm" onClick={handleImport} disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
                      Importera {previewData.length} rader
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Done */}
            {importStep === 'done' && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                    <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <Check className="h-8 w-8 text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-medium">Import klar!</h3>
                    <p className="text-sm text-muted-foreground">{previewData.length} tidrapportrader har importerats.</p>
                    <Button onClick={() => { setImportStep('upload'); setPreviewData([]); setCsvHeaders([]); setRawCsvRows([]) }}>
                      Ny import
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="historik" className="space-y-4">
            {history.length === 0 ? (
              <EmptyModuleState
                icon={FileUp}
                title="Ingen importhistorik"
                description="Importera tidrapporter för att se historiken här."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">Källa</TableHead>
                      <TableHead className="font-medium">Filnamn</TableHead>
                      <TableHead className="font-medium text-right">Rader</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell>{h.date}</TableCell>
                        <TableCell><Badge variant="outline">{SOURCE_LABELS[h.source]}</Badge></TableCell>
                        <TableCell className="font-mono text-sm">{h.filename}</TableCell>
                        <TableCell className="text-right tabular-nums">{h.rowCount}</TableCell>
                        <TableCell>
                          {h.status === 'success' && <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Lyckad</Badge>}
                          {h.status === 'partial' && <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Delvis</Badge>}
                          {h.status === 'error' && <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Fel</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </ModuleWorkspaceShell>
  )
}
