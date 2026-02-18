'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface VehiclePeriod {
  id: string
  vehicle_name: string
  reg_number: string
  period: string
  distance_mil: number
  fuel_cost: number
  maintenance_cost: number
  depreciation_cost: number
  insurance_cost: number
}

const EMPTY_FORM = {
  vehicle_name: '',
  reg_number: '',
  period: '',
  distance_mil: 0,
  fuel_cost: 0,
  maintenance_cost: 0,
  depreciation_cost: 0,
  insurance_cost: 0,
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number, decimals = 1): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)
}

function totalCost(e: VehiclePeriod): number {
  return e.fuel_cost + e.maintenance_cost + e.depreciation_cost + e.insurance_cost
}

function costPerMil(e: VehiclePeriod): number {
  return e.distance_mil > 0 ? totalCost(e) / e.distance_mil : 0
}

export function KostnadPerMilWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<VehiclePeriod[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<VehiclePeriod | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<VehiclePeriod | null>(null)

  const saveEntries = useCallback(async (items: VehiclePeriod[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'cost_per_mil',
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
      .eq('config_key', 'cost_per_mil')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as VehiclePeriod[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const vehicleAverages = useMemo(() => {
    const map: Record<string, { vehicle_name: string; reg_number: string; totalCost: number; totalMil: number; periods: number }> = {}
    for (const e of entries) {
      if (!map[e.reg_number]) {
        map[e.reg_number] = { vehicle_name: e.vehicle_name, reg_number: e.reg_number, totalCost: 0, totalMil: 0, periods: 0 }
      }
      map[e.reg_number].totalCost += totalCost(e)
      map[e.reg_number].totalMil += e.distance_mil
      map[e.reg_number].periods += 1
    }
    return Object.values(map)
      .map((v) => ({ ...v, avgCostPerMil: v.totalMil > 0 ? v.totalCost / v.totalMil : 0 }))
      .sort((a, b) => a.avgCostPerMil - b.avgCostPerMil)
  }, [entries])

  const trendByPeriod = useMemo(() => {
    const map: Record<string, { period: string; totalCost: number; totalMil: number }> = {}
    for (const e of entries) {
      if (!map[e.period]) {
        map[e.period] = { period: e.period, totalCost: 0, totalMil: 0 }
      }
      map[e.period].totalCost += totalCost(e)
      map[e.period].totalMil += e.distance_mil
    }
    return Object.values(map)
      .map((p) => ({ ...p, costPerMil: p.totalMil > 0 ? p.totalCost / p.totalMil : 0 }))
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [entries])

  const overall = useMemo(() => {
    const totalC = entries.reduce((s, e) => s + totalCost(e), 0)
    const totalM = entries.reduce((s, e) => s + e.distance_mil, 0)
    return { totalCost: totalC, totalMil: totalM, avgCostPerMil: totalM > 0 ? totalC / totalM : 0 }
  }, [entries])

  function openNew() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(entry: VehiclePeriod) {
    setEditingEntry(entry)
    setForm({
      vehicle_name: entry.vehicle_name,
      reg_number: entry.reg_number,
      period: entry.period,
      distance_mil: entry.distance_mil,
      fuel_cost: entry.fuel_cost,
      maintenance_cost: entry.maintenance_cost,
      depreciation_cost: entry.depreciation_cost,
      insurance_cost: entry.insurance_cost,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: VehiclePeriod = {
      id: editingEntry?.id || crypto.randomUUID(),
      vehicle_name: form.vehicle_name.trim(),
      reg_number: form.reg_number.trim().toUpperCase(),
      period: form.period.trim(),
      distance_mil: form.distance_mil,
      fuel_cost: form.fuel_cost,
      maintenance_cost: form.maintenance_cost,
      depreciation_cost: form.depreciation_cost,
      insurance_cost: form.insurance_cost,
    }

    let updated: VehiclePeriod[]
    if (editingEntry) {
      updated = entries.map((e) => e.id === editingEntry.id ? item : e)
    } else {
      updated = [...entries, item]
    }

    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: VehiclePeriod) {
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
              <TabsTrigger value="per-fordon">Per fordon</TabsTrigger>
              <TabsTrigger value="trend">Trend</TabsTrigger>
              <TabsTrigger value="detalj">Alla poster</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Snitt kr/mil" value={fmtDec(overall.avgCostPerMil)} unit="kr/mil" />
                <KPICard label="Totala kostnader" value={fmt(overall.totalCost)} unit="kr" />
                <KPICard label="Totalt körda mil" value={fmt(overall.totalMil)} unit="mil" />
                <KPICard label="Antal fordon" value={String(vehicleAverages.length)} />
              </div>
              {entries.length === 0 && (
                <EmptyModuleState
                  icon={TrendingUp}
                  title="Ingen rapportdata"
                  description="Lägg till perioddata per fordon för att se kostnad per mil (bränsle + underhåll + avskrivning + försäkring)."
                  actionLabel="Ny period"
                  onAction={openNew}
                />
              )}
            </TabsContent>

            <TabsContent value="per-fordon" className="space-y-4">
              {vehicleAverages.length === 0 ? (
                <EmptyModuleState icon={TrendingUp} title="Inga fordon" description="Lägg till data för att se snitt per fordon." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Regnr</TableHead>
                        <TableHead className="font-medium text-right">Perioder</TableHead>
                        <TableHead className="font-medium text-right">Totala mil</TableHead>
                        <TableHead className="font-medium text-right">Total kostnad</TableHead>
                        <TableHead className="font-medium text-right">Snitt kr/mil</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicleAverages.map((v) => (
                        <TableRow key={v.reg_number}>
                          <TableCell className="font-medium">{v.vehicle_name}</TableCell>
                          <TableCell className="font-mono">{v.reg_number}</TableCell>
                          <TableCell className="text-right tabular-nums">{v.periods}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(v.totalMil)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(v.totalCost)} kr</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtDec(v.avgCostPerMil)} kr</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="trend" className="space-y-4">
              {trendByPeriod.length === 0 ? (
                <EmptyModuleState icon={TrendingUp} title="Ingen trenddata" description="Lägg till data från flera perioder för att se trend." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Period</TableHead>
                        <TableHead className="font-medium text-right">Total kostnad</TableHead>
                        <TableHead className="font-medium text-right">Totala mil</TableHead>
                        <TableHead className="font-medium text-right">Kr/mil</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trendByPeriod.map((p, i) => {
                        const prev = i > 0 ? trendByPeriod[i - 1].costPerMil : null
                        const change = prev != null ? p.costPerMil - prev : null
                        return (
                          <TableRow key={p.period}>
                            <TableCell className="font-medium">{p.period}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(p.totalCost)} kr</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(p.totalMil)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className="font-medium">{fmtDec(p.costPerMil)} kr</span>
                              {change != null && (
                                <span className={cn('ml-2 text-xs', change > 0 ? 'text-red-500' : change < 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                                  {change > 0 ? '+' : ''}{fmtDec(change)}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="detalj" className="space-y-4">
              {entries.length === 0 ? (
                <EmptyModuleState icon={TrendingUp} title="Inga poster" description="Lägg till perioddata per fordon." actionLabel="Ny period" onAction={openNew} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Period</TableHead>
                        <TableHead className="font-medium text-right">Mil</TableHead>
                        <TableHead className="font-medium text-right">Bränsle</TableHead>
                        <TableHead className="font-medium text-right">Underhåll</TableHead>
                        <TableHead className="font-medium text-right">Avskrivning</TableHead>
                        <TableHead className="font-medium text-right">Försäkring</TableHead>
                        <TableHead className="font-medium text-right">Kr/mil</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.sort((a, b) => b.period.localeCompare(a.period)).map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.vehicle_name}<br /><span className="font-mono text-xs text-muted-foreground">{e.reg_number}</span></TableCell>
                          <TableCell>{e.period}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtDec(e.distance_mil)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.fuel_cost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.maintenance_cost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.depreciation_cost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.insurance_cost)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtDec(costPerMil(e))}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(e)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera period' : 'Ny period'}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? 'Uppdatera kostnader och körsträcka för perioden.'
                : 'Ange kostnader och körsträcka per fordon och period.'}
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

            <div className="grid gap-2">
              <Label>Körsträcka (mil) *</Label>
              <Input type="number" min={0} step={0.1} value={form.distance_mil || ''} onChange={(e) => setForm((f) => ({ ...f, distance_mil: parseFloat(e.target.value) || 0 }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Bränslekostnad (kr)</Label>
                <Input type="number" min={0} value={form.fuel_cost || ''} onChange={(e) => setForm((f) => ({ ...f, fuel_cost: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Underhåll (kr)</Label>
                <Input type="number" min={0} value={form.maintenance_cost || ''} onChange={(e) => setForm((f) => ({ ...f, maintenance_cost: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Avskrivning (kr)</Label>
                <Input type="number" min={0} value={form.depreciation_cost || ''} onChange={(e) => setForm((f) => ({ ...f, depreciation_cost: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Försäkring (kr)</Label>
                <Input type="number" min={0} value={form.insurance_cost || ''} onChange={(e) => setForm((f) => ({ ...f, insurance_cost: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.vehicle_name.trim() || !form.reg_number.trim() || !form.period.trim() || !form.distance_mil}>
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
