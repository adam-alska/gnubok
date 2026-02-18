'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface ImportRecord {
  id: string
  filename: string
  date: string
  status: ImportStatus
  rowsImported: number
  totalAmount: number
  cardAmount: number
  swishAmount: number
  cashAmount: number
  errorMessage: string | null
}

interface ParsedRow {
  date: string
  description: string
  amount: number
  paymentMethod: string
  account: string
}

const STATUS_VARIANT: Record<ImportStatus, 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'warning',
  processing: 'info',
  completed: 'success',
  failed: 'danger',
}

const STATUS_LABEL: Record<ImportStatus, string> = {
  pending: 'Väntar',
  processing: 'Bearbetar',
  completed: 'Klar',
  failed: 'Misslyckades',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(/[;,]/).map((h) => h.trim().toLowerCase())
  const rows: ParsedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[;,]/).map((c) => c.trim())
    if (cols.length < 2) continue

    const dateIdx = headers.findIndex((h) => h.includes('datum') || h.includes('date'))
    const descIdx = headers.findIndex((h) => h.includes('beskrivning') || h.includes('description') || h.includes('text'))
    const amountIdx = headers.findIndex((h) => h.includes('belopp') || h.includes('amount') || h.includes('summa'))
    const methodIdx = headers.findIndex((h) => h.includes('betal') || h.includes('metod') || h.includes('payment'))

    const amount = parseFloat((cols[amountIdx >= 0 ? amountIdx : 1] ?? '0').replace(/\s/g, '').replace(',', '.'))
    const method = (cols[methodIdx >= 0 ? methodIdx : 3] ?? 'kort').toLowerCase()

    let account = '3010'
    if (method.includes('kort') || method.includes('card')) account = '1580'
    else if (method.includes('swish')) account = '1581'
    else if (method.includes('kontant') || method.includes('cash')) account = '1910'

    rows.push({
      date: cols[dateIdx >= 0 ? dateIdx : 0] ?? todayStr(),
      description: cols[descIdx >= 0 ? descIdx : 1] ?? '',
      amount: isNaN(amount) ? 0 : amount,
      paymentMethod: method,
      account,
    })
  }

  return rows
}

