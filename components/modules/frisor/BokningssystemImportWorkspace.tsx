'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Loader2,
  CalendarCheck,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type BookingSystem = 'timma' | 'fresha' | 'planway' | 'other'

interface ImportRecord {
  id: string
  filename: string
  date: string
  system: BookingSystem
  status: 'completed' | 'failed'
  rowsImported: number
  totalRevenue: number
  practitioners: PractitionerRevenue[]
  errorMessage: string | null
}

interface PractitionerRevenue {
  name: string
  bookings: number
  revenue: number
}

interface ParsedBooking {
  date: string
  practitioner: string
  service: string
  revenue: number
  duration: number
}

const SYSTEM_LABELS: Record<BookingSystem, string> = {
  timma: 'Timma',
  fresha: 'Fresha',
  planway: 'Planway',
  other: 'Annat system',
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

function parseBookingCSV(text: string): ParsedBooking[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(/[;,]/).map((h) => h.trim().toLowerCase())
  const rows: ParsedBooking[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[;,]/).map((c) => c.trim())
    if (cols.length < 2) continue

    const dateIdx = headers.findIndex((h) => h.includes('datum') || h.includes('date'))
    const practIdx = headers.findIndex((h) => h.includes('behandlare') || h.includes('stylist') || h.includes('practitioner'))
    const serviceIdx = headers.findIndex((h) => h.includes('tjänst') || h.includes('service') || h.includes('behandling'))
    const revIdx = headers.findIndex((h) => h.includes('intäkt') || h.includes('revenue') || h.includes('belopp') || h.includes('pris'))
    const durIdx = headers.findIndex((h) => h.includes('tid') || h.includes('duration') || h.includes('minuter'))

    const revenue = parseFloat((cols[revIdx >= 0 ? revIdx : 3] ?? '0').replace(/\s/g, '').replace(',', '.'))

    rows.push({
      date: cols[dateIdx >= 0 ? dateIdx : 0] ?? todayStr(),
      practitioner: cols[practIdx >= 0 ? practIdx : 1] ?? 'Okänd',
      service: cols[serviceIdx >= 0 ? serviceIdx : 2] ?? '',
      revenue: isNaN(revenue) ? 0 : revenue,
      duration: parseInt(cols[durIdx >= 0 ? durIdx : 4] ?? '60') || 60,
    })
  }

  return rows
}

