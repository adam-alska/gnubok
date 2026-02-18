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
  Fuel,
  Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface FuelEntry {
  id: string
  vehicle_name: string
  reg_number: string
  period: string
  distance_mil: number
  liters_consumed: number
  expected_liters_per_mil: number
}

const EMPTY_FORM = {
  vehicle_name: '',
  reg_number: '',
  period: '',
  distance_mil: 0,
  liters_consumed: 0,
  expected_liters_per_mil: 3.5,
}

function fmtDec(n: number, d = 2): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function litersPerMil(entry: FuelEntry): number {
  return entry.distance_mil > 0 ? entry.liters_consumed / entry.distance_mil : 0
}

export function BransleeffektivitetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<FuelEntry[]>([])
  const [expectedTarget, setExpectedTarget] = useState(3.5)
  const [targetInput, setTargetInput] = useState('3.5')
  const [savingTarget, setSavingTarget] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<FuelEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<FuelEntry | null>(null)

  const saveEntries = useCallback(async (items: FuelEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'fuel_entries',
        config_value: items,
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
      .select('config_value, config_key')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .in('config_key', ['fuel_entries', 'expected_target'])

    if (data) {
      for (const row of data) {
        if (row.config_key === 'fuel_entries' && Array.isArray(row.config_value)) {
          setEntries(row.config_value as FuelEntry[])
        }
        if (row.config_key === 'expected_target' && typeof row.config_value === 'number') {
          setExpectedTarget(row.config_value)
          setTargetInput(String(row.config_value))
        }
      }
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSaveTarget = async () => {
    const val = parseFloat(targetInput)
    if (isNaN(val)) return
    setSavingTarget(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingTarget(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'expected_target',
        config_value: val,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setExpectedTarget(val)
    setSavingTarget(false)
  }

  const vehicleSummary = useMemo(() => {
    const map: Record<string, { vehicle_name: string; reg_number: string; totalLiters: number; totalMil: number; entries: FuelEntry[] }> = {}
    for (const e of entries) {
      if (!map[e.reg_number]) {
        map[e.reg_number] = { vehicle_name: e.vehicle_name, reg_number: e.reg_number, totalLiters: 0, totalMil: 0, entries: [] }
      }
      map[e.reg_number].totalLiters += e.liters_consumed
      map[e.reg_number].totalMil += e.distance_mil
      map[e.reg_number].entries.push(e)
    }
    return Object.values(map)
      .map((v) => ({
        ...v,
        avgLitersPerMil: v.totalMil > 0 ? v.totalLiters / v.totalMil : 0,
      }))
      .sort((a, b) => a.avgLitersPerMil - b.avgLitersPerMil)
  }, [entries])

  const trendByPeriod = useMemo(() => {
    const map: Record<string, { period: string; totalLiters: number; totalMil: number }> = {}
    for (const e of entries) {
      if (!map[e.period]) {
        map[e.period] = { period: e.period, totalLiters: 0, totalMil: 0 }
      }
      map[e.period].totalLiters += e.liters_consumed
      map[e.period].totalMil += e.distance_mil
    }
    return Object.values(map)
      .map((p) => ({ ...p, litersPerMil: p.totalMil > 0 ? p.totalLiters / p.totalMil : 0 }))
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [entries])

  const overall = useMemo(() => {
    const totalLiters = entries.reduce((s, e) => s + e.liters_consumed, 0)
    const totalMil = entries.reduce((s, e) => s + e.distance_mil, 0)
    const avgLPM = totalMil > 0 ? totalLiters / totalMil : 0
    const deviation = avgLPM - expectedTarget
    return { totalLiters, totalMil, avgLPM, deviation }
  }, [entries, expectedTarget])

  function openNew() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM, expected_liters_per_mil: expectedTarget })
    setDialogOpen(true)
  }

  function openEdit(entry: FuelEntry) {
    setEditingEntry(entry)
    setForm({
      vehicle_name: entry.vehicle_name,
      reg_number: entry.reg_number,
      period: entry.period,
      distance_mil: entry.distance_mil,
      liters_consumed: entry.liters_consumed,
      expected_liters_per_mil: entry.expected_liters_per_mil,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: FuelEntry = {
      id: editingEntry?.id || crypto.randomUUID(),
      vehicle_name: form.vehicle_name.trim(),
      reg_number: form.reg_number.trim().toUpperCase(),
      period: form.period.trim(),
      distance_mil: form.distance_mil,
      liters_consumed: form.liters_consumed,
      expected_liters_per_mil: form.expected_liters_per_mil,
    }

    let updated: FuelEntry[]
    if (editingEntry) {
      updated = entries.map((e) => e.id === editingEntry.id ? item : e)
    } else {
      updated = [...entries, item]
    }

    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: FuelEntry) {
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
            Ny mätning
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
              <TabsTrigger value="installningar">Inställningar</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard
                  label="Snitt liter/mil"
                  value={fmtDec(overall.avgLPM)}
                  unit="l/mil"
                  target={expectedTarget}
                  trend={overall.deviation > 0.2 ? 'down' : overall.deviation < -0.2 ? 'up' : 'neutral'}
                  trendLabel={`${overall.deviation > 0 ? '+' : ''}${fmtDec(overall.deviation)} vs mål`}
                />
                <KPICard label="Förväntat" value={fmtDec(expectedTarget)} unit="l/mil" />
                <KPICard label="Totalt förbrukat" value={fmt(overall.totalLiters)} unit="liter" />
                <KPICard label="Totalt körda mil" value={fmt(overall.totalMil)} unit="mil" />
              </div>
              {entries.length === 0 && (
                <EmptyModuleState
                  icon={Fuel}
                  title="Ingen bränsledata"
                  description="Registrera bränsleförbrukning per fordon och period för att analysera effektivitet."
                  actionLabel="Ny mätning"
                  onAction={openNew}
                />
              )}
            </TabsContent>

            <TabsContent value="per-fordon" className="space-y-4">
              {vehicleSummary.length === 0 ? (
                <EmptyModuleState icon={Fuel} title="Inga fordon" description="Lägg till bränsledata för att se effektivitet per fordon." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Regnr</TableHead>
                        <TableHead className="font-medium text-right">Totalt mil</TableHead>
                        <TableHead className="font-medium text-right">Totalt liter</TableHead>
                        <TableHead className="font-medium text-right">Liter/mil</TableHead>
                        <TableHead className="font-medium text-right">vs Mål</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicleSummary.map((v) => {
                        const diff = v.avgLitersPerMil - expectedTarget
                        return (
                          <TableRow key={v.reg_number}>
                            <TableCell className="font-medium">{v.vehicle_name}</TableCell>
                            <TableCell className="font-mono">{v.reg_number}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(v.totalMil)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(v.totalLiters)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmtDec(v.avgLitersPerMil)}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={diff <= 0 ? 'default' : 'destructive'}>
                                {diff > 0 ? '+' : ''}{fmtDec(diff)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="trend" className="space-y-4">
              {trendByPeriod.length === 0 ? (
                <EmptyModuleState icon={Fuel} title="Ingen trenddata" description="Lägg till data från flera perioder." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Period</TableHead>
                        <TableHead className="font-medium text-right">Totalt liter</TableHead>
                        <TableHead className="font-medium text-right">Totalt mil</TableHead>
                        <TableHead className="font-medium text-right">Liter/mil</TableHead>
                        <TableHead className="font-medium text-right">Förändring</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trendByPeriod.map((p, i) => {
                        const prev = i > 0 ? trendByPeriod[i - 1].litersPerMil : null
                        const change = prev != null ? p.litersPerMil - prev : null
                        return (
                          <TableRow key={p.period}>
                            <TableCell className="font-medium">{p.period}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(p.totalLiters)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(p.totalMil)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmtDec(p.litersPerMil)}</TableCell>
                            <TableCell className="text-right">
                              {change != null ? (
                                <span className={cn('text-xs font-medium', change > 0 ? 'text-red-500' : change < 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                                  {change > 0 ? '+' : ''}{fmtDec(change)}
                                </span>
                              ) : '-'}
                            </TableCell>
                          </TableRow>
                        )
                      })}
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

            <TabsContent value="installningar" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
                <h3 className="text-sm font-semibold">Förväntat liter/mil</h3>
                <p className="text-xs text-muted-foreground">
                  Ange det förväntade genomsnittet i liter per mil för din fordonsflotta.
                </p>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mål (l/mil)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min={0}
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      className="h-9 w-32"
                      placeholder="3.5"
                    />
                  </div>
                  <Button size="sm" onClick={handleSaveTarget} disabled={savingTarget}>
                    {savingTarget ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-3.5 w-3.5" />
                    )}
                    Spara
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera mätning' : 'Ny mätning'}</DialogTitle>
            <DialogDescription>
              {editingEntry ? 'Uppdatera bränsledata.' : 'Registrera bränsleförbrukning och körsträcka.'}
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
                <Label>Körsträcka (mil) *</Label>
                <Input type="number" min={0} step={0.1} value={form.distance_mil || ''} onChange={(e) => setForm((f) => ({ ...f, distance_mil: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Förbrukning (liter) *</Label>
                <Input type="number" min={0} step={0.1} value={form.liters_consumed || ''} onChange={(e) => setForm((f) => ({ ...f, liters_consumed: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Förväntat (l/mil)</Label>
                <Input type="number" min={0} step={0.1} value={form.expected_liters_per_mil || ''} onChange={(e) => setForm((f) => ({ ...f, expected_liters_per_mil: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.vehicle_name.trim() || !form.reg_number.trim() || !form.period.trim() || !form.distance_mil || !form.liters_consumed}>
              {editingEntry ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort mätning</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort mätningen för{' '}
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
