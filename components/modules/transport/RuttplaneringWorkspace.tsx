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
  MapPin,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type RouteStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'

interface RouteStop {
  address: string
  city: string
  estimated_time: string
  capacity_kg: number
}

interface Route {
  id: string
  name: string
  date: string
  driver: string
  vehicle_reg: string
  status: RouteStatus
  stops: RouteStop[]
  total_distance_km: number
  estimated_duration_hours: number
  total_capacity_kg: number
  notes: string
}

const STATUS_LABELS: Record<RouteStatus, string> = {
  planned: 'Planerad',
  in_progress: 'Pågående',
  completed: 'Slutförd',
  cancelled: 'Avbruten',
}

const STATUS_VARIANTS: Record<RouteStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  planned: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
}

const EMPTY_FORM = {
  name: '',
  date: '',
  driver: '',
  vehicle_reg: '',
  status: 'planned' as RouteStatus,
  total_distance_km: 0,
  estimated_duration_hours: 0,
  total_capacity_kg: 0,
  notes: '',
  stops_text: '',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function parseStops(text: string): RouteStop[] {
  if (!text.trim()) return []
  return text.split('\n').filter(l => l.trim()).map((line) => {
    const parts = line.split(';').map(p => p.trim())
    return {
      address: parts[0] || '',
      city: parts[1] || '',
      estimated_time: parts[2] || '',
      capacity_kg: parseFloat(parts[3]) || 0,
    }
  })
}

function stopsToText(stops: RouteStop[]): string {
  return stops.map(s => `${s.address};${s.city};${s.estimated_time};${s.capacity_kg}`).join('\n')
}

export function RuttplaneringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [routes, setRoutes] = useState<Route[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<Route | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null)

  const saveRoutes = useCallback(async (items: Route[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'routes',
        config_value: items,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchRoutes = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'routes')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setRoutes(data.config_value as Route[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchRoutes() }, [fetchRoutes])

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const todayRoutes = routes.filter((r) => r.date === today)
    const planned = routes.filter((r) => r.status === 'planned').length
    const inProgress = routes.filter((r) => r.status === 'in_progress').length
    const totalStops = routes.reduce((s, r) => s + r.stops.length, 0)
    const totalKm = routes.reduce((s, r) => s + r.total_distance_km, 0)
    return { todayCount: todayRoutes.length, planned, inProgress, totalStops, totalKm }
  }, [routes])

  function openNew() {
    setEditingRoute(null)
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] })
    setDialogOpen(true)
  }

  function openEdit(route: Route) {
    setEditingRoute(route)
    setForm({
      name: route.name,
      date: route.date,
      driver: route.driver,
      vehicle_reg: route.vehicle_reg,
      status: route.status,
      total_distance_km: route.total_distance_km,
      estimated_duration_hours: route.estimated_duration_hours,
      total_capacity_kg: route.total_capacity_kg,
      notes: route.notes,
      stops_text: stopsToText(route.stops),
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: Route = {
      id: editingRoute?.id || crypto.randomUUID(),
      name: form.name.trim(),
      date: form.date,
      driver: form.driver.trim(),
      vehicle_reg: form.vehicle_reg.trim().toUpperCase(),
      status: form.status,
      stops: parseStops(form.stops_text),
      total_distance_km: form.total_distance_km,
      estimated_duration_hours: form.estimated_duration_hours,
      total_capacity_kg: form.total_capacity_kg,
      notes: form.notes.trim(),
    }

    let updated: Route[]
    if (editingRoute) {
      updated = routes.map((r) => r.id === editingRoute.id ? item : r)
    } else {
      updated = [...routes, item]
    }

    setRoutes(updated)
    setDialogOpen(false)
    await saveRoutes(updated)
  }

  function openDeleteConfirmation(route: Route) {
    setRouteToDelete(route)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!routeToDelete) return
    const updated = routes.filter((r) => r.id !== routeToDelete.id)
    setRoutes(updated)
    setDeleteDialogOpen(false)
    setRouteToDelete(null)
    await saveRoutes(updated)
  }

  async function updateStatus(routeId: string, newStatus: RouteStatus) {
    const updated = routes.map((r) => r.id === routeId ? { ...r, status: newStatus } : r)
    setRoutes(updated)
    await saveRoutes(updated)
  }

  const sortedRoutes = useMemo(() => {
    return [...routes].sort((a, b) => b.date.localeCompare(a.date))
  }, [routes])

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
            Ny rutt
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <KPICard label="Dagens rutter" value={String(stats.todayCount)} />
              <KPICard label="Planerade" value={String(stats.planned)} />
              <KPICard label="Pågående" value={String(stats.inProgress)} />
              <KPICard label="Totalt stopp" value={String(stats.totalStops)} />
              <KPICard label="Total km" value={fmt(stats.totalKm)} unit="km" />
            </div>

            {routes.length === 0 ? (
              <EmptyModuleState
                icon={MapPin}
                title="Inga rutter planerade"
                description="Skapa rutter med adressklustring, tidsuppskattningar och kapacitetsplanering."
                actionLabel="Ny rutt"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Rutt</TableHead>
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">Förare</TableHead>
                      <TableHead className="font-medium">Fordon</TableHead>
                      <TableHead className="font-medium text-right">Stopp</TableHead>
                      <TableHead className="font-medium text-right">Km</TableHead>
                      <TableHead className="font-medium text-right">Tid (h)</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRoutes.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>{r.driver || '-'}</TableCell>
                        <TableCell className="font-mono">{r.vehicle_reg || '-'}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.stops.length}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.total_distance_km)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.estimated_duration_hours.toFixed(1)}</TableCell>
                        <TableCell>
                          <StatusBadge label={STATUS_LABELS[r.status]} variant={STATUS_VARIANTS[r.status]} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {r.status === 'planned' && (
                              <Button variant="outline" size="sm" onClick={() => updateStatus(r.id, 'in_progress')}>Starta</Button>
                            )}
                            {r.status === 'in_progress' && (
                              <Button variant="outline" size="sm" onClick={() => updateStatus(r.id, 'completed')}>Slutför</Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(r)}><Trash2 className="h-4 w-4" /></Button>
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
            <DialogTitle>{editingRoute ? 'Redigera rutt' : 'Ny rutt'}</DialogTitle>
            <DialogDescription>
              {editingRoute ? 'Uppdatera ruttens information.' : 'Planera en ny körrutt med stopp.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Ruttnamn *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Stockholm Syd" />
              </div>
              <div className="grid gap-2">
                <Label>Datum *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Förare</Label>
                <Input value={form.driver} onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value }))} placeholder="Erik Svensson" />
              </div>
              <div className="grid gap-2">
                <Label>Fordon (regnr)</Label>
                <Input value={form.vehicle_reg} onChange={(e) => setForm((f) => ({ ...f, vehicle_reg: e.target.value }))} placeholder="ABC 123" />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as RouteStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planerad</SelectItem>
                    <SelectItem value="in_progress">Pågående</SelectItem>
                    <SelectItem value="completed">Slutförd</SelectItem>
                    <SelectItem value="cancelled">Avbruten</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Avstånd (km)</Label>
                <Input type="number" min={0} value={form.total_distance_km || ''} onChange={(e) => setForm((f) => ({ ...f, total_distance_km: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Uppskattad tid (h)</Label>
                <Input type="number" min={0} step={0.5} value={form.estimated_duration_hours || ''} onChange={(e) => setForm((f) => ({ ...f, estimated_duration_hours: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Kapacitet (kg)</Label>
                <Input type="number" min={0} value={form.total_capacity_kg || ''} onChange={(e) => setForm((f) => ({ ...f, total_capacity_kg: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Stopp (adress;stad;tid;kg per rad)</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.stops_text}
                onChange={(e) => setForm((f) => ({ ...f, stops_text: e.target.value }))}
                placeholder={"Storgatan 1;Stockholm;08:00;500\nIndustrivägen 5;Södertälje;09:30;300"}
              />
            </div>

            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Valfria anteckningar..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.date}>
              {editingRoute ? 'Uppdatera' : 'Skapa rutt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort rutt</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort rutten <span className="font-semibold">{routeToDelete?.name}</span>?
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
