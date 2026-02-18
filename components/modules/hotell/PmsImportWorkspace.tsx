'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  FileSpreadsheet,
  Check,
  Trash2,
  AlertCircle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ColumnMapping {
  csvColumn: string
  targetField: string
}

interface ImportRecord {
  id: string
  fileName: string
  date: string
  rowCount: number
  status: 'importerad' | 'misslyckad'
}

const TARGET_FIELDS = [
  { value: 'skip', label: '-- Hoppa over --' },
  { value: 'date', label: 'Datum' },
  { value: 'bookingRef', label: 'Bokningsreferens' },
  { value: 'guestName', label: 'Gastnamn' },
  { value: 'roomNumber', label: 'Rumsnummer' },
  { value: 'roomType', label: 'Rumstyp' },
  { value: 'checkin', label: 'Incheckning' },
  { value: 'checkout', label: 'Utcheckning' },
  { value: 'nights', label: 'Natter' },
  { value: 'rate', label: 'Rumspris' },
  { value: 'totalAmount', label: 'Totalbelopp' },
  { value: 'channel', label: 'Kanal' },
  { value: 'status', label: 'Status' },
  { value: 'notes', label: 'Anteckningar' },
]

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split('\n')
  if (lines.length === 0) return { headers: [], rows: [] }

  const delimiter = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line =>
    line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''))
  )
  return { headers, rows }
}

