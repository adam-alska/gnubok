'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Calendar } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type OrderStatus = 'Planerad' | 'Pågående' | 'Klar' | 'Försenad'

interface ProductionOrder {
  id: string
  orderNumber: string
  product: string
  quantity: number
  machine: string
  startDate: string
  endDate: string
  status: OrderStatus
  notes: string
}

const STATUS_VARIANTS: Record<OrderStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  'Planerad': 'info',
  'Pågående': 'warning',
  'Klar': 'success',
  'Försenad': 'danger',
}

const ORDER_STATUSES: OrderStatus[] = ['Planerad', 'Pågående', 'Klar', 'Försenad']

const EMPTY_FORM = {
  orderNumber: '',
  product: '',
  quantity: 0,
  machine: '',
  startDate: '',
  endDate: '',
  status: 'Planerad' as OrderStatus,
  notes: '',
}

export function ProduktionsplaneringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [orders, setOrders] = useState<ProductionOrder[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<ProductionOrder | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<ProductionOrder | null>(null)
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all')

  const saveOrders = useCallback(async (newOrders: ProductionOrder[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'production_orders', config_value: newOrders },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'production_orders').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setOrders(data.config_value as ProductionOrder[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredOrders = filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus)

  function openNew() {
    setEditingOrder(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(order: ProductionOrder) {
    setEditingOrder(order)
    setForm({ orderNumber: order.orderNumber, product: order.product, quantity: order.quantity, machine: order.machine, startDate: order.startDate, endDate: order.endDate, status: order.status, notes: order.notes })
    setDialogOpen(true)
  }

  async function handleSave() {
    const newOrder: ProductionOrder = {
      id: editingOrder?.id ?? crypto.randomUUID(),
      ...form,
      orderNumber: form.orderNumber.trim(),
      product: form.product.trim(),
      machine: form.machine.trim(),
      notes: form.notes.trim(),
    }
    const updated = editingOrder ? orders.map(o => o.id === editingOrder.id ? newOrder : o) : [...orders, newOrder]
    setOrders(updated)
    setDialogOpen(false)
    await saveOrders(updated)
  }

  async function handleDelete() {
    if (!orderToDelete) return
    const updated = orders.filter(o => o.id !== orderToDelete.id)
    setOrders(updated)
    setDeleteDialogOpen(false)
    setOrderToDelete(null)
    await saveOrders(updated)
  }

  async function handleStatusChange(orderId: string, newStatus: OrderStatus) {
    const updated = orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o)
    setOrders(updated)
    await saveOrders(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="operativ" sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny order</Button>}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Select value={filterStatus} onValueChange={val => setFilterStatus(val as OrderStatus | 'all')}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>

            {filteredOrders.length === 0 ? (
              <EmptyModuleState icon={Calendar} title="Inga produktionsordrar" description="Skapa produktionsordrar för att planera tillverkning, tilldela maskiner och följa status." actionLabel="Ny order" onAction={openNew} />
            ) : (
              <div className="space-y-3">
                {filteredOrders.sort((a, b) => a.startDate.localeCompare(b.startDate)).map(order => (
                  <div key={order.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
                        <span className="font-medium text-sm">{order.product}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{order.quantity} st</span>
                        <span>{order.machine}</span>
                        <span>{order.startDate} - {order.endDate}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge label={order.status} variant={STATUS_VARIANTS[order.status]} />
                      {order.status === 'Planerad' && <Button variant="outline" size="sm" onClick={() => handleStatusChange(order.id, 'Pågående')}>Starta</Button>}
                      {order.status === 'Pågående' && <Button variant="outline" size="sm" onClick={() => handleStatusChange(order.id, 'Klar')}>Klar</Button>}
                      <Button variant="ghost" size="icon" onClick={() => openEdit(order)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setOrderToDelete(order); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'Redigera produktionsorder' : 'Ny produktionsorder'}</DialogTitle>
            <DialogDescription>{editingOrder ? 'Uppdatera orderuppgifterna.' : 'Fyll i uppgifter för den nya produktionsordern.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Ordernummer *</Label><Input value={form.orderNumber} onChange={e => setForm(f => ({ ...f, orderNumber: e.target.value }))} placeholder="PO-001" /></div>
              <div className="grid gap-2"><Label>Produkt *</Label><Input value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} placeholder="Produkt A" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Antal</Label><Input type="number" min={0} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Maskin</Label><Input value={form.machine} onChange={e => setForm(f => ({ ...f, machine: e.target.value }))} placeholder="CNC-1" /></div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as OrderStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Startdatum</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Slutdatum</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Särskilda krav, prioritet, etc." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.orderNumber.trim() || !form.product.trim()}>{editingOrder ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort order</DialogTitle><DialogDescription>Är du säker på att du vill ta bort order <span className="font-semibold">{orderToDelete?.orderNumber}</span>?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
