'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { KPICard } from '@/components/modules/shared/KPICard'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
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
  Package,
  Search,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type DeliveryStatus = 'pending' | 'in_transit' | 'delivered' | 'failed' | 'returned'

interface Delivery {
  id: string
  tracking_number: string
  customer_name: string
  customer_phone: string
  delivery_address: string
  city: string
  date: string
  eta: string
  actual_delivery_time: string
  status: DeliveryStatus
  driver: string
  vehicle_reg: string
  proof_of_delivery: string
  notification_sent: boolean
  notes: string
}

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'Väntar',
  in_transit: 'Under transport',
  delivered: 'Levererad',
  failed: 'Misslyckad',
  returned: 'Returnerad',
}

const STATUS_VARIANTS: Record<DeliveryStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'neutral',
  in_transit: 'info',
  delivered: 'success',
  failed: 'danger',
  returned: 'warning',
}

const EMPTY_FORM = {
  tracking_number: '',
  customer_name: '',
  customer_phone: '',
  delivery_address: '',
  city: '',
  date: '',
  eta: '',
  actual_delivery_time: '',
  status: 'pending' as DeliveryStatus,
  driver: '',
  vehicle_reg: '',
  proof_of_delivery: '',
  notification_sent: false,
  notes: '',
}

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function LeveranssparningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)
  const [searchQuery, setSearchQuery] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deliveryToDelete, setDeliveryToDelete] = useState<Delivery | null>(null)

  const saveDeliveries = useCallback(async (items: Delivery[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'deliveries',
        config_value: items,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchDeliveries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'deliveries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setDeliveries(data.config_value as Delivery[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchDeliveries() }, [fetchDeliveries])

  const filtered = useMemo(() => {
    let result = deliveries.filter((d) => d.date >= from && d.date <= to)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((d) =>
        d.tracking_number.toLowerCase().includes(q) ||
        d.customer_name.toLowerCase().includes(q) ||
        d.delivery_address.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [deliveries, from, to, searchQuery])

  const stats = useMemo(() => {
    const total = filtered.length
    const delivered = filtered.filter((d) => d.status === 'delivered').length
    const failed = filtered.filter((d) => d.status === 'failed').length
    const inTransit = filtered.filter((d) => d.status === 'in_transit').length
    const deliveryRate = total > 0 ? (delivered / total) * 100 : 0
    return { total, delivered, failed, inTransit, deliveryRate }
  }, [filtered])

  function openNew() {
    setEditingDelivery(null)
    setForm({ ...EMPTY_FORM, date: todayStr(), tracking_number: `TRK-${Date.now().toString(36).toUpperCase()}` })
    setDialogOpen(true)
  }

  function openEdit(delivery: Delivery) {
    setEditingDelivery(delivery)
    setForm({
      tracking_number: delivery.tracking_number,
      customer_name: delivery.customer_name,
      customer_phone: delivery.customer_phone,
      delivery_address: delivery.delivery_address,
      city: delivery.city,
      date: delivery.date,
      eta: delivery.eta,
      actual_delivery_time: delivery.actual_delivery_time,
      status: delivery.status,
      driver: delivery.driver,
      vehicle_reg: delivery.vehicle_reg,
      proof_of_delivery: delivery.proof_of_delivery,
      notification_sent: delivery.notification_sent,
      notes: delivery.notes,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: Delivery = {
      id: editingDelivery?.id || crypto.randomUUID(),
      tracking_number: form.tracking_number.trim(),
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      delivery_address: form.delivery_address.trim(),
      city: form.city.trim(),
      date: form.date,
      eta: form.eta,
      actual_delivery_time: form.actual_delivery_time,
      status: form.status,
      driver: form.driver.trim(),
      vehicle_reg: form.vehicle_reg.trim().toUpperCase(),
      proof_of_delivery: form.proof_of_delivery.trim(),
      notification_sent: form.notification_sent,
      notes: form.notes.trim(),
    }

    let updated: Delivery[]
    if (editingDelivery) {
      updated = deliveries.map((d) => d.id === editingDelivery.id ? item : d)
    } else {
      updated = [...deliveries, item]
    }

    setDeliveries(updated)
    setDialogOpen(false)
    await saveDeliveries(updated)
  }

  function openDeleteConfirmation(delivery: Delivery) {
    setDeliveryToDelete(delivery)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!deliveryToDelete) return
    const updated = deliveries.filter((d) => d.id !== deliveryToDelete.id)
    setDeliveries(updated)
    setDeleteDialogOpen(false)
    setDeliveryToDelete(null)
    await saveDeliveries(updated)
  }

  async function updateStatus(deliveryId: string, newStatus: DeliveryStatus) {
    const now = todayStr()
    const updated = deliveries.map((d) =>
      d.id === deliveryId
        ? { ...d, status: newStatus, actual_delivery_time: newStatus === 'delivered' ? new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : d.actual_delivery_time }
        : d
    )
    setDeliveries(updated)
    await saveDeliveries(updated)
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
            Ny leverans
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
              <KPICard label="Totalt leveranser" value={String(stats.total)} />
              <KPICard label="Levererade" value={String(stats.delivered)} />
              <KPICard label="Under transport" value={String(stats.inTransit)} />
              <KPICard label="Misslyckade" value={String(stats.failed)} />
              <KPICard label="Leveransgrad" value={stats.deliveryRate.toFixed(1)} unit="%" trend={stats.deliveryRate >= 95 ? 'up' : stats.deliveryRate < 85 ? 'down' : 'neutral'} />
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök spårningsnr, kund, adress..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            </div>

            {filtered.length === 0 ? (
              <EmptyModuleState
                icon={Package}
                title="Inga leveranser"
                description="Spåra leveranser med ETA, leveransbevis och kundnotifieringslogg."
                actionLabel="Ny leverans"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Spårning</TableHead>
                      <TableHead className="font-medium">Kund</TableHead>
                      <TableHead className="font-medium">Adress</TableHead>
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">ETA</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono text-xs">{d.tracking_number}</TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{d.customer_name}</div>
                          {d.customer_phone && <div className="text-xs text-muted-foreground">{d.customer_phone}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{d.delivery_address}</div>
                          {d.city && <div className="text-xs text-muted-foreground">{d.city}</div>}
                        </TableCell>
                        <TableCell>{d.date}</TableCell>
                        <TableCell>{d.eta || '-'}</TableCell>
                        <TableCell>
                          <StatusBadge label={STATUS_LABELS[d.status]} variant={STATUS_VARIANTS[d.status]} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {d.status === 'pending' && (
                              <Button variant="outline" size="sm" onClick={() => updateStatus(d.id, 'in_transit')}>Skicka</Button>
                            )}
                            {d.status === 'in_transit' && (
                              <Button variant="outline" size="sm" onClick={() => updateStatus(d.id, 'delivered')}>Levererad</Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(d)}><Trash2 className="h-4 w-4" /></Button>
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
            <DialogTitle>{editingDelivery ? 'Redigera leverans' : 'Ny leverans'}</DialogTitle>
            <DialogDescription>
              {editingDelivery ? 'Uppdatera leveransinformationen.' : 'Registrera en ny leverans för spårning.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Spårningsnummer *</Label>
                <Input value={form.tracking_number} onChange={(e) => setForm((f) => ({ ...f, tracking_number: e.target.value }))} placeholder="TRK-ABC123" />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as DeliveryStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Väntar</SelectItem>
                    <SelectItem value="in_transit">Under transport</SelectItem>
                    <SelectItem value="delivered">Levererad</SelectItem>
                    <SelectItem value="failed">Misslyckad</SelectItem>
                    <SelectItem value="returned">Returnerad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kundnamn *</Label>
                <Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} placeholder="Anna Andersson" />
              </div>
              <div className="grid gap-2">
                <Label>Telefon</Label>
                <Input value={form.customer_phone} onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))} placeholder="070-123 45 67" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Leveransadress *</Label>
                <Input value={form.delivery_address} onChange={(e) => setForm((f) => ({ ...f, delivery_address: e.target.value }))} placeholder="Storgatan 1" />
              </div>
              <div className="grid gap-2">
                <Label>Stad</Label>
                <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Stockholm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Datum *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>ETA</Label>
                <Input type="time" value={form.eta} onChange={(e) => setForm((f) => ({ ...f, eta: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Faktisk leveranstid</Label>
                <Input type="time" value={form.actual_delivery_time} onChange={(e) => setForm((f) => ({ ...f, actual_delivery_time: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Förare</Label>
                <Input value={form.driver} onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Fordon (regnr)</Label>
                <Input value={form.vehicle_reg} onChange={(e) => setForm((f) => ({ ...f, vehicle_reg: e.target.value }))} placeholder="ABC 123" />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Leveransbevis, särskilda instruktioner..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.tracking_number.trim() || !form.customer_name.trim() || !form.delivery_address.trim() || !form.date}>
              {editingDelivery ? 'Uppdatera' : 'Skapa leverans'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort leverans</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort leverans <span className="font-mono font-semibold">{deliveryToDelete?.tracking_number}</span>?
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
