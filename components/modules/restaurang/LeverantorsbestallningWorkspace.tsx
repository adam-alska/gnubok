'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  Package,
  Truck,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ShoppingCart,
  Building2,
} from 'lucide-react'

// --- Types ---

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Supplier {
  id: string
  name: string
  contact_email: string
  contact_phone: string
  delivery_days: string[]
  min_order: number
  notes: string
}

interface SupplierOrder {
  id: string
  supplier_id: string
  order_date: string
  delivery_date: string
  status: string
  total_amount: number
  notes: string
  suppliers?: { name: string }
}

interface SupplierOrderItem {
  id: string
  supplier_order_id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
}

// --- Constants ---

const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Utkast',
  sent: 'Skickad',
  confirmed: 'Bekräftad',
  delivered: 'Levererad',
  cancelled: 'Avbruten',
}

const ORDER_STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  draft: 'neutral',
  sent: 'info',
  confirmed: 'warning',
  delivered: 'success',
  cancelled: 'danger',
}

const STATUS_FLOW: Record<string, string> = {
  draft: 'sent',
  sent: 'confirmed',
  confirmed: 'delivered',
}

const STATUS_FLOW_LABELS: Record<string, string> = {
  draft: 'Skicka',
  sent: 'Bekräfta',
  confirmed: 'Markera levererad',
}

const DELIVERY_DAYS = [
  { value: 'mon', label: 'Mån' },
  { value: 'tue', label: 'Tis' },
  { value: 'wed', label: 'Ons' },
  { value: 'thu', label: 'Tor' },
  { value: 'fri', label: 'Fre' },
  { value: 'sat', label: 'Lör' },
  { value: 'sun', label: 'Sön' },
]

