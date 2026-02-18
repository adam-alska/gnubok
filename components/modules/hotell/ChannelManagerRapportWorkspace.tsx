'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  Globe,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface CommissionRow {
  id: string
  bookingRef: string
  channel: string
  guestName: string
  checkinDate: string
  checkoutDate: string
  grossAmount: number
  commissionAmount: number
  netAmount: number
}

interface ImportRecord {
  id: string
  fileName: string
  date: string
  rowCount: number
  totalCommission: number
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
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

export function ChannelManagerRapportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [commissionRows, setCommissionRows] = useState<CommissionRow[]>([])
  const [importHistory, setImportHistory] = useState<ImportRecord[]>([])

  // CSV state
  const [parsedRows, setParsedRows] = useState<CommissionRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)

  const saveData = useCallback(async (newRows: CommissionRow[], newHistory: ImportRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await Promise.all([
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'commission_rows', config_value: newRows },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'commission_history', config_value: newHistory },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
    ])
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: rows } = await supabase
      .from('module_configs')
      .select('config_key, config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .in('config_key', ['commission_rows', 'commission_history'])

    for (const row of rows ?? []) {
      if (row.config_key === 'commission_rows' && Array.isArray(row.config_value)) {
        setCommissionRows(row.config_value as CommissionRow[])
      }
      if (row.config_key === 'commission_history' && Array.isArray(row.config_value)) {
        setImportHistory(row.config_value as ImportRecord[])
      }
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  // Summary
  const summary = useMemo(() => {
    const byChannel: Record<string, { count: number; gross: number; commission: number; net: number }> = {}
    for (const r of commissionRows) {
      if (!byChannel[r.channel]) byChannel[r.channel] = { count: 0, gross: 0, commission: 0, net: 0 }
      byChannel[r.channel].count++
      byChannel[r.channel].gross += r.grossAmount
      byChannel[r.channel].commission += r.commissionAmount
      byChannel[r.channel].net += r.netAmount
    }
    const total = {
      count: commissionRows.length,
      gross: commissionRows.reduce((s, r) => s + r.grossAmount, 0),
      commission: commissionRows.reduce((s, r) => s + r.commissionAmount, 0),
      net: commissionRows.reduce((s, r) => s + r.netAmount, 0),
    }
    return { byChannel, total }
  }, [commissionRows])

  function handleFileSelect(file: File) {
    setFileName(file.name)
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers, rows } = parseCSV(text)

      // Auto-detect columns by headers
      const findCol = (keywords: string[]): number => {
        return headers.findIndex(h => keywords.some(k => h.toLowerCase().includes(k)))
      }

      const refIdx = findCol(['ref', 'bokning', 'booking', 'id'])
      const channelIdx = findCol(['kanal', 'channel', 'source', 'ota'])
      const guestIdx = findCol(['gast', 'guest', 'namn', 'name'])
      const checkinIdx = findCol(['incheck', 'checkin', 'check-in', 'arrival'])
      const checkoutIdx = findCol(['utcheck', 'checkout', 'check-out', 'departure'])
      const grossIdx = findCol(['brutto', 'gross', 'total'])
      const commIdx = findCol(['provision', 'commission', 'avgift', 'fee'])
      const netIdx = findCol(['netto', 'net'])

      const parsed: CommissionRow[] = rows.map(row => {
        const gross = grossIdx >= 0 ? parseFloat(row[grossIdx]?.replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0 : 0
        const comm = commIdx >= 0 ? parseFloat(row[commIdx]?.replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0 : 0
        const net = netIdx >= 0 ? parseFloat(row[netIdx]?.replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0 : gross - comm

        return {
          id: generateId(),
          bookingRef: refIdx >= 0 ? row[refIdx] ?? '' : '',
          channel: channelIdx >= 0 ? row[channelIdx] ?? '' : '',
          guestName: guestIdx >= 0 ? row[guestIdx] ?? '' : '',
          checkinDate: checkinIdx >= 0 ? row[checkinIdx] ?? '' : '',
          checkoutDate: checkoutIdx >= 0 ? row[checkoutIdx] ?? '' : '',
          grossAmount: gross,
          commissionAmount: comm,
          netAmount: net,
        }
      }).filter(r => r.grossAmount > 0 || r.commissionAmount > 0)

      setParsedRows(parsed)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    setImporting(true)
    try {
      const updatedRows = [...commissionRows, ...parsedRows]
      const totalComm = parsedRows.reduce((s, r) => s + r.commissionAmount, 0)

      const record: ImportRecord = {
        id: generateId(),
        fileName,
        date: todayStr(),
        rowCount: parsedRows.length,
        totalCommission: totalComm,
      }
      const updatedHistory = [...importHistory, record]

      setCommissionRows(updatedRows)
      setImportHistory(updatedHistory)
      await saveData(updatedRows, updatedHistory)

      setImportResult({ success: true, message: `${parsedRows.length} rader importerade. Total provision: ${fmt(totalComm)} kr.` })
      setParsedRows([])
      setFileName('')
    } catch {
      setImportResult({ success: false, message: 'Importen misslyckades.' })
    }
    setImporting(false)
  }

  async function handleDeleteHistory(id: string) {
    const updated = importHistory.filter(r => r.id !== id)
    setImportHistory(updated)
    await saveData(commissionRows, updated)
  }

  async function handleClearData() {
    setCommissionRows([])
    await saveData([], importHistory)
  }

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
            <TabsTrigger value="sammanstallning">Sammanstallning</TabsTrigger>
            <TabsTrigger value="historik">Historik</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-6">
            {parsedRows.length === 0 && (
              <ImportDropzone
                accept=".csv,.txt"
                onFileSelect={handleFileSelect}
                label="Dra och slapp en provisionsrapport (CSV)"
                description="Filen tolkas automatiskt. Stod for Booking.com, Expedia m.fl."
              />
            )}

            {importResult && (
              <Card className={importResult.success ? 'border-emerald-500/30' : 'border-red-500/30'}>
                <CardContent className="flex items-center gap-3 pt-6">
                  {importResult.success ? <Check className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
                  <p className="text-sm">{importResult.message}</p>
                </CardContent>
              </Card>
            )}

            {parsedRows.length > 0 && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Forhandsvisning - {fileName} ({parsedRows.length} rader)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-lg border border-border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">Ref</TableHead>
                            <TableHead className="font-medium">Kanal</TableHead>
                            <TableHead className="font-medium">Gast</TableHead>
                            <TableHead className="font-medium text-right">Brutto</TableHead>
                            <TableHead className="font-medium text-right">Provision</TableHead>
                            <TableHead className="font-medium text-right">Netto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedRows.slice(0, 10).map(r => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-sm">{r.bookingRef}</TableCell>
                              <TableCell>{r.channel}</TableCell>
                              <TableCell>{r.guestName}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.grossAmount)}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.commissionAmount)}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.netAmount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {parsedRows.length > 10 && (
                      <p className="text-xs text-muted-foreground mt-2">Visar 10 av {parsedRows.length} rader.</p>
                    )}
                  </CardContent>
                </Card>

                <div className="rounded-lg bg-muted/50 p-4 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total brutto:</span><span className="font-mono">{fmt(parsedRows.reduce((s, r) => s + r.grossAmount, 0))} kr</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total provision:</span><span className="font-mono font-semibold">{fmt(parsedRows.reduce((s, r) => s + r.commissionAmount, 0))} kr</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total netto:</span><span className="font-mono">{fmt(parsedRows.reduce((s, r) => s + r.netAmount, 0))} kr</span></div>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Importera {parsedRows.length} rader
                  </Button>
                  <Button variant="outline" onClick={() => { setParsedRows([]); setFileName('') }}>Avbryt</Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="sammanstallning" className="space-y-6">
            {commissionRows.length === 0 ? (
              <EmptyModuleState icon={Globe} title="Ingen provisionsdata" description="Importera en rapport for att se sammanstallning." />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total brutto</CardTitle></CardHeader>
                    <CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(summary.total.gross)}</span><span className="text-sm text-muted-foreground ml-1.5">kr</span></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total provision</CardTitle></CardHeader>
                    <CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(summary.total.commission)}</span><span className="text-sm text-muted-foreground ml-1.5">kr</span></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total netto</CardTitle></CardHeader>
                    <CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(summary.total.net)}</span><span className="text-sm text-muted-foreground ml-1.5">kr</span></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Antal bokningar</CardTitle></CardHeader>
                    <CardContent><span className="text-2xl font-semibold tracking-tight">{summary.total.count}</span></CardContent>
                  </Card>
                </div>

                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Kanal</TableHead>
                        <TableHead className="font-medium text-right">Antal</TableHead>
                        <TableHead className="font-medium text-right">Brutto (kr)</TableHead>
                        <TableHead className="font-medium text-right">Provision (kr)</TableHead>
                        <TableHead className="font-medium text-right">Netto (kr)</TableHead>
                        <TableHead className="font-medium text-right">Prov. %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(summary.byChannel).sort((a, b) => b[1].commission - a[1].commission).map(([channel, s]) => (
                        <TableRow key={channel}>
                          <TableCell className="font-medium">{channel || 'Okand'}</TableCell>
                          <TableCell className="text-right">{s.count}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(s.gross)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(s.commission)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(s.net)}</TableCell>
                          <TableCell className="text-right font-mono">{s.gross > 0 ? ((s.commission / s.gross) * 100).toFixed(1) : '0.0'}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={handleClearData} className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />Rensa all provisionsdata
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="historik" className="space-y-4">
            {importHistory.length === 0 ? (
              <EmptyModuleState icon={FileSpreadsheet} title="Ingen importhistorik" description="Importera rapporter for att se historik." />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Filnamn</TableHead>
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium text-right">Rader</TableHead>
                      <TableHead className="font-medium text-right">Total provision</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...importHistory].reverse().map(rec => (
                      <TableRow key={rec.id}>
                        <TableCell className="font-mono text-sm">{rec.fileName}</TableCell>
                        <TableCell>{rec.date}</TableCell>
                        <TableCell className="text-right">{rec.rowCount}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(rec.totalCommission)} kr</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteHistory(rec.id)}>
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
