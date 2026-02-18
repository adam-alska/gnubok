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
  DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type GroupBy = 'lawyer' | 'client' | 'caseType'

interface RevenueEntry {
  id: string
  lawyerName: string
  clientName: string
  caseType: string
  billableHours: number
  revenue: number
  listPrice: number
  period: string
}

const CASE_TYPES = ['Affärsjuridik', 'Tvistemål', 'Familjerätt', 'Fastighetsrätt', 'Arbetsrätt', 'Straffrätt', 'Övrigt']

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const EMPTY_FORM = {
  lawyerName: '',
  clientName: '',
  caseType: 'Affärsjuridik',
  billableHours: 0,
  revenue: 0,
  listPrice: 0,
  period: currentPeriod(),
}

export function GenomsnittligTimintaktWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<RevenueEntry[]>([])
  const [groupBy, setGroupBy] = useState<GroupBy>('lawyer')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<RevenueEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<RevenueEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: RevenueEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'avg_hourly_entries',
        config_value: newEntries,
      },
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
      .eq('config_key', 'avg_hourly_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as RevenueEntry[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const summary = useMemo(() => {
    const totalRevenue = entries.reduce((s, e) => s + e.revenue, 0)
    const totalHours = entries.reduce((s, e) => s + e.billableHours, 0)
    const avgHourly = totalHours > 0 ? totalRevenue / totalHours : 0
    const avgListPrice = entries.length > 0
      ? entries.reduce((s, e) => s + e.listPrice, 0) / entries.length
      : 0
    const priceRealization = avgListPrice > 0 ? (avgHourly / avgListPrice) * 100 : 0
    return { totalRevenue, totalHours, avgHourly, avgListPrice, priceRealization }
  }, [entries])

  const grouped = useMemo(() => {
    const map: Record<string, { hours: number; revenue: number; listPriceSum: number; count: number }> = {}
    for (const e of entries) {
      const key = groupBy === 'lawyer' ? e.lawyerName : groupBy === 'client' ? e.clientName : e.caseType
      if (!map[key]) map[key] = { hours: 0, revenue: 0, listPriceSum: 0, count: 0 }
      map[key].hours += e.billableHours
      map[key].revenue += e.revenue
      map[key].listPriceSum += e.listPrice
      map[key].count += 1
    }
    return Object.entries(map)
      .map(([name, d]) => ({
        name,
        hours: d.hours,
        revenue: d.revenue,
        avgHourly: d.hours > 0 ? d.revenue / d.hours : 0,
        avgListPrice: d.count > 0 ? d.listPriceSum / d.count : 0,
        count: d.count,
      }))
      .sort((a, b) => b.avgHourly - a.avgHourly)
  }, [entries, groupBy])

  function openNewEntry() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditEntry(entry: RevenueEntry) {
    setEditingEntry(entry)
    setForm({
      lawyerName: entry.lawyerName,
      clientName: entry.clientName,
      caseType: entry.caseType,
      billableHours: entry.billableHours,
      revenue: entry.revenue,
      listPrice: entry.listPrice,
      period: entry.period,
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    let updated: RevenueEntry[]
    if (editingEntry) {
      updated = entries.map((e) =>
        e.id === editingEntry.id
          ? { ...e, ...form, lawyerName: form.lawyerName.trim(), clientName: form.clientName.trim() }
          : e
      )
    } else {
      updated = [...entries, { id: generateId(), ...form, lawyerName: form.lawyerName.trim(), clientName: form.clientName.trim() }]
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: RevenueEntry) {
    setEntryToDelete(entry)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteEntry() {
    if (!entryToDelete) return
    const updated = entries.filter((e) => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
  }

  const GROUP_LABELS: Record<GroupBy, string> = {
    lawyer: 'Per jurist',
    client: 'Per klient',
    caseType: 'Per arendetyp',
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Juridik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewEntry}>
            <Plus className="mr-2 h-4 w-4" />
            Ny post
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
            <TabsTrigger value="grupperad">Grupperad analys</TabsTrigger>
            <TabsTrigger value="detaljer">Detaljer</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={DollarSign}
                title="Ingen data"
                description="Registrera intakter och timmar for att berakna genomsnittlig timintakt."
                actionLabel="Ny post"
                onAction={openNewEntry}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Genomsn. timintakt" value={fmt(summary.avgHourly)} unit="kr/h" />
                <KPICard label="Genomsn. prislista" value={fmt(summary.avgListPrice)} unit="kr/h" />
                <KPICard
                  label="Prisrealisering"
                  value={fmtPct(summary.priceRealization)}
                  unit="%"
                  trend={summary.priceRealization >= 95 ? 'up' : summary.priceRealization >= 80 ? 'neutral' : 'down'}
                />
                <KPICard label="Total intakt" value={fmt(summary.totalRevenue)} unit="kr" />
                <KPICard label="Totalt timmar" value={fmt(summary.totalHours)} unit="h" />
              </div>
            )}
          </TabsContent>

          {/* Grouped analysis */}
          <TabsContent value="grupperad" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Select value={groupBy} onValueChange={(val) => setGroupBy(val as GroupBy)}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lawyer">Per jurist</SelectItem>
                      <SelectItem value="client">Per klient</SelectItem>
                      <SelectItem value="caseType">Per arendetyp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {grouped.length === 0 ? (
                  <EmptyModuleState
                    icon={DollarSign}
                    title="Ingen data"
                    description="Lagg till poster for att se grupperad analys."
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">{GROUP_LABELS[groupBy]}</TableHead>
                          <TableHead className="font-medium text-right">Timmar</TableHead>
                          <TableHead className="font-medium text-right">Intakt (kr)</TableHead>
                          <TableHead className="font-medium text-right">Snitttimpris</TableHead>
                          <TableHead className="font-medium text-right">Prislista</TableHead>
                          <TableHead className="font-medium text-right">vs Prislista</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grouped.map((g) => {
                          const diff = g.avgListPrice > 0 ? ((g.avgHourly - g.avgListPrice) / g.avgListPrice) * 100 : 0
                          return (
                            <TableRow key={g.name}>
                              <TableCell className="font-medium">{g.name}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(g.hours)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(g.revenue)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{fmt(g.avgHourly)} kr</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(g.avgListPrice)} kr</TableCell>
                              <TableCell className="text-right">
                                <Badge variant={diff >= 0 ? 'secondary' : 'destructive'} className={cn(diff >= 0 && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400')}>
                                  {diff >= 0 ? '+' : ''}{fmtPct(diff)}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Detail entries */}
          <TabsContent value="detaljer" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={DollarSign}
                title="Inga poster"
                description="Borja registrera tidsdata for att analysera timintakten."
                actionLabel="Ny post"
                onAction={openNewEntry}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Period</TableHead>
                      <TableHead className="font-medium">Jurist</TableHead>
                      <TableHead className="font-medium">Klient</TableHead>
                      <TableHead className="font-medium">Typ</TableHead>
                      <TableHead className="font-medium text-right">Timmar</TableHead>
                      <TableHead className="font-medium text-right">Intakt</TableHead>
                      <TableHead className="font-medium text-right">Timpris</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.sort((a, b) => b.period.localeCompare(a.period)).map((entry) => {
                      const hourly = entry.billableHours > 0 ? entry.revenue / entry.billableHours : 0
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>{entry.period}</TableCell>
                          <TableCell className="font-medium">{entry.lawyerName}</TableCell>
                          <TableCell>{entry.clientName}</TableCell>
                          <TableCell><Badge variant="outline">{entry.caseType}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{entry.billableHours}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(entry.revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(hourly)} kr</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditEntry(entry)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(entry)} title="Ta bort">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera post' : 'Ny post'}</DialogTitle>
            <DialogDescription>
              {editingEntry ? 'Uppdatera intaktsdata.' : 'Registrera intakter, timmar och prislistvarde.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="avg-lawyer">Jurist *</Label>
                <Input id="avg-lawyer" value={form.lawyerName} onChange={(e) => setForm((f) => ({ ...f, lawyerName: e.target.value }))} placeholder="Namn" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="avg-client">Klient *</Label>
                <Input id="avg-client" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Klient AB" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="avg-type">Arendetyp</Label>
                <Select value={form.caseType} onValueChange={(val) => setForm((f) => ({ ...f, caseType: val }))}>
                  <SelectTrigger id="avg-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CASE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="avg-hours">Timmar *</Label>
                <Input id="avg-hours" type="number" min={0} step="0.5" value={form.billableHours} onChange={(e) => setForm((f) => ({ ...f, billableHours: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="avg-rev">Intakt (kr) *</Label>
                <Input id="avg-rev" type="number" min={0} value={form.revenue} onChange={(e) => setForm((f) => ({ ...f, revenue: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="avg-list">Prislista (kr/h)</Label>
                <Input id="avg-list" type="number" min={0} value={form.listPrice} onChange={(e) => setForm((f) => ({ ...f, listPrice: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="avg-period">Period</Label>
                <Input id="avg-period" type="month" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveEntry} disabled={!form.lawyerName.trim() || !form.clientName.trim() || form.billableHours <= 0}>
              {editingEntry ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort post</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort posten for{' '}
              <span className="font-semibold">{entryToDelete?.lawyerName}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteEntry}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