function formatSEK(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDateSv(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('sv-SE')
}

// --- Component ---

export function LeverantorsbestallningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = useMemo(() => createClient(), [])

  // State
  const [activeTab, setActiveTab] = useState('bestallningar')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orders, setOrders] = useState<SupplierOrder[]>([])
  const [loading, setLoading] = useState(true)

  // Order dialog
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [orderForm, setOrderForm] = useState({
    supplier_id: '',
    delivery_date: '',
    notes: '',
  })

  // Order items dialog
  const [itemsDialogOpen, setItemsDialogOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<SupplierOrder | null>(null)
  const [orderItems, setOrderItems] = useState<SupplierOrderItem[]>([])
  const [itemForm, setItemForm] = useState({
    description: '',
    quantity: 1,
    unit: 'st',
    unit_price: 0,
  })

  // Supplier dialog
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contact_email: '',
    contact_phone: '',
    delivery_days: [] as string[],
    min_order: 0,
    notes: '',
  })

  // Data fetching
  const fetchSuppliers = useCallback(async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .order('name')
    if (data) setSuppliers(data)
  }, [supabase])

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('supplier_orders')
      .select('*, suppliers(name)')
      .order('order_date', { ascending: false })
    if (data) setOrders(data)
  }, [supabase])

  const fetchOrderItems = useCallback(
    async (orderId: string) => {
      const { data } = await supabase
        .from('supplier_order_items')
        .select('*')
        .eq('supplier_order_id', orderId)
        .order('id')
      if (data) setOrderItems(data)
    },
    [supabase]
  )

  useEffect(() => {
    async function load() {
      setLoading(true)
      await Promise.all([fetchSuppliers(), fetchOrders()])
      setLoading(false)
    }
    load()
  }, [fetchSuppliers, fetchOrders])

  // Order CRUD
  function openNewOrder() {
    setOrderForm({
      supplier_id: suppliers.length > 0 ? suppliers[0].id : '',
      delivery_date: '',
      notes: '',
    })
    setOrderDialogOpen(true)
  }

  async function createOrder() {
    const { data } = await supabase
      .from('supplier_orders')
      .insert({
        supplier_id: orderForm.supplier_id,
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: orderForm.delivery_date || null,
        status: 'draft',
        total_amount: 0,
        notes: orderForm.notes,
      })
      .select('*, suppliers(name)')
      .single()

    setOrderDialogOpen(false)

    if (data) {
      setSelectedOrder(data)
      setOrderItems([])
      setItemForm({ description: '', quantity: 1, unit: 'st', unit_price: 0 })
      setItemsDialogOpen(true)
    }

    fetchOrders()
  }

  async function advanceStatus(order: SupplierOrder) {
    const nextStatus = STATUS_FLOW[order.status]
    if (!nextStatus) return

    await supabase
      .from('supplier_orders')
      .update({ status: nextStatus })
      .eq('id', order.id)

    fetchOrders()
  }

  async function cancelOrder(orderId: string) {
    await supabase
      .from('supplier_orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
    fetchOrders()
  }

  // Order items
  function openOrderItems(order: SupplierOrder) {
    setSelectedOrder(order)
    setItemForm({ description: '', quantity: 1, unit: 'st', unit_price: 0 })
    fetchOrderItems(order.id)
    setItemsDialogOpen(true)
  }

  async function addItem() {
    if (!selectedOrder) return
    const lineTotal = itemForm.quantity * itemForm.unit_price

    await supabase.from('supplier_order_items').insert({
      supplier_order_id: selectedOrder.id,
      description: itemForm.description,
      quantity: itemForm.quantity,
      unit: itemForm.unit,
      unit_price: itemForm.unit_price,
      line_total: lineTotal,
    })

    setItemForm({ description: '', quantity: 1, unit: 'st', unit_price: 0 })
    await fetchOrderItems(selectedOrder.id)
    await updateOrderTotal(selectedOrder.id)
  }

  async function removeItem(itemId: string) {
    if (!selectedOrder) return
    await supabase.from('supplier_order_items').delete().eq('id', itemId)
    await fetchOrderItems(selectedOrder.id)
    await updateOrderTotal(selectedOrder.id)
  }

  async function updateOrderTotal(orderId: string) {
    const { data } = await supabase
      .from('supplier_order_items')
      .select('line_total')
      .eq('supplier_order_id', orderId)

    const total = (data || []).reduce((sum, item) => sum + (item.line_total || 0), 0)

    await supabase
      .from('supplier_orders')
      .update({ total_amount: total })
      .eq('id', orderId)

    fetchOrders()
  }

  // Supplier CRUD
  function openNewSupplier() {
    setEditingSupplier(null)
    setSupplierForm({
      name: '',
      contact_email: '',
      contact_phone: '',
      delivery_days: [],
      min_order: 0,
      notes: '',
    })
    setSupplierDialogOpen(true)
  }

  function openEditSupplier(supplier: Supplier) {
    setEditingSupplier(supplier)
    setSupplierForm({
      name: supplier.name,
      contact_email: supplier.contact_email || '',
      contact_phone: supplier.contact_phone || '',
      delivery_days: supplier.delivery_days || [],
      min_order: supplier.min_order || 0,
      notes: supplier.notes || '',
    })
    setSupplierDialogOpen(true)
  }

  async function saveSupplier() {
    const payload = {
      name: supplierForm.name,
      contact_email: supplierForm.contact_email,
      contact_phone: supplierForm.contact_phone,
      delivery_days: supplierForm.delivery_days,
      min_order: supplierForm.min_order,
      notes: supplierForm.notes,
    }
    if (editingSupplier) {
      await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id)
    } else {
      await supabase.from('suppliers').insert(payload)
    }
    setSupplierDialogOpen(false)
    fetchSuppliers()
  }

  async function deleteSupplier(id: string) {
    await supabase.from('suppliers').delete().eq('id', id)
    fetchSuppliers()
  }

  function toggleDeliveryDay(day: string) {
    setSupplierForm((f) => ({
      ...f,
      delivery_days: f.delivery_days.includes(day)
        ? f.delivery_days.filter((d) => d !== day)
        : [...f.delivery_days, day],
    }))
  }

  // Helpers
  function getSupplierName(order: SupplierOrder): string {
    if (order.suppliers?.name) return order.suppliers.name
    const s = suppliers.find((sup) => sup.id === order.supplier_id)
    return s?.name || 'Okänd leverantör'
  }

  const itemsTotal = useMemo(
    () => orderItems.reduce((sum, item) => sum + (item.line_total || 0), 0),
    [orderItems]
  )

  // --- Render ---

  const tabsContent = (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="bestallningar">
          <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
          Beställningar
        </TabsTrigger>
        <TabsTrigger value="leverantorer">
          <Building2 className="mr-1.5 h-3.5 w-3.5" />
          Leverantörer
        </TabsTrigger>
      </TabsList>

      {/* ===== BESTÄLLNINGAR ===== */}
      <TabsContent value="bestallningar" className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Laddar beställningar...
          </div>
        ) : orders.length === 0 ? (
          <EmptyModuleState
            icon={Package}
            title="Inga beställningar"
            description="Skapa din första leverantörsbeställning för att komma igång."
            actionLabel="Ny beställning"
            onAction={openNewOrder}
          />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-medium">Leverantör</th>
                  <th className="px-4 py-2.5 text-left font-medium">Orderdatum</th>
                  <th className="px-4 py-2.5 text-left font-medium">Leveransdatum</th>
                  <th className="px-4 py-2.5 text-center font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Belopp</th>
                  <th className="px-4 py-2.5 text-right font-medium">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">
                      {getSupplierName(order)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDateSv(order.order_date)}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {order.delivery_date ? formatDateSv(order.delivery_date) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <StatusBadge
                        label={ORDER_STATUS_LABELS[order.status] || order.status}
                        variant={ORDER_STATUS_VARIANTS[order.status] || 'neutral'}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {formatSEK(order.total_amount || 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openOrderItems(order)}
                        >
                          <Package className="mr-1 h-3 w-3" />
                          Artiklar
                        </Button>
                        {STATUS_FLOW[order.status] && order.status !== 'cancelled' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => advanceStatus(order)}
                          >
                            {STATUS_FLOW_LABELS[order.status]}
                            <ChevronRight className="ml-1 h-3 w-3" />
                          </Button>
                        )}
                        {order.status !== 'cancelled' && order.status !== 'delivered' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => cancelOrder(order.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      {/* ===== LEVERANTÖRER ===== */}
      <TabsContent value="leverantorer" className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Hantera leverantörer och deras leveransinformation.
          </p>
          <Button size="sm" onClick={openNewSupplier}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Ny leverantör
          </Button>
        </div>

        {suppliers.length === 0 ? (
          <EmptyModuleState
            icon={Truck}
            title="Inga leverantörer"
            description="Lägg till din första leverantör för att kunna skapa beställningar."
            actionLabel="Lägg till leverantör"
            onAction={openNewSupplier}
          />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-medium">Namn</th>
                  <th className="px-4 py-2.5 text-left font-medium">E-post</th>
                  <th className="px-4 py-2.5 text-left font-medium">Telefon</th>
                  <th className="px-4 py-2.5 text-left font-medium">Leveransdagar</th>
                  <th className="px-4 py-2.5 text-right font-medium">Minimiorder</th>
                  <th className="px-4 py-2.5 text-right font-medium">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{supplier.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {supplier.contact_email || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {supplier.contact_phone || '-'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(supplier.delivery_days || []).length > 0
                          ? supplier.delivery_days.map((day) => {
                              const label = DELIVERY_DAYS.find((d) => d.value === day)?.label || day
                              return (
                                <Badge key={day} variant="secondary" className="text-xs">
                                  {label}
                                </Badge>
                              )
                            })
                          : <span className="text-muted-foreground">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {supplier.min_order ? formatSEK(supplier.min_order) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditSupplier(supplier)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => deleteSupplier(supplier.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName={sectorSlug}
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button size="sm" onClick={openNewOrder}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Ny beställning
          </Button>
        }
        tabs={tabsContent}
      >
        {tabsContent}
      </ModuleWorkspaceShell>

      {/* ===== CREATE ORDER DIALOG ===== */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny beställning</DialogTitle>
            <DialogDescription>
              Skapa en ny leverantörsbeställning. Du kan lägga till artiklar efter att ordern skapats.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Leverantör</Label>
              <Select
                value={orderForm.supplier_id}
                onValueChange={(v) => setOrderForm((f) => ({ ...f, supplier_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj leverantör" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Önskat leveransdatum</Label>
              <Input
                type="date"
                value={orderForm.delivery_date}
                onChange={(e) => setOrderForm((f) => ({ ...f, delivery_date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Anteckningar</Label>
              <Input
                value={orderForm.notes}
                onChange={(e) => setOrderForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Valfria anteckningar..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={createOrder} disabled={!orderForm.supplier_id}>
              Skapa beställning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== ORDER ITEMS DIALOG ===== */}
      <Dialog open={itemsDialogOpen} onOpenChange={setItemsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Orderartiklar {selectedOrder && `- ${getSupplierName(selectedOrder)}`}
            </DialogTitle>
            <DialogDescription>
              Hantera artiklar i beställningen.
            </DialogDescription>
          </DialogHeader>

          {/* Add item form */}
          {selectedOrder && selectedOrder.status === 'draft' && (
            <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Lägg till artikel
              </p>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">Beskrivning</Label>
                  <Input
                    value={itemForm.description}
                    onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Artikel..."
                    className="h-8 text-sm"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Antal</Label>
                  <Input
                    type="number"
                    value={itemForm.quantity}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))
                    }
                    className="h-8 text-sm"
                    min={0}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Enhet</Label>
                  <Input
                    value={itemForm.unit}
                    onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="st"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Pris/enhet</Label>
                  <Input
                    type="number"
                    value={itemForm.unit_price || ''}
                    onChange={(e) =>
                      setItemForm((f) => ({
                        ...f,
                        unit_price: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="h-8 text-sm"
                    min={0}
                  />
                </div>
                <div className="col-span-2">
                  <Button
                    size="sm"
                    className="h-8 w-full"
                    onClick={addItem}
                    disabled={!itemForm.description.trim() || itemForm.quantity <= 0}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Lägg till
                  </Button>
                </div>
              </div>
              {itemForm.quantity > 0 && itemForm.unit_price > 0 && (
                <p className="text-xs text-muted-foreground">
                  Radtotal: {formatSEK(itemForm.quantity * itemForm.unit_price)}
                </p>
              )}
            </div>
          )}

          {/* Items list */}
          {orderItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Inga artiklar tillagda ännu.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Beskrivning</th>
                    <th className="px-3 py-2 text-right font-medium">Antal</th>
                    <th className="px-3 py-2 text-left font-medium">Enhet</th>
                    <th className="px-3 py-2 text-right font-medium">Pris/enhet</th>
                    <th className="px-3 py-2 text-right font-medium">Radtotal</th>
                    {selectedOrder?.status === 'draft' && (
                      <th className="px-3 py-2 w-10" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item) => (
                    <tr key={item.id} className="border-b last:border-b-0">
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2">{item.unit}</td>
                      <td className="px-3 py-2 text-right">{formatSEK(item.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatSEK(item.line_total)}
                      </td>
                      {selectedOrder?.status === 'draft' && (
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30">
                    <td
                      colSpan={selectedOrder?.status === 'draft' ? 4 : 4}
                      className="px-3 py-2 text-right font-medium"
                    >
                      Totalt:
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatSEK(itemsTotal)}
                    </td>
                    {selectedOrder?.status === 'draft' && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemsDialogOpen(false)}>
              Stäng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== SUPPLIER DIALOG ===== */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSupplier ? 'Redigera leverantör' : 'Ny leverantör'}
            </DialogTitle>
            <DialogDescription>
              {editingSupplier
                ? 'Uppdatera leverantörens information nedan.'
                : 'Fyll i uppgifter för den nya leverantören.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Namn</Label>
              <Input
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Leverantörsnamn"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-post</Label>
                <Input
                  type="email"
                  value={supplierForm.contact_email}
                  onChange={(e) =>
                    setSupplierForm((f) => ({ ...f, contact_email: e.target.value }))
                  }
                  placeholder="kontakt@leverantor.se"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input
                  value={supplierForm.contact_phone}
                  onChange={(e) =>
                    setSupplierForm((f) => ({ ...f, contact_phone: e.target.value }))
                  }
                  placeholder="08-123 456"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Leveransdagar</Label>
              <div className="flex flex-wrap gap-3">
                {DELIVERY_DAYS.map((day) => (
                  <label
                    key={day.value}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    <Checkbox
                      checked={supplierForm.delivery_days.includes(day.value)}
                      onCheckedChange={() => toggleDeliveryDay(day.value)}
                    />
                    <span className="text-sm">{day.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Minimibeställning (kr)</Label>
              <Input
                type="number"
                value={supplierForm.min_order || ''}
                onChange={(e) =>
                  setSupplierForm((f) => ({
                    ...f,
                    min_order: parseFloat(e.target.value) || 0,
                  }))
                }
                placeholder="0"
              />
            </div>

            <div className="space-y-2">
              <Label>Anteckningar</Label>
              <Input
                value={supplierForm.notes}
                onChange={(e) => setSupplierForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Valfria anteckningar..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={saveSupplier} disabled={!supplierForm.name.trim()}>
              {editingSupplier ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
