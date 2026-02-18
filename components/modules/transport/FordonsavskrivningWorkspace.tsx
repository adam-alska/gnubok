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
  Car,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type DepreciationMethod = 'linear' | 'declining'

interface VehicleDepreciation {
  id: string
  vehicle_name: string
  reg_number: string
  purchase_price: number
  residual_value: number
  useful_life_years: number
  method: DepreciationMethod
  start_date: string
  asset_account: string
  depreciation_account: string
}

const METHOD_LABELS: Record<DepreciationMethod, string> = {
  linear: 'Linjär',
  declining: 'Degressiv',
}

const EMPTY_FORM = {
  vehicle_name: '',
  reg_number: '',
  purchase_price: 0,
  residual_value: 0,
  useful_life_years: 5,
  method: 'linear' as DepreciationMethod,
  start_date: '',
  asset_account: '1240',
  depreciation_account: '7832',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function calculateYearlyDepreciation(item: VehicleDepreciation, year: number): number {
  const depreciableAmount = item.purchase_price - item.residual_value
  if (item.method === 'linear') {
    return depreciableAmount / item.useful_life_years
  }
  // Declining balance at 30%
  const rate = 0.3
  let bookValue = item.purchase_price
  for (let i = 0; i < year - 1; i++) {
    bookValue -= bookValue * rate
  }
  const dep = bookValue * rate
  const minBookValue = item.residual_value
  if (bookValue - dep < minBookValue) {
    return Math.max(0, bookValue - minBookValue)
  }
  return dep
}

function calculateAccumulatedDepreciation(item: VehicleDepreciation): number {
  const startDate = new Date(item.start_date)
  const now = new Date()
  const yearsElapsed = Math.max(0, (now.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  const fullYears = Math.min(Math.floor(yearsElapsed), item.useful_life_years)
  let total = 0
  for (let y = 1; y <= fullYears; y++) {
    total += calculateYearlyDepreciation(item, y)
  }
  // Partial year
  const partialFraction = yearsElapsed - fullYears
  if (fullYears < item.useful_life_years && partialFraction > 0) {
    total += calculateYearlyDepreciation(item, fullYears + 1) * partialFraction
  }
  return Math.min(total, item.purchase_price - item.residual_value)
}

function calculateBookValue(item: VehicleDepreciation): number {
  return item.purchase_price - calculateAccumulatedDepreciation(item)
}

export function FordonsavskrivningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [vehicles, setVehicles] = useState<VehicleDepreciation[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<VehicleDepreciation | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [vehicleToDelete, setVehicleToDelete] = useState<VehicleDepreciation | null>(null)

  const saveVehicles = useCallback(async (items: VehicleDepreciation[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'vehicles',
        config_value: items,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchVehicles = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'vehicles')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setVehicles(data.config_value as VehicleDepreciation[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchVehicles() }, [fetchVehicles])

  const totals = useMemo(() => {
    let totalPurchase = 0
    let totalAccumulated = 0
    let totalBookValue = 0
    let totalYearlyDep = 0
    for (const v of vehicles) {
      totalPurchase += v.purchase_price
      const accum = calculateAccumulatedDepreciation(v)
      totalAccumulated += accum
      totalBookValue += calculateBookValue(v)
      const startDate = new Date(v.start_date)
      const now = new Date()
      const yearsElapsed = (now.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      const currentYear = Math.min(Math.ceil(yearsElapsed), v.useful_life_years)
      if (currentYear > 0 && currentYear <= v.useful_life_years) {
        totalYearlyDep += calculateYearlyDepreciation(v, currentYear)
      }
    }
    return { totalPurchase, totalAccumulated, totalBookValue, totalYearlyDep }
  }, [vehicles])

  function openNewVehicle() {
    setEditingVehicle(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditVehicle(vehicle: VehicleDepreciation) {
    setEditingVehicle(vehicle)
    setForm({
      vehicle_name: vehicle.vehicle_name,
      reg_number: vehicle.reg_number,
      purchase_price: vehicle.purchase_price,
      residual_value: vehicle.residual_value,
      useful_life_years: vehicle.useful_life_years,
      method: vehicle.method,
      start_date: vehicle.start_date,
      asset_account: vehicle.asset_account,
      depreciation_account: vehicle.depreciation_account,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: VehicleDepreciation = {
      id: editingVehicle?.id || crypto.randomUUID(),
      vehicle_name: form.vehicle_name.trim(),
      reg_number: form.reg_number.trim().toUpperCase(),
      purchase_price: form.purchase_price,
      residual_value: form.residual_value,
      useful_life_years: form.useful_life_years,
      method: form.method,
      start_date: form.start_date,
      asset_account: form.asset_account,
      depreciation_account: form.depreciation_account,
    }

    let updated: VehicleDepreciation[]
    if (editingVehicle) {
      updated = vehicles.map((v) => v.id === editingVehicle.id ? item : v)
    } else {
      updated = [...vehicles, item]
    }

    setVehicles(updated)
    setDialogOpen(false)
    await saveVehicles(updated)
  }

  function openDeleteConfirmation(vehicle: VehicleDepreciation) {
    setVehicleToDelete(vehicle)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!vehicleToDelete) return
    const updated = vehicles.filter((v) => v.id !== vehicleToDelete.id)
    setVehicles(updated)
    setDeleteDialogOpen(false)
    setVehicleToDelete(null)
    await saveVehicles(updated)
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
          <Button onClick={openNewVehicle}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt fordon
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Totalt anskaffningsvärde" value={fmt(totals.totalPurchase)} unit="kr" />
              <KPICard label="Ackumulerade avskrivningar" value={fmt(totals.totalAccumulated)} unit="kr" />
              <KPICard label="Totalt bokfört värde" value={fmt(totals.totalBookValue)} unit="kr" />
              <KPICard label="Årets avskrivning" value={fmt(totals.totalYearlyDep)} unit="kr" />
            </div>

            {vehicles.length === 0 ? (
              <EmptyModuleState
                icon={Car}
                title="Inga fordon registrerade"
                description="Lägg till fordon för att beräkna avskrivningar med linjär eller degressiv metod."
                actionLabel="Nytt fordon"
                onAction={openNewVehicle}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Fordon</TableHead>
                      <TableHead className="font-medium">Regnr</TableHead>
                      <TableHead className="font-medium">Metod</TableHead>
                      <TableHead className="font-medium text-right">Anskaffning</TableHead>
                      <TableHead className="font-medium text-right">Restvärde</TableHead>
                      <TableHead className="font-medium text-right">Bokfört värde</TableHead>
                      <TableHead className="font-medium text-right">Konton</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.vehicle_name}</TableCell>
                        <TableCell className="font-mono">{v.reg_number}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{METHOD_LABELS[v.method]}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(v.purchase_price)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(v.residual_value)} kr</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(calculateBookValue(v))} kr</TableCell>
                        <TableCell className="text-right font-mono text-xs">{v.asset_account}/{v.depreciation_account}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditVehicle(v)} title="Redigera">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(v)} title="Ta bort">
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVehicle ? 'Redigera fordon' : 'Nytt fordon'}</DialogTitle>
            <DialogDescription>
              {editingVehicle
                ? 'Uppdatera fordonets avskrivningsuppgifter.'
                : 'Lägg till ett fordon för avskrivningsberäkning.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fordonsnamn *</Label>
                <Input value={form.vehicle_name} onChange={(e) => setForm((f) => ({ ...f, vehicle_name: e.target.value }))} placeholder="Volvo FH16" />
              </div>
              <div className="grid gap-2">
                <Label>Registreringsnummer *</Label>
                <Input value={form.reg_number} onChange={(e) => setForm((f) => ({ ...f, reg_number: e.target.value }))} placeholder="ABC 123" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Anskaffningspris (kr) *</Label>
                <Input type="number" min={0} value={form.purchase_price || ''} onChange={(e) => setForm((f) => ({ ...f, purchase_price: parseFloat(e.target.value) || 0 }))} placeholder="500000" />
              </div>
              <div className="grid gap-2">
                <Label>Restvärde (kr)</Label>
                <Input type="number" min={0} value={form.residual_value || ''} onChange={(e) => setForm((f) => ({ ...f, residual_value: parseFloat(e.target.value) || 0 }))} placeholder="50000" />
              </div>
              <div className="grid gap-2">
                <Label>Nyttjandeperiod (år) *</Label>
                <Input type="number" min={1} max={30} value={form.useful_life_years} onChange={(e) => setForm((f) => ({ ...f, useful_life_years: parseInt(e.target.value) || 5 }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Avskrivningsmetod *</Label>
                <Select value={form.method} onValueChange={(val) => setForm((f) => ({ ...f, method: val as DepreciationMethod }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linjär</SelectItem>
                    <SelectItem value="declining">Degressiv (30%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Startdatum *</Label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Konton (tillgång/avskrivning)</Label>
                <div className="flex items-center gap-1">
                  <Input value={form.asset_account} onChange={(e) => setForm((f) => ({ ...f, asset_account: e.target.value }))} placeholder="1240" className="w-20" maxLength={4} />
                  <span className="text-muted-foreground">/</span>
                  <Input value={form.depreciation_account} onChange={(e) => setForm((f) => ({ ...f, depreciation_account: e.target.value }))} placeholder="7832" className="w-20" maxLength={4} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.vehicle_name.trim() || !form.reg_number.trim() || !form.purchase_price || !form.start_date}>
              {editingVehicle ? 'Uppdatera' : 'Lägg till fordon'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort fordon</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort{' '}
              <span className="font-semibold">{vehicleToDelete?.vehicle_name}</span>{' '}
              ({vehicleToDelete?.reg_number})? Denna åtgärd kan inte ångras.
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