export function KassarapportImportSalongWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [previewFile, setPreviewFile] = useState<string | null>(null)

  const saveImports = useCallback(async (data: ImportRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'imports',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'imports')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setImports(data.config_value as ImportRecord[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = useMemo(() => {
    const completed = imports.filter((i) => i.status === 'completed')
    const totalImported = completed.reduce((s, i) => s + i.rowsImported, 0)
    const totalAmount = completed.reduce((s, i) => s + i.totalAmount, 0)
    return { totalImported, totalAmount, fileCount: completed.length }
  }, [imports])

  function handleFileSelect(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const rows = parseCSV(text)
      setParsedRows(rows)
      setPreviewFile(file.name)
    }
    reader.readAsText(file)
  }

  async function handleConfirmImport() {
    if (parsedRows.length === 0 || !previewFile) return

    const cardAmount = parsedRows.filter((r) => r.account === '1580').reduce((s, r) => s + r.amount, 0)
    const swishAmount = parsedRows.filter((r) => r.account === '1581').reduce((s, r) => s + r.amount, 0)
    const cashAmount = parsedRows.filter((r) => r.account === '1910').reduce((s, r) => s + r.amount, 0)
    const totalAmount = parsedRows.reduce((s, r) => s + r.amount, 0)

    const newImport: ImportRecord = {
      id: generateId(),
      filename: previewFile,
      date: todayStr(),
      status: 'completed',
      rowsImported: parsedRows.length,
      totalAmount,
      cardAmount,
      swishAmount,
      cashAmount,
      errorMessage: null,
    }

    const updated = [newImport, ...imports]
    setImports(updated)
    setParsedRows([])
    setPreviewFile(null)
    await saveImports(updated)
  }

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="import"
      sectorName="Frisör & Skönhet"
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
            <div className="grid gap-4 sm:grid-cols-3">
              <KPICard label="Importerade filer" value={String(kpis.fileCount)} unit="st" />
              <KPICard label="Totalt importerade rader" value={String(kpis.totalImported)} unit="rader" />
              <KPICard label="Totalt belopp" value={fmt(kpis.totalAmount)} unit="kr" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Importera kassarapport</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Ladda upp CSV-fil från iZettle/Zettle. Filen bör innehålla kolumner: datum, beskrivning, belopp, betalmetod.
                  Bokföring sker automatiskt med konto 1580 (kort), 1581 (Swish), 1910 (kontant).
                </p>
              </CardHeader>
              <CardContent>
                <ImportDropzone
                  accept=".csv"
                  onFileSelect={handleFileSelect}
                  label="Dra och släpp iZettle/Zettle CSV-fil här"
                  description="eller klicka för att välja fil (.csv)"
                />
              </CardContent>
            </Card>

            {parsedRows.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Förhandsgranskning: {previewFile}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">{parsedRows.length} rader hittades</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => { setParsedRows([]); setPreviewFile(null) }}>Avbryt</Button>
                      <Button onClick={handleConfirmImport}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Bekräfta import
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-border overflow-hidden max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Beskrivning</TableHead>
                          <TableHead className="font-medium text-right">Belopp</TableHead>
                          <TableHead className="font-medium">Betalmetod</TableHead>
                          <TableHead className="font-medium">Konto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedRows.slice(0, 20).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-sm">{row.date}</TableCell>
                            <TableCell className="text-sm">{row.description}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{fmt(row.amount)} kr</TableCell>
                            <TableCell className="text-sm capitalize">{row.paymentMethod}</TableCell>
                            <TableCell className="font-mono text-sm">{row.account}</TableCell>
                          </TableRow>
                        ))}
                        {parsedRows.length > 20 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                              ... och {parsedRows.length - 20} fler rader
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Kort</p>
                      <p className="text-sm font-semibold tabular-nums">{fmt(parsedRows.filter((r) => r.account === '1580').reduce((s, r) => s + r.amount, 0))} kr</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Swish</p>
                      <p className="text-sm font-semibold tabular-nums">{fmt(parsedRows.filter((r) => r.account === '1581').reduce((s, r) => s + r.amount, 0))} kr</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3 text-center">
                      <p className="text-xs text-muted-foreground">Kontant</p>
                      <p className="text-sm font-semibold tabular-nums">{fmt(parsedRows.filter((r) => r.account === '1910').reduce((s, r) => s + r.amount, 0))} kr</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {saving && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sparar...
              </div>
            )}
          </TabsContent>

          <TabsContent value="historik" className="space-y-6">
            {imports.length === 0 ? (
              <EmptyModuleState
                icon={FileSpreadsheet}
                title="Ingen importhistorik"
                description="Importerade kassarapporter visas här."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">Fil</TableHead>
                      <TableHead className="font-medium text-right">Rader</TableHead>
                      <TableHead className="font-medium text-right">Belopp</TableHead>
                      <TableHead className="font-medium text-right">Kort</TableHead>
                      <TableHead className="font-medium text-right">Swish</TableHead>
                      <TableHead className="font-medium text-right">Kontant</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {imports.map((imp) => (
                      <TableRow key={imp.id}>
                        <TableCell className="text-sm">{imp.date}</TableCell>
                        <TableCell className="text-sm font-medium">{imp.filename}</TableCell>
                        <TableCell className="text-right tabular-nums">{imp.rowsImported}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(imp.totalAmount)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(imp.cardAmount)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(imp.swishAmount)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(imp.cashAmount)} kr</TableCell>
                        <TableCell>
                          <StatusBadge label={STATUS_LABEL[imp.status]} variant={STATUS_VARIANT[imp.status]} />
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
