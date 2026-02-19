'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
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
  Plus,
  Pencil,
  Trash2,
  Loader2,
  BarChart3,
  CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ViewMode = 'daily' | 'weekly' | 'monthly'

interface OccupancyEntry {
  id: string
  date: string
  totalRooms: number
  occupiedRooms: number
  bookedFuture: number
  occupancyPct: number
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeek(dateStr: string): string {
  const d = new Date(dateStr)
  const onejan = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7)
  return `${d.getFullYear()}-V${String(week).padStart(2, '0')}`
}

function getMonth(dateStr: string): string {
  return dateStr.substring(0, 7)
}

export function BelaggningsgradWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<OccupancyEntry[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('daily')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<OccupancyEntry | null>(null)
  const [form, setForm] = useState({ date: todayStr(), totalRooms: 0, occupiedRooms: 0, bookedFuture: 0 })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<OccupancyEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: OccupancyEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'occupancy_entries', config_value: newEntries },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'occupancy_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as OccupancyEntry[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // Aggregated views
  const aggregatedData = useMemo(() => {
    if (viewMode === 'daily') {
      return [...entries].sort((a, b) => b.date.localeCompare(a.date))
    }

    const groupKey = viewMode === 'weekly' ? getWeek : getMonth
    const groups: Record<string, { totalRooms: number; occupied: number; booked: number; count: number }> = {}

    for (const e of entries) {
      const key = groupKey(e.date)
      if (!groups[key]) groups[key] = { totalRooms: 0, occupied: 0, booked: 0, count: 0 }
      groups[key].totalRooms += e.totalRooms
      groups[key].occupied += e.occupiedRooms
      groups[key].booked += e.bookedFuture
      groups[key].count++
    }

    return Object.entries(groups)
      .map(([period, g]) => ({
        period,
        avgOccupancy: g.totalRooms > 0 ? (g.occupied / g.totalRooms) * 100 : 0,
        totalRooms: Math.round(g.totalRooms / g.count),
        avgOccupied: Math.round(g.occupied / g.count),
        avgBooked: Math.round(g.booked / g.count),
        days: g.count,
      }))
      .sort((a, b) => b.period.localeCompare(a.period))
  }, [entries, viewMode])

  // Forecast
  const forecast = useMemo(() => {
    if (entries.length === 0) return null
    const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7)
    const avgOccupancy = recent.reduce((s, e) => s + e.occupancyPct, 0) / recent.length
    const avgBooked = recent.reduce((s, e) => s + e.bookedFuture, 0) / recent.length
    const totalRooms = recent[0]?.totalRooms ?? 0
    const forecastOccupancy = totalRooms > 0 ? Math.min(((recent[0]?.occupiedRooms ?? 0) + avgBooked) / totalRooms * 100, 100) : 0
    return { avgOccupancy, forecastOccupancy, totalRooms, avgBooked }
  }, [entries])

  // Today's entry
  const todayEntry = entries.find(e => e.date === todayStr())

  function openNew() {
    setEditingEntry(null)
    setForm({ date: todayStr(), totalRooms: entries.length > 0 ? entries[entries.length - 1].totalRooms : 0, occupiedRooms: 0, bookedFuture: 0 })
    setDialogOpen(true)
  }

  function openEdit(entry: OccupancyEntry) {
    setEditingEntry(entry)
    setForm({ date: entry.date, totalRooms: entry.totalRooms, occupiedRooms: entry.occupiedRooms, bookedFuture: entry.bookedFuture })
    setDialogOpen(true)
  }

  async function handleSave() {
    const occupancyPct = form.totalRooms > 0 ? (form.occupiedRooms / form.totalRooms) * 100 : 0
    const item: OccupancyEntry = {
      id: editingEntry?.id ?? generateId(),
      date: form.date,
      totalRooms: form.totalRooms,
      occupiedRooms: form.occupiedRooms,
      bookedFuture: form.bookedFuture,
      occupancyPct,
    }
    let updated: OccupancyEntry[]
    if (editingEntry) {
      updated = entries.map(e => e.id === editingEntry.id ? item : e)
    } else {
      if (entries.some(e => e.date === form.date)) {
        updated = entries.map(e => e.date === form.date ? { ...item, id: e.id } : e)
      } else {
        updated = [...entries, item]
      }
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  async function handleDelete() {
    if (!entryToDelete) return
    const updated = entries.filter(e => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
  }

  function getOccupancyColor(pct: number): string {
    if (pct >= 90) return 'text-emerald-600'
    if (pct >= 70) return 'text-blue-600'
    if (pct >= 50) return 'text-amber-600'
    return 'text-red-600'
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Registrera dag
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList>
              <TabsTrigger value="oversikt">Översikt</TabsTrigger>
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="prognos">Prognos</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              {!todayEntry && entries.length === 0 ? (
                <EmptyModuleState icon={BarChart3} title="Ingen beläggningsdata" description="Börja registrera daglig beläggning för att spåra statistik." actionLabel="Registrera idag" onAction={openNew} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard
                    label="Beläggning idag"
                    value={todayEntry ? fmtPct(todayEntry.occupancyPct) : '-'}
                    unit="%"
                    trend={todayEntry ? (todayEntry.occupancyPct >= 75 ? 'up' : todayEntry.occupancyPct >= 50 ? 'neutral' : 'down') : undefined}
                  />
                  <KPICard label="Rum belagda idag" value={todayEntry ? fmt(todayEntry.occupiedRooms) : '-'} unit={todayEntry ? `/ ${todayEntry.totalRooms}` : ''} />
                  <KPICard label="Framtida bokningar" value={todayEntry ? fmt(todayEntry.bookedFuture) : '-'} unit="st" />
                  <KPICard
                    label="Snitt 7 dagar"
                    value={forecast ? fmtPct(forecast.avgOccupancy) : '-'}
                    unit="%"
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="data" className="space-y-6">
              <div className="flex items-center gap-3">
                <Select value={viewMode} onValueChange={val => setViewMode(val as ViewMode)}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daglig</SelectItem>
                    <SelectItem value="weekly">Veckovis</SelectItem>
                    <SelectItem value="monthly">Månadsvis</SelectItem>
                  </SelectContent>
                </Select>
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </div>

              {viewMode === 'daily' ? (
                (aggregatedData as OccupancyEntry[]).length === 0 ? (
                  <EmptyModuleState icon={CalendarDays} title="Ingen data" description="Registrera daglig beläggning." actionLabel="Registrera" onAction={openNew} />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium text-right">Totalt rum</TableHead>
                          <TableHead className="font-medium text-right">Belagda</TableHead>
                          <TableHead className="font-medium text-right">Beläggning %</TableHead>
                          <TableHead className="font-medium text-right">Framtida bok.</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(aggregatedData as OccupancyEntry[]).map(entry => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">{entry.date}</TableCell>
                            <TableCell className="text-right">{entry.totalRooms}</TableCell>
                            <TableCell className="text-right">{entry.occupiedRooms}</TableCell>
                            <TableCell className={cn('text-right font-mono font-semibold', getOccupancyColor(entry.occupancyPct))}>
                              {fmtPct(entry.occupancyPct)}%
                            </TableCell>
                            <TableCell className="text-right">{entry.bookedFuture}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(entry)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(entry); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Period</TableHead>
                        <TableHead className="font-medium text-right">Snitt rum</TableHead>
                        <TableHead className="font-medium text-right">Snitt belagda</TableHead>
                        <TableHead className="font-medium text-right">Beläggning %</TableHead>
                        <TableHead className="font-medium text-right">Dagar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(aggregatedData as { period: string; avgOccupancy: number; totalRooms: number; avgOccupied: number; days: number }[]).map(row => (
                        <TableRow key={row.period}>
                          <TableCell className="font-medium">{row.period}</TableCell>
                          <TableCell className="text-right">{row.totalRooms}</TableCell>
                          <TableCell className="text-right">{row.avgOccupied}</TableCell>
                          <TableCell className={cn('text-right font-mono font-semibold', getOccupancyColor(row.avgOccupancy))}>
                            {fmtPct(row.avgOccupancy)}%
                          </TableCell>
                          <TableCell className="text-right">{row.days}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="prognos" className="space-y-6">
              {!forecast ? (
                <EmptyModuleState icon={BarChart3} title="Ingen data för prognos" description="Registrera daglig beläggning för att generera prognos." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Snitt beläggning (7d)" value={fmtPct(forecast.avgOccupancy)} unit="%" />
                  <KPICard label="Prognostiserad beläggning" value={fmtPct(forecast.forecastOccupancy)} unit="%" trend={forecast.forecastOccupancy >= forecast.avgOccupancy ? 'up' : 'down'} />
                  <KPICard label="Totalt rum" value={fmt(forecast.totalRooms)} unit="st" />
                  <KPICard label="Snitt framtida bok." value={fmt(Math.round(forecast.avgBooked))} unit="st" />
                </div>
              )}
              <Card className="max-w-lg">
                <CardHeader>
                  <CardTitle className="text-base">Prognos</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Prognosen baseras på de senaste 7 dagarnas beläggning samt framtida bokningar.
                    Registrera data dagligen för att förbättra precisionen.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera beläggning' : 'Registrera beläggning'}</DialogTitle>
            <DialogDescription>Ange antal rum och beläggning för datumet.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Datum *</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Totalt rum</Label>
                <Input type="number" min={0} value={form.totalRooms || ''} onChange={e => setForm(f => ({ ...f, totalRooms: parseInt(e.target.value) || 0 }))} placeholder="100" />
              </div>
              <div className="grid gap-2">
                <Label>Belagda rum</Label>
                <Input type="number" min={0} value={form.occupiedRooms || ''} onChange={e => setForm(f => ({ ...f, occupiedRooms: parseInt(e.target.value) || 0 }))} placeholder="75" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Framtida bokningar (kommande rum)</Label>
              <Input type="number" min={0} value={form.bookedFuture || ''} onChange={e => setForm(f => ({ ...f, bookedFuture: parseInt(e.target.value) || 0 }))} placeholder="20" />
            </div>
            {form.totalRooms > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="text-muted-foreground">Beläggning: </span>
                <span className={cn('font-mono font-semibold', getOccupancyColor(form.totalRooms > 0 ? (form.occupiedRooms / form.totalRooms) * 100 : 0))}>
                  {fmtPct(form.totalRooms > 0 ? (form.occupiedRooms / form.totalRooms) * 100 : 0)}%
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.date || form.totalRooms <= 0}>{editingEntry ? 'Uppdatera' : 'Spara'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort post</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort beläggningsdata för {entryToDelete?.date}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