export function PmsImportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importHistory, setImportHistory] = useState<ImportRecord[]>([])

  // CSV state
  const [fileName, setFileName] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)

  const saveHistory = useCallback(async (newHistory: ImportRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'import_history', config_value: newHistory },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveImportedData = useCallback(async (rows: Record<string, string>[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Load existing
    const { data: existing } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'pms_data')
      .maybeSingle()

    const existingRows = (existing?.config_value && Array.isArray(existing.config_value))
      ? existing.config_value as Record<string, string>[]
      : []

    const combined = [...existingRows, ...rows]

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'pms_data', config_value: combined },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'import_history')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setImportHistory(data.config_value as ImportRecord[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  function handleFileSelect(file: File) {
    setFileName(file.name)
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers, rows } = parseCSV(text)
      setCsvHeaders(headers)
      setCsvRows(rows)
      setMappings(headers.map(h => ({
        csvColumn: h,
        targetField: autoMapColumn(h),
      })))
    }
    reader.readAsText(file, 'UTF-8')
  }

  function autoMapColumn(header: string): string {
    const h = header.toLowerCase()
    if (h.includes('datum') || h.includes('date')) return 'date'
    if (h.includes('bokning') || h.includes('ref') || h.includes('booking')) return 'bookingRef'
    if (h.includes('gast') || h.includes('guest') || h.includes('namn') || h.includes('name')) return 'guestName'
    if (h.includes('rumsnr') || h.includes('room') && h.includes('nr')) return 'roomNumber'
    if (h.includes('rumstyp') || h.includes('room') && h.includes('type')) return 'roomType'
    if (h.includes('incheck') || h.includes('checkin') || h.includes('check-in') || h.includes('arrival')) return 'checkin'
    if (h.includes('utcheck') || h.includes('checkout') || h.includes('check-out') || h.includes('departure')) return 'checkout'
    if (h.includes('natt') || h.includes('night')) return 'nights'
    if (h.includes('pris') || h.includes('rate') || h.includes('price')) return 'rate'
    if (h.includes('total') || h.includes('amount') || h.includes('belopp')) return 'totalAmount'
    if (h.includes('kanal') || h.includes('channel') || h.includes('source')) return 'channel'
    if (h.includes('status')) return 'status'
    return 'skip'
  }

  function updateMapping(csvColumn: string, targetField: string) {
    setMappings(m => m.map(mp => mp.csvColumn === csvColumn ? { ...mp, targetField } : mp))
  }

  async function handleImport() {
    setImporting(true)
    setImportResult(null)

    try {
      const mappedRows: Record<string, string>[] = csvRows.map(row => {
        const mapped: Record<string, string> = { _id: generateId() }
        mappings.forEach((mp, idx) => {
          if (mp.targetField !== 'skip' && row[idx] !== undefined) {
            mapped[mp.targetField] = row[idx]
          }
        })
        return mapped
      }).filter(r => Object.keys(r).length > 1) // more than just _id

      await saveImportedData(mappedRows)

      const record: ImportRecord = {
        id: generateId(),
        fileName,
        date: todayStr(),
        rowCount: mappedRows.length,
        status: 'importerad',
      }
      const updatedHistory = [...importHistory, record]
      setImportHistory(updatedHistory)
      await saveHistory(updatedHistory)

      setImportResult({ success: true, message: `${mappedRows.length} rader importerades fran ${fileName}.` })
      setCsvHeaders([])
      setCsvRows([])
      setMappings([])
      setFileName('')
    } catch {
      const record: ImportRecord = {
        id: generateId(),
        fileName,
        date: todayStr(),
        rowCount: 0,
        status: 'misslyckad',
      }
      const updatedHistory = [...importHistory, record]
      setImportHistory(updatedHistory)
      await saveHistory(updatedHistory)

      setImportResult({ success: false, message: 'Importen misslyckades. Kontrollera filformatet.' })
    }

    setImporting(false)
  }

  async function handleDeleteHistory(id: string) {
    const updated = importHistory.filter(r => r.id !== id)
    setImportHistory(updated)
    await saveHistory(updated)
  }

  const previewRows = csvRows.slice(0, 5)

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="import"
      sectorName="Hotell & Boende"
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
            {/* Upload area */}
            {csvHeaders.length === 0 && (
              <ImportDropzone
                accept=".csv,.txt"
                onFileSelect={handleFileSelect}
                label="Dra och slapp en CSV-fil fran PMS"
                description="eller klicka for att valja fil (CSV)"
              />
            )}

            {/* Import result */}
            {importResult && (
              <Card className={importResult.success ? 'border-emerald-500/30' : 'border-red-500/30'}>
                <CardContent className="flex items-center gap-3 pt-6">
                  {importResult.success ? <Check className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
                  <p className="text-sm">{importResult.message}</p>
                </CardContent>
              </Card>
            )}

            {/* Column mapping */}
            {csvHeaders.length > 0 && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Kolumnmappning - {fileName}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">Mappa CSV-kolumner till ratt falt. Kolumner markerade &quot;Hoppa over&quot; importeras inte.</p>
                    <div className="space-y-3">
                      {mappings.map(mp => (
                        <div key={mp.csvColumn} className="flex items-center gap-3">
                          <span className="text-sm font-mono w-40 truncate" title={mp.csvColumn}>{mp.csvColumn}</span>
                          <span className="text-muted-foreground text-sm">-&gt;</span>
                          <Select value={mp.targetField} onValueChange={val => updateMapping(mp.csvColumn, val)}>
                            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {TARGET_FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Preview */}
                {previewRows.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Forhandsvisning ({csvRows.length} rader totalt, visar 5)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-lg border border-border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              {csvHeaders.map(h => (
                                <TableHead key={h} className="font-medium text-xs whitespace-nowrap">{h}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewRows.map((row, i) => (
                              <TableRow key={i}>
                                {row.map((cell, j) => (
                                  <TableCell key={j} className="text-xs whitespace-nowrap">{cell}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Import buttons */}
                <div className="flex items-center gap-3">
                  <Button onClick={handleImport} disabled={importing || mappings.every(m => m.targetField === 'skip')}>
                    {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Importera {csvRows.length} rader
                  </Button>
                  <Button variant="outline" onClick={() => { setCsvHeaders([]); setCsvRows([]); setMappings([]); setFileName('') }}>
                    Avbryt
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="historik" className="space-y-4">
            {importHistory.length === 0 ? (
              <EmptyModuleState icon={FileSpreadsheet} title="Ingen importhistorik" description="Importera en CSV-fil for att se historik har." />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Filnamn</TableHead>
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium text-right">Rader</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...importHistory].reverse().map(rec => (
                      <TableRow key={rec.id}>
                        <TableCell className="font-mono text-sm">{rec.fileName}</TableCell>
                        <TableCell>{rec.date}</TableCell>
                        <TableCell className="text-right">{rec.rowCount}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={rec.status === 'importerad' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                            {rec.status === 'importerad' ? 'Importerad' : 'Misslyckad'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteHistory(rec.id)} title="Ta bort">
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
