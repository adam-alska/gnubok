'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
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
  Truck,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type VehicleStatus = 'active' | 'service' | 'inactive' | 'sold'

interface Vehicle {
  id: string
  name: string
  reg_number: string
  vehicle_type: string
  brand: string
  model: string
  year: number
  mileage_km: number
  status: VehicleStatus
  next_inspection: string
  insurance_expires: string
  lease_expires: string
  notes: string
}

const STATUS_LABELS: Record<VehicleStatus, string> = {
  active: 'Aktiv',
  service: 'Service',
  inactive: 'Inaktiv',
  sold: 'Såld',
}

const STATUS_VARIANTS: Record<VehicleStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  active: 'success',
  service: 'warning',
  inactive: 'neutral',
  sold: 'danger',
}

const VEHICLE_TYPES = [
  { value: 'lastbil', label: 'Lastbil' },
  { value: 'skåpbil', label: 'Skåpbil' },
  { value: 'personbil', label: 'Personbil' },
  { value: 'släpvagn', label: 'Släpvagn' },
  { value: 'annat', label: 'Annat' },
]

const EMPTY_FORM = {
  name: '',
  reg_number: '',
  vehicle_type: 'lastbil',
  brand: '',
  model: '',
  year: new Date().getFullYear(),
  mileage_km: 0,
  status: 'active' as VehicleStatus,
  next_inspection: '',
  insurance_expires: '',
  lease_expires: '',
  notes: '',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - new Date().getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function FlottahanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null)

  const saveVehicles = useCallback(async (items: Vehicle[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'fleet_vehicles',
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
      .eq('config_key', 'fleet_vehicles')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setVehicles(data.config_value as Vehicle[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchVehicles() }, [fetchVehicles])

  const stats = useMemo(() => {
    const active = vehicles.filter((v) => v.status === 'active').length
    const inService = vehicles.filter((v) => v.status === 'service').length
    const upcomingInspections = vehicles.filter((v) => {
      const d = daysUntil(v.next_inspection)
      return d != null && d >= 0 && d <= 30
    }).length
    const expiredInsurance = vehicles.filter((v) => {
      const d = daysUntil(v.insurance_expires)
      return d != null && d <= 0
    }).length
    return { total: vehicles.length, active, inService, upcomingInspections, expiredInsurance }
  }, [vehicles])

  const alerts = useMemo(() => {
    return vehicles.filter((v) => {
      const insp = daysUntil(v.next_inspection)
      const ins = daysUntil(v.insurance_expires)
      const lease = daysUntil(v.lease_expires)
      return (insp != null && insp <= 30) || (ins != null && ins <= 30) || (lease != null && lease <= 60)
    })
  }, [vehicles])

  function openNew() {
    setEditingVehicle(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(vehicle: Vehicle) {
    setEditingVehicle(vehicle)
    setForm({
      name: vehicle.name,
      reg_number: vehicle.reg_number,
      vehicle_type: vehicle.vehicle_type,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      mileage_km: vehicle.mileage_km,
      status: vehicle.status,
      next_inspection: vehicle.next_inspection,
      insurance_expires: vehicle.insurance_expires,
      lease_expires: vehicle.lease_expires,
      notes: vehicle.notes,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: Vehicle = {
      id: editingVehicle?.id || crypto.randomUUID(),
      name: form.name.trim(),
      reg_number: form.reg_number.trim().toUpperCase(),
      vehicle_type: form.vehicle_type,
      brand: form.brand.trim(),
      model: form.model.trim(),
      year: form.year,
      mileage_km: form.mileage_km,
      status: form.status,
      next_inspection: form.next_inspection,
      insurance_expires: form.insurance_expires,
      lease_expires: form.lease_expires,
      notes: form.notes.trim(),
    }

    let updated: Vehicle[]
    if (editingVehicle) {
      updated = vehicles.map((v) => v.id === editingVehicle.id ? item : v)
    } else {
      updated = [...vehicles, item]
    }

    setVehicles(updated)
    setDialogOpen(false)
    await saveVehicles(updated)
  }

  function openDeleteConfirmation(vehicle: Vehicle) {
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
        category="operativ"
        sectorName="Transport & Logistik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
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
          <Tabs defaultValue="fordon" className="space-y-6">
            <TabsList>
              <TabsTrigger value="fordon">Fordonsregister</TabsTrigger>
              <TabsTrigger value="varningar">
                Varningar
                {alerts.length > 0 && (
                  <Badge variant="destructive" className="ml-1.5 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                    {alerts.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="fordon" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Totalt fordon" value={String(stats.total)} />
                <KPICard label="Aktiva" value={String(stats.active)} />
                <KPICard label="I service" value={String(stats.inService)} />
                <KPICard label="Besiktning inom 30d" value={String(stats.upcomingInspections)} />
                <KPICard label="Utgången försäkring" value={String(stats.expiredInsurance)} />
              </div>

              {vehicles.length === 0 ? (
                <EmptyModuleState
                  icon={Truck}
                  title="Ingen flotta registrerad"
                  description="Lägg till fordon för att hantera besiktningar, försäkringar och leasingperioder."
                  actionLabel="Nytt fordon"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Regnr</TableHead>
                        <TableHead className="font-medium">Typ</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Mätarställning</TableHead>
                        <TableHead className="font-medium">Besiktning</TableHead>
                        <TableHead className="font-medium">Försäkring</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicles.map((v) => {
                        const inspDays = daysUntil(v.next_inspection)
                        const insDays = daysUntil(v.insurance_expires)
                        return (
                          <TableRow key={v.id}>
                            <TableCell>
                              <div className="font-medium">{v.name}</div>
                              <div className="text-xs text-muted-foreground">{v.brand} {v.model} {v.year}</div>
                            </TableCell>
                            <TableCell className="font-mono">{v.reg_number}</TableCell>
                            <TableCell><Badge variant="outline">{VEHICLE_TYPES.find((t) => t.value === v.vehicle_type)?.label || v.vehicle_type}</Badge></TableCell>
                            <TableCell><StatusBadge label={STATUS_LABELS[v.status]} variant={STATUS_VARIANTS[v.status]} /></TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(v.mileage_km)} km</TableCell>
                            <TableCell>
                              {v.next_inspection ? (
                                <span className={inspDays != null && inspDays <= 30 ? 'text-amber-600 font-medium' : ''}>
                                  {v.next_inspection}
                                  {inspDays != null && inspDays <= 30 && <span className="text-xs ml-1">({inspDays}d)</span>}
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {v.insurance_expires ? (
                                <span className={insDays != null && insDays <= 0 ? 'text-red-600 font-medium' : insDays != null && insDays <= 30 ? 'text-amber-600 font-medium' : ''}>
                                  {v.insurance_expires}
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(v)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(v)} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
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

            <TabsContent value="varningar" className="space-y-4">
              {alerts.length === 0 ? (
                <EmptyModuleState icon={Truck} title="Inga varningar" description="Alla fordon har giltiga besiktningar, försäkringar och leasingavtal." />
              ) : (
                <div className="space-y-3">
                  {alerts.map((v) => {
                    const inspDays = daysUntil(v.next_inspection)
                    const insDays = daysUntil(v.insurance_expires)
                    const leaseDays = daysUntil(v.lease_expires)
                    return (
                      <div key={v.id} className="rounded-xl border border-border bg-card px-5 py-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-sm">{v.name}</span>
                            <span className="font-mono text-xs text-muted-foreground ml-2">{v.reg_number}</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Redigera
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {inspDays != null && inspDays <= 30 && (
                            <StatusBadge label={`Besiktning: ${inspDays <= 0 ? 'Utgången' : `${inspDays} dagar kvar`}`} variant={inspDays <= 0 ? 'danger' : 'warning'} />
                          )}
                          {insDays != null && insDays <= 30 && (
                            <StatusBadge label={`Försäkring: ${insDays <= 0 ? 'Utgången' : `${insDays} dagar kvar`}`} variant={insDays <= 0 ? 'danger' : 'warning'} />
                          )}
                          {leaseDays != null && leaseDays <= 60 && (
                            <StatusBadge label={`Leasing: ${leaseDays <= 0 ? 'Utgången' : `${leaseDays} dagar kvar`}`} variant={leaseDays <= 0 ? 'danger' : 'warning'} />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVehicle ? 'Redigera fordon' : 'Nytt fordon'}</DialogTitle>
            <DialogDescription>
              {editingVehicle ? 'Uppdatera fordonets information.' : 'Registrera ett nytt fordon i flottan.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fordonsnamn *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Lastbil 1" />
              </div>
              <div className="grid gap-2">
                <Label>Regnr *</Label>
                <Input value={form.reg_number} onChange={(e) => setForm((f) => ({ ...f, reg_number: e.target.value }))} placeholder="ABC 123" />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="grid gap-2">
                <Label>Typ</Label>
                <Select value={form.vehicle_type} onValueChange={(v) => setForm((f) => ({ ...f, vehicle_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Märke</Label>
                <Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} placeholder="Volvo" />
              </div>
              <div className="grid gap-2">
                <Label>Modell</Label>
                <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="FH16" />
              </div>
              <div className="grid gap-2">
                <Label>Årsmodell</Label>
                <Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value) || new Date().getFullYear() }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Mätarställning (km)</Label>
                <Input type="number" min={0} value={form.mileage_km || ''} onChange={(e) => setForm((f) => ({ ...f, mileage_km: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as VehicleStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktiv</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="inactive">Inaktiv</SelectItem>
                    <SelectItem value="sold">Såld</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Nästa besiktning</Label>
                <Input type="date" value={form.next_inspection} onChange={(e) => setForm((f) => ({ ...f, next_inspection: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Försäkring utgår</Label>
                <Input type="date" value={form.insurance_expires} onChange={(e) => setForm((f) => ({ ...f, insurance_expires: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Leasing utgår</Label>
                <Input type="date" value={form.lease_expires} onChange={(e) => setForm((f) => ({ ...f, lease_expires: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Valfria anteckningar..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.reg_number.trim()}>
              {editingVehicle ? 'Uppdatera' : 'Lägg till'}
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
              <span className="font-semibold">{vehicleToDelete?.name}</span> ({vehicleToDelete?.reg_number})?
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