export function BokningssystemImportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [parsedBookings, setParsedBookings] = useState<ParsedBooking[]>([])
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const [selectedSystem, setSelectedSystem] = useState<BookingSystem>('timma')

  const saveImports = useCallback(async (data: ImportRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'booking_imports',
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
      .eq('config_key', 'booking_imports')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setImports(data.config_value as ImportRecord[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = useMemo(() => {
    const completed = imports.filter((i) => i.status === 'completed')
    const totalRevenue = completed.reduce((s, i) => s + i.totalRevenue, 0)
    const totalRows = completed.reduce((s, i) => s + i.rowsImported, 0)
    return { totalRevenue, totalRows, fileCount: completed.length }
  }, [imports])

  const previewPractitioners = useMemo(() => {
    const map: Record<string, { bookings: number; revenue: number }> = {}
    for (const b of parsedBookings) {
      if (!map[b.practitioner]) map[b.practitioner] = { bookings: 0, revenue: 0 }
      map[b.practitioner].bookings += 1
      map[b.practitioner].revenue += b.revenue
    }
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [parsedBookings])

  function handleFileSelect(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const bookings = parseBookingCSV(text)
      setParsedBookings(bookings)
      setPreviewFile(file.name)
    }
    reader.readAsText(file)
  }

  async function handleConfirmImport() {
    if (parsedBookings.length === 0 || !previewFile) return

    const practitioners: PractitionerRevenue[] = previewPractitioners.map((p) => ({
      name: p.name,
      bookings: p.bookings,
      revenue: p.revenue,
    }))

    const totalRevenue = parsedBookings.reduce((s, b) => s + b.revenue, 0)

    const newImport: ImportRecord = {
      id: generateId(),
      filename: previewFile,
      date: todayStr(),
      system: selectedSystem,
      status: 'completed',
      rowsImported: parsedBookings.length,
      totalRevenue,
      practitioners,
      errorMessage: null,
    }

    const updated = [newImport, ...imports]
    setImports(updated)
    setParsedBookings([])
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
            <TabsTrigger value="behandlare">Intäkt per behandlare</TabsTrigger>
            <TabsTrigger value="historik">Importhistorik</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <KPICard label="Importerade filer" value={String(kpis.fileCount)} unit="st" />
              <KPICard label="Totala bokningar" value={String(kpis.totalRows)} unit="st" />
              <KPICard label="Total intäkt" value={fmt(kpis.totalRevenue)} unit="kr" />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Importera från bokningssystem</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Välj bokningssystem och ladda upp CSV-export. Intäkt per behandlare beräknas automatiskt.
                    </p>
                  </div>
                  <Select value={selectedSystem} onValueChange={(val) => setSelectedSystem(val as BookingSystem)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SYSTEM_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ImportDropzone
                  accept=".csv,.xlsx,.xls"
                  onFileSelect={handleFileSelect}
                  label={`Dra och släpp ${SYSTEM_LABELS[selectedSystem]}-export här`}
                  description="eller klicka för att välja fil (CSV, Excel)"
                />
              </CardContent>
            </Card>

            {parsedBookings.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Förhandsgranskning: {previewFile}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {parsedBookings.length} bokningar, {previewPractitioners.length} behandlare
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => { setParsedBookings([]); setPreviewFile(null) }}>Avbryt</Button>
                      <Button onClick={handleConfirmImport}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Bekräfta import
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Intäkt per behandlare</h4>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Behandlare</TableHead>
                          <TableHead className="font-medium text-right">Bokningar</TableHead>
                          <TableHead className="font-medium text-right">Intäkt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewPractitioners.map((p) => (
                          <TableRow key={p.name}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{p.bookings}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(p.revenue)} kr</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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

          <TabsContent value="behandlare" className="space-y-6">
            {imports.filter((i) => i.status === 'completed').length === 0 ? (
              <EmptyModuleState
                icon={CalendarCheck}
                title="Ingen importerad data"
                description="Importera data från ditt bokningssystem för att se intäkt per behandlare."
              />
            ) : (
              <div className="space-y-6">
                {imports.filter((i) => i.status === 'completed').slice(0, 5).map((imp) => (
                  <Card key={imp.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{imp.filename} ({imp.date})</CardTitle>
                        <Badge variant="outline">{SYSTEM_LABELS[imp.system]}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-lg border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="font-medium">Behandlare</TableHead>
                              <TableHead className="font-medium text-right">Bokningar</TableHead>
                              <TableHead className="font-medium text-right">Intäkt</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {imp.practitioners.map((p) => (
                              <TableRow key={p.name}>
                                <TableCell className="font-medium">{p.name}</TableCell>
                                <TableCell className="text-right tabular-nums">{p.bookings}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmt(p.revenue)} kr</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="historik" className="space-y-6">
            {imports.length === 0 ? (
              <EmptyModuleState
                icon={FileSpreadsheet}
                title="Ingen importhistorik"
                description="Importerade bokningsdata visas här."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">Fil</TableHead>
                      <TableHead className="font-medium">System</TableHead>
                      <TableHead className="font-medium text-right">Rader</TableHead>
                      <TableHead className="font-medium text-right">Intäkt</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {imports.map((imp) => (
                      <TableRow key={imp.id}>
                        <TableCell className="text-sm">{imp.date}</TableCell>
                        <TableCell className="text-sm font-medium">{imp.filename}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{SYSTEM_LABELS[imp.system]}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{imp.rowsImported}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(imp.totalRevenue)} kr</TableCell>
                        <TableCell>
                          <StatusBadge
                            label={imp.status === 'completed' ? 'Klar' : 'Misslyckades'}
                            variant={imp.status === 'completed' ? 'success' : 'danger'}
                          />
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
