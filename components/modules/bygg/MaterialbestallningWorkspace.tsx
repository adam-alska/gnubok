'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
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
  Search,
  ShoppingCart,
  Truck,
  CheckCircle2,
  Clock,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type OrderStatus = 'Planerad' | 'Beställd' | 'Levererad delvis' | 'Levererad' | 'Avbruten'

interface MaterialOrderLine {
  id: string
  material: string
  quantity: number
  unit: string
  unitPrice: number
  delivered: number
}

interface MaterialOrder {
  id: string
  orderNumber: string
  project: string
  supplier: string
  status: OrderStatus
  orderDate: string
  expectedDelivery: string
  actualDelivery: string
  lines: MaterialOrderLine[]
  totalAmount: number
  notes: string
}

const EMPTY_LINE: Omit<MaterialOrderLine, 'id'> = {
  material: '',
  quantity: 0,
  unit: 'st',
  unitPrice: 0,
  delivered: 0,
}

const EMPTY_FORM = {
  orderNumber: '',
  project: '',
  supplier: '',
  status: 'Planerad' as OrderStatus,
  orderDate: new Date().toISOString().slice(0, 10),
  expectedDelivery: '',
  actualDelivery: '',
  notes: '',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  'Planerad': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Beställd': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Levererad delvis': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  'Levererad': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Avbruten': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const UNITS = ['st', 'kg', 'm', 'm2', 'm3', 'liter', 'ton', 'pall', 'paket', 'rulle']

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function MaterialbestallningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [orders, setOrders] = useState<MaterialOrder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<MaterialOrder | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [lines, setLines] = useState<MaterialOrderLine[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<MaterialOrder | null>(null)

  const saveOrders = useCallback(async (items: MaterialOrder[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'material_orders', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug).eq('config_key', 'material_orders')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setOrders(data.config_value as MaterialOrder[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    let result = orders
    if (filterStatus !== 'all') result = result.filter((o) => o.status === filterStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.project.toLowerCase().includes(q) ||
        o.supplier.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.orderDate.localeCompare(a.orderDate))
  }, [orders, filterStatus, searchQuery])

  const stats = useMemo(() => {
    const totalValue = orders.reduce((s, o) => s + o.totalAmount, 0)
    const activeOrders = orders.filter(o => o.status === 'Beställd' || o.status === 'Levererad delvis').length
    const pendingDeliveries = orders.filter(o => o.status === 'Beställd').length
    const delivered = orders.filter(o => o.status === 'Levererad').length
    return { totalValue, activeOrders, pendingDeliveries, delivered }
  }, [orders])

  function addLine() {
    setLines(prev => [...prev, { id: generateId(), ...EMPTY_LINE }])
  }

  function updateLine(id: string, field: string, value: string | number) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  function removeLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id))
  }

  function openNew() {
    setEditingOrder(null)
    setForm({ ...EMPTY_FORM })
    setLines([{ id: generateId(), ...EMPTY_LINE }])
    setDialogOpen(true)
  }

  function openEdit(o: MaterialOrder) {
    setEditingOrder(o)
    setForm({
      orderNumber: o.orderNumber,
      project: o.project,
      supplier: o.supplier,
      status: o.status,
      orderDate: o.orderDate,
      expectedDelivery: o.expectedDelivery,
      actualDelivery: o.actualDelivery,
      notes: o.notes,
    })
    setLines(o.lines.length > 0 ? o.lines : [{ id: generateId(), ...EMPTY_LINE }])
    setDialogOpen(true)
  }

  async function handleSave() {
    const validLines = lines.filter(l => l.material.trim())
    const totalAmount = validLines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unitPrice)), 0)

    const item: MaterialOrder = {
      id: editingOrder?.id ?? generateId(),
      ...form,
      lines: validLines.map(l => ({
        ...l,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        delivered: Number(l.delivered),
      })),
      totalAmount: Math.round(totalAmount),
    }
    let updated: MaterialOrder[]
    if (editingOrder) {
      updated = orders.map((o) => o.id === editingOrder.id ? item : o)
    } else {
      updated = [...orders, item]
    }
    setOrders(updated)
    setDialogOpen(false)
    await saveOrders(updated)
  }

  async function handleDelete() {
    if (!orderToDelete) return
    const updated = orders.filter((o) => o.id !== orderToDelete.id)
    setOrders(updated)
    setDeleteDialogOpen(false)
    setOrderToDelete(null)
    await saveOrders(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Bygg & Entreprenad"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny beställning
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
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt ordervärde</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalValue)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Aktiva beställningar</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.activeOrders}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Väntar leverans</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.pendingDeliveries}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Levererade</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.delivered}</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök order, projekt, leverantör..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as OrderStatus | 'all')}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrera status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  <SelectItem value="Planerad">Planerad</SelectItem>
                  <SelectItem value="Beställd">Beställd</SelectItem>
                  <SelectItem value="Levererad delvis">Levererad delvis</SelectItem>
                  <SelectItem value="Levererad">Levererad</SelectItem>
                  <SelectItem value="Avbruten">Avbruten</SelectItem>
                </SelectContent>
              </Select>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <EmptyModuleState
                icon={ShoppingCart}
                title="Inga beställningar"
                description="Skapa materialbeställningar med materiallistor, leveransbevakning och kostnadsuppföljning per projekt."
                actionLabel="Ny beställning"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Ordernr</TableHead>
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium">Leverantör</TableHead>
                      <TableHead className="font-medium text-right">Belopp</TableHead>
                      <TableHead className="font-medium">Förv. leverans</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono font-medium">{o.orderNumber}</TableCell>
                        <TableCell>{o.project}</TableCell>
                        <TableCell>{o.supplier}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(o.totalAmount)} kr</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {o.status === 'Levererad' ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            ) : o.expectedDelivery ? (
                              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <span>{o.expectedDelivery || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[o.status]}>{o.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(o)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setOrderToDelete(o); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'Redigera beställning' : 'Ny materialbeställning'}</DialogTitle>
            <DialogDescription>Materialbeställning med rader, leveransbevakning och kostnadsuppföljning.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Ordernummer *</Label>
                <Input value={form.orderNumber} onChange={(e) => setForm(f => ({ ...f, orderNumber: e.target.value }))} placeholder="MO-2024-001" />
              </div>
              <div className="grid gap-2">
                <Label>Projekt *</Label>
                <Input value={form.project} onChange={(e) => setForm(f => ({ ...f, project: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Leverantör *</Label>
                <Input value={form.supplier} onChange={(e) => setForm(f => ({ ...f, supplier: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Beställningsdatum</Label>
                <Input type="date" value={form.orderDate} onChange={(e) => setForm(f => ({ ...f, orderDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Förväntad leverans</Label>
                <Input type="date" value={form.expectedDelivery} onChange={(e) => setForm(f => ({ ...f, expectedDelivery: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as OrderStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planerad">Planerad</SelectItem>
                    <SelectItem value="Beställd">Beställd</SelectItem>
                    <SelectItem value="Levererad delvis">Levererad delvis</SelectItem>
                    <SelectItem value="Levererad">Levererad</SelectItem>
                    <SelectItem value="Avbruten">Avbruten</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Materialrader</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Ny rad
                </Button>
              </div>
              {lines.map((line, idx) => (
                <div key={line.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs">Material</Label>}
                    <Input value={line.material} onChange={(e) => updateLine(line.id, 'material', e.target.value)} placeholder="Material" />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs">Antal</Label>}
                    <Input type="number" value={line.quantity || ''} onChange={(e) => updateLine(line.id, 'quantity', Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs">Enhet</Label>}
                    <Select value={line.unit} onValueChange={(v) => updateLine(line.id, 'unit', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs">Á-pris</Label>}
                    <Input type="number" value={line.unitPrice || ''} onChange={(e) => updateLine(line.id, 'unitPrice', Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs">Levererat</Label>}
                    <Input type="number" value={line.delivered || ''} onChange={(e) => updateLine(line.id, 'delivered', Number(e.target.value))} />
                  </div>
                  <div className="col-span-1">
                    <Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => removeLine(line.id)} disabled={lines.length <= 1}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              <div className="text-sm text-muted-foreground text-right">
                Totalt: <span className="font-semibold text-foreground">{fmt(lines.reduce((s, l) => s + (Number(l.quantity) * Number(l.unitPrice)), 0))} kr</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.orderNumber.trim() || !form.project.trim()}>
              {editingOrder ? 'Uppdatera' : 'Skapa beställning'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort beställning</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort order {orderToDelete?.orderNumber}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
