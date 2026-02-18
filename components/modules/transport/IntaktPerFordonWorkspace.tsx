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
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface VehicleRevenue {
  id: string
  vehicle_name: string
  reg_number: string
  period: string
  revenue: number
  total_costs: number
  trips_count: number
}

const EMPTY_FORM = {
  vehicle_name: '',
  reg_number: '',
  period: '',
  revenue: 0,
  total_costs: 0,
  trips_count: 0,
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

export function IntaktPerFordonWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<VehicleRevenue[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<VehicleRevenue | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<VehicleRevenue | null>(null)

  const saveEntries = useCallback(async (items: VehicleRevenue[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'vehicle_revenue',
        config_value: items,
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
      .eq('config_key', 'vehicle_revenue')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as VehicleRevenue[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const vehicleSummary = useMemo(() => {
    const map: Record<string, { vehicle_name: string; reg_number: string; totalRevenue: number; totalCosts: number; totalTrips: number; periods: number }> = {}
    for (const e of entries) {
      if (!map[e.reg_number]) {
        map[e.reg_number] = { vehicle_name: e.vehicle_name, reg_number: e.reg_number, totalRevenue: 0, totalCosts: 0, totalTrips: 0, periods: 0 }
      }
      map[e.reg_number].totalRevenue += e.revenue
      map[e.reg_number].totalCosts += e.total_costs
      map[e.reg_number].totalTrips += e.trips_count
      map[e.reg_number].periods += 1
    }
    return Object.values(map)
      .map((v) => ({
        ...v,
        profit: v.totalRevenue - v.totalCosts,
        marginPct: v.totalRevenue > 0 ? ((v.totalRevenue - v.totalCosts) / v.totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit)
  }, [entries])

  const totals = useMemo(() => {
    const totalRevenue = entries.reduce((s, e) => s + e.revenue, 0)
    const totalCosts = entries.reduce((s, e) => s + e.total_costs, 0)
    const totalTrips = entries.reduce((s, e) => s + e.trips_count, 0)
    const profit = totalRevenue - totalCosts
    const marginPct = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0
    return { totalRevenue, totalCosts, totalTrips, profit, marginPct }
  }, [entries])

  const underutilized = useMemo(() => {
    return vehicleSummary.filter((v) => v.marginPct < 10)
  }, [vehicleSummary])

  function openNew() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(entry: VehicleRevenue) {
    setEditingEntry(entry)
    setForm({
      vehicle_name: entry.vehicle_name,
      reg_number: entry.reg_number,
      period: entry.period,
      revenue: entry.revenue,
      total_costs: entry.total_costs,
      trips_count: entry.trips_count,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: VehicleRevenue = {
      id: editingEntry?.id || crypto.randomUUID(),
      vehicle_name: form.vehicle_name.trim(),
      reg_number: form.reg_number.trim().toUpperCase(),
      period: form.period.trim(),
      revenue: form.revenue,
      total_costs: form.total_costs,
      trips_count: form.trips_count,
    }

    let updated: VehicleRevenue[]
    if (editingEntry) {
      updated = entries.map((e) => e.id === editingEntry.id ? item : e)
    } else {
      updated = [...entries, item]
    }

    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: VehicleRevenue) {
    setEntryToDelete(entry)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!entryToDelete) return
    const updated = entries.filter((e) => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Transport & Logistik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny period
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
              <TabsTrigger value="lonsamhet">Lönsamhet per fordon</TabsTrigger>
              <TabsTrigger value="underutnyttjad">Underutnyttjade</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Totala intäkter" value={fmt(totals.totalRevenue)} unit="kr" />
                <KPICard label="Totala kostnader" value={fmt(totals.totalCosts)} unit="kr" />
                <KPICard label="Vinst" value={fmt(totals.profit)} unit="kr" trend={totals.profit >= 0 ? 'up' : 'down'} />
                <KPICard label="Vinstmarginal" value={fmtPct(totals.marginPct)} unit="%" />
                <KPICard label="Totalt körningar" value={fmt(totals.totalTrips)} />
              </div>
              {entries.length === 0 && (
                <EmptyModuleState
                  icon={BarChart3}
                  title="Inga intäktsdata"
                  description="Registrera intäkter och kostnader per fordon för att analysera lönsamhet och identifiera underutnyttjade resurser."
                  actionLabel="Ny period"
                  onAction={openNew}
                />
              )}
            </TabsContent>

            <TabsContent value="lonsamhet" className="space-y-4">
              {vehicleSummary.length === 0 ? (
                <EmptyModuleState icon={BarChart3} title="Ingen data" description="Lägg till intäktsdata för att se lönsamhet per fordon." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Regnr</TableHead>
                        <TableHead className="font-medium text-right">Intäkter</TableHead>
                        <TableHead className="font-medium text-right">Kostnader</TableHead>
                        <TableHead className="font-medium text-right">Vinst</TableHead>
                        <TableHead className="font-medium text-right">Marginal</TableHead>
                        <TableHead className="font-medium text-right">Körningar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicleSummary.map((v) => (
                        <TableRow key={v.reg_number}>
                          <TableCell className="font-medium">{v.vehicle_name}</TableCell>
                          <TableCell className="font-mono">{v.reg_number}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(v.totalRevenue)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(v.totalCosts)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={cn('font-medium', v.profit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                              {fmt(v.profit)} kr
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Badge variant={v.marginPct >= 10 ? 'default' : 'destructive'}>
                              {fmtPct(v.marginPct)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{v.totalTrips}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="underutnyttjad" className="space-y-4">
              {underutilized.length === 0 ? (
                <EmptyModuleState icon={BarChart3} title="Inga underutnyttjade fordon" description="Alla fordon har en marginal over 10%. Bra jobbat!" />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Fordon med vinstmarginal under 10% - overväg att optimera användningen eller avyttra.
                  </p>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Fordon</TableHead>
                          <TableHead className="font-medium">Regnr</TableHead>
                          <TableHead className="font-medium text-right">Intäkter</TableHead>
                          <TableHead className="font-medium text-right">Kostnader</TableHead>
                          <TableHead className="font-medium text-right">Marginal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {underutilized.map((v) => (
                          <TableRow key={v.reg_number}>
                            <TableCell className="font-medium">{v.vehicle_name}</TableCell>
                            <TableCell className="font-mono">{v.reg_number}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(v.totalRevenue)} kr</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(v.totalCosts)} kr</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="destructive">{fmtPct(v.marginPct)}%</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera period' : 'Ny period'}</DialogTitle>
            <DialogDescription>
              {editingEntry ? 'Uppdatera intäkts- och kostnadsdata.' : 'Ange intäkter och kostnader per fordon.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Fordon *</Label>
                <Input value={form.vehicle_name} onChange={(e) => setForm((f) => ({ ...f, vehicle_name: e.target.value }))} placeholder="Volvo FH16" />
              </div>
              <div className="grid gap-2">
                <Label>Regnr *</Label>
                <Input value={form.reg_number} onChange={(e) => setForm((f) => ({ ...f, reg_number: e.target.value }))} placeholder="ABC 123" />
              </div>
              <div className="grid gap-2">
                <Label>Period *</Label>
                <Input value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} placeholder="2024-01" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Intäkter (kr) *</Label>
                <Input type="number" min={0} value={form.revenue || ''} onChange={(e) => setForm((f) => ({ ...f, revenue: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Kostnader (kr)</Label>
                <Input type="number" min={0} value={form.total_costs || ''} onChange={(e) => setForm((f) => ({ ...f, total_costs: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Antal körningar</Label>
                <Input type="number" min={0} value={form.trips_count || ''} onChange={(e) => setForm((f) => ({ ...f, trips_count: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.vehicle_name.trim() || !form.reg_number.trim() || !form.period.trim()}>
              {editingEntry ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort period</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort perioddatan för{' '}
              <span className="font-semibold">{entryToDelete?.vehicle_name}</span> ({entryToDelete?.period})?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
