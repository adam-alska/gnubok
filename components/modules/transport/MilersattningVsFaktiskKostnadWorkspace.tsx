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
  Calculator,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface VehicleComparison {
  id: string
  vehicle_name: string
  reg_number: string
  period: string
  distance_mil: number
  fuel_cost: number
  maintenance_cost: number
  insurance_cost: number
  depreciation_cost: number
  other_costs: number
}

const MILEAGE_ALLOWANCE_PER_MIL = 25

const EMPTY_FORM = {
  vehicle_name: '',
  reg_number: '',
  period: '',
  distance_mil: 0,
  fuel_cost: 0,
  maintenance_cost: 0,
  insurance_cost: 0,
  depreciation_cost: 0,
  other_costs: 0,
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
}

function totalActualCost(entry: VehicleComparison): number {
  return entry.fuel_cost + entry.maintenance_cost + entry.insurance_cost + entry.depreciation_cost + entry.other_costs
}

function mileageAllowance(entry: VehicleComparison): number {
  return entry.distance_mil * MILEAGE_ALLOWANCE_PER_MIL
}

export function MilersattningVsFaktiskKostnadWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<VehicleComparison[]>([])
  const [allowanceRate, setAllowanceRate] = useState(MILEAGE_ALLOWANCE_PER_MIL)
  const [allowanceInput, setAllowanceInput] = useState(String(MILEAGE_ALLOWANCE_PER_MIL))
  const [savingRate, setSavingRate] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<VehicleComparison | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<VehicleComparison | null>(null)

  const saveEntries = useCallback(async (items: VehicleComparison[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'comparisons',
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
      .in('config_key', ['comparisons', 'allowance_rate'])

    if (data) {
      for (const row of data) {
        if (row.config_key === 'comparisons' && Array.isArray(row.config_value)) {
          setEntries(row.config_value as VehicleComparison[])
        }
        if (row.config_key === 'allowance_rate' && typeof row.config_value === 'number') {
          setAllowanceRate(row.config_value)
          setAllowanceInput(String(row.config_value))
        }
      }
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSaveRate = async () => {
    const val = parseFloat(allowanceInput)
    if (isNaN(val)) return
    setSavingRate(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingRate(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'allowance_rate',
        config_value: val,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setAllowanceRate(val)
    setSavingRate(false)
  }

  const totals = useMemo(() => {
    let totalMil = 0
    let totalActual = 0
    let totalAllowance = 0
    for (const e of entries) {
      totalMil += e.distance_mil
      totalActual += totalActualCost(e)
      totalAllowance += e.distance_mil * allowanceRate
    }
    const difference = totalAllowance - totalActual
    return { totalMil, totalActual, totalAllowance, difference }
  }, [entries, allowanceRate])

  function openNew() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(entry: VehicleComparison) {
    setEditingEntry(entry)
    setForm({
      vehicle_name: entry.vehicle_name,
      reg_number: entry.reg_number,
      period: entry.period,
      distance_mil: entry.distance_mil,
      fuel_cost: entry.fuel_cost,
      maintenance_cost: entry.maintenance_cost,
      insurance_cost: entry.insurance_cost,
      depreciation_cost: entry.depreciation_cost,
      other_costs: entry.other_costs,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: VehicleComparison = {
      id: editingEntry?.id || crypto.randomUUID(),
      vehicle_name: form.vehicle_name.trim(),
      reg_number: form.reg_number.trim().toUpperCase(),
      period: form.period.trim(),
      distance_mil: form.distance_mil,
      fuel_cost: form.fuel_cost,
      maintenance_cost: form.maintenance_cost,
      insurance_cost: form.insurance_cost,
      depreciation_cost: form.depreciation_cost,
      other_costs: form.other_costs,
    }

    let updated: VehicleComparison[]
    if (editingEntry) {
      updated = entries.map((e) => e.id === editingEntry.id ? item : e)
    } else {
      updated = [...entries, item]
    }

    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: VehicleComparison) {
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
        category="bokforing"
        sectorName="Transport & Logistik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny jämförelse
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="jamforelse" className="space-y-6">
            <TabsList>
              <TabsTrigger value="jamforelse">Jämförelse</TabsTrigger>
              <TabsTrigger value="detalj">Per fordon</TabsTrigger>
              <TabsTrigger value="installningar">Inställningar</TabsTrigger>
            </TabsList>

            <TabsContent value="jamforelse" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total milersättning" value={fmt(totals.totalAllowance)} unit="kr" />
                <KPICard label="Faktisk kostnad" value={fmt(totals.totalActual)} unit="kr" />
                <KPICard
                  label="Skillnad"
                  value={`${totals.difference >= 0 ? '+' : ''}${fmt(totals.difference)}`}
                  unit="kr"
                  trend={totals.difference > 0 ? 'up' : totals.difference < 0 ? 'down' : 'neutral'}
                  trendLabel={totals.difference > 0 ? 'Milersättning högre' : totals.difference < 0 ? 'Faktisk kostnad högre' : 'Lika'}
                />
                <KPICard label="Totalt körda mil" value={fmt(totals.totalMil)} unit="mil" />
              </div>

              {entries.length === 0 && (
                <EmptyModuleState
                  icon={Calculator}
                  title="Ingen jämförelsedata"
                  description="Lägg till kördata per fordon för att jämföra milersättning (25 kr/mil) mot faktisk kostnad."
                  actionLabel="Ny jämförelse"
                  onAction={openNew}
                />
              )}
            </TabsContent>

            <TabsContent value="detalj" className="space-y-4">
              {entries.length === 0 ? (
                <EmptyModuleState
                  icon={Calculator}
                  title="Inga poster"
                  description="Lägg till poster för att se jämförelse per fordon."
                  actionLabel="Ny jämförelse"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Regnr</TableHead>
                        <TableHead className="font-medium">Period</TableHead>
                        <TableHead className="font-medium text-right">Mil</TableHead>
                        <TableHead className="font-medium text-right">Milersättning</TableHead>
                        <TableHead className="font-medium text-right">Faktisk kostnad</TableHead>
                        <TableHead className="font-medium text-right">Skillnad</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((e) => {
                        const actual = totalActualCost(e)
                        const allowance = e.distance_mil * allowanceRate
                        const diff = allowance - actual
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="font-medium">{e.vehicle_name}</TableCell>
                            <TableCell className="font-mono">{e.reg_number}</TableCell>
                            <TableCell>{e.period}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtDec(e.distance_mil)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(allowance)} kr</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(actual)} kr</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <Badge variant={diff >= 0 ? 'default' : 'destructive'}>
                                {diff >= 0 ? '+' : ''}{fmt(diff)} kr
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(e)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(e)} title="Ta bort">
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
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="installningar" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
                <h3 className="text-sm font-semibold">Milersättning (kr/mil)</h3>
                <p className="text-xs text-muted-foreground">
                  Skatteverkets schablonbelopp är 25 kr/mil. Ange ditt företags milersättning.
                </p>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Belopp (kr/mil)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min={0}
                      value={allowanceInput}
                      onChange={(e) => setAllowanceInput(e.target.value)}
                      className="h-9 w-32"
                      placeholder="25"
                    />
                  </div>
                  <Button size="sm" onClick={handleSaveRate} disabled={savingRate}>
                    {savingRate ? (
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera jämförelse' : 'Ny jämförelse'}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? 'Uppdatera fordonets kördata och kostnader.'
                : 'Ange kördata och faktiska kostnader för ett fordon.'}
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
              <Label>Körda mil *</Label>
              <Input type="number" min={0} step={0.1} value={form.distance_mil || ''} onChange={(e) => setForm((f) => ({ ...f, distance_mil: parseFloat(e.target.value) || 0 }))} placeholder="450" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Bränslekostnad (kr)</Label>
                <Input type="number" min={0} value={form.fuel_cost || ''} onChange={(e) => setForm((f) => ({ ...f, fuel_cost: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Underhållskostnad (kr)</Label>
                <Input type="number" min={0} value={form.maintenance_cost || ''} onChange={(e) => setForm((f) => ({ ...f, maintenance_cost: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Försäkring (kr)</Label>
                <Input type="number" min={0} value={form.insurance_cost || ''} onChange={(e) => setForm((f) => ({ ...f, insurance_cost: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Avskrivning (kr)</Label>
                <Input type="number" min={0} value={form.depreciation_cost || ''} onChange={(e) => setForm((f) => ({ ...f, depreciation_cost: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Övrigt (kr)</Label>
                <Input type="number" min={0} value={form.other_costs || ''} onChange={(e) => setForm((f) => ({ ...f, other_costs: parseFloat(e.target.value) || 0 }))} />
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
            <DialogTitle>Ta bort jämförelse</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort jämförelsen för{' '}
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
