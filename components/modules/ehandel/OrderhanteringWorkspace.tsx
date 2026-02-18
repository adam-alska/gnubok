'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
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
  Loader2,
  Search,
  ClipboardList,
  Package,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type OrderStatus = 'Ny' | 'Plockas' | 'Packad' | 'Skickad' | 'Levererad' | 'Avbruten'
type OrderChannel = 'Webbshop' | 'Shopify' | 'Amazon' | 'Instagram' | 'Manuell'

interface Order {
  id: string
  orderId: string
  date: string
  channel: OrderChannel
  customerName: string
  items: { name: string; qty: number; sku: string }[]
  totalAmount: number
  status: OrderStatus
  trackingId: string
}

const ORDER_STATUSES: OrderStatus[] = ['Ny', 'Plockas', 'Packad', 'Skickad', 'Levererad', 'Avbruten']
const ORDER_CHANNELS: OrderChannel[] = ['Webbshop', 'Shopify', 'Amazon', 'Instagram', 'Manuell']

const STATUS_VARIANTS: Record<OrderStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  'Ny': 'info',
  'Plockas': 'warning',
  'Packad': 'warning',
  'Skickad': 'success',
  'Levererad': 'success',
  'Avbruten': 'danger',
}

const DEFAULT_ORDERS: Order[] = [
  { id: '1', orderId: 'ORD-5001', date: '2025-01-15', channel: 'Webbshop', customerName: 'Anna Svensson', items: [{ name: 'T-shirt Basic', qty: 2, sku: 'SKU-001' }, { name: 'Mössa Vinter', qty: 1, sku: 'SKU-003' }], totalAmount: 433, status: 'Ny', trackingId: '' },
  { id: '2', orderId: 'ORD-5002', date: '2025-01-15', channel: 'Shopify', customerName: 'Erik Lindberg', items: [{ name: 'Hoodie Premium', qty: 1, sku: 'SKU-002' }], totalAmount: 499, status: 'Plockas', trackingId: '' },
  { id: '3', orderId: 'ORD-5003', date: '2025-01-14', channel: 'Amazon', customerName: 'Maria Karlsson', items: [{ name: 'Ryggsäck 25L', qty: 1, sku: 'SKU-004' }], totalAmount: 649, status: 'Packad', trackingId: '' },
  { id: '4', orderId: 'ORD-5004', date: '2025-01-14', channel: 'Webbshop', customerName: 'Olof Nilsson', items: [{ name: 'T-shirt Basic', qty: 3, sku: 'SKU-001' }], totalAmount: 597, status: 'Skickad', trackingId: 'PN-12345678' },
  { id: '5', orderId: 'ORD-5005', date: '2025-01-13', channel: 'Instagram', customerName: 'Lisa Bergström', items: [{ name: 'Solglasögon Sport', qty: 1, sku: 'SKU-005' }], totalAmount: 299, status: 'Levererad', trackingId: 'DHL-87654321' },
  { id: '6', orderId: 'ORD-5006', date: '2025-01-13', channel: 'Webbshop', customerName: 'Per Johansson', items: [{ name: 'Hoodie Premium', qty: 2, sku: 'SKU-002' }], totalAmount: 998, status: 'Ny', trackingId: '' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function OrderhanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all')
  const [filterChannel, setFilterChannel] = useState<OrderChannel | 'all'>('all')
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())

  const saveOrders = useCallback(async (newOrders: Order[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'orders', config_value: newOrders },
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
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'orders').maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setOrders(data.config_value as Order[])
    } else {
      setOrders(DEFAULT_ORDERS)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'orders', config_value: DEFAULT_ORDERS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredOrders = useMemo(() => {
    let result = orders
    if (filterStatus !== 'all') result = result.filter((o) => o.status === filterStatus)
    if (filterChannel !== 'all') result = result.filter((o) => o.channel === filterChannel)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((o) => o.orderId.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [orders, filterStatus, filterChannel, searchQuery])

  const newCount = useMemo(() => orders.filter((o) => o.status === 'Ny').length, [orders])
  const pickingCount = useMemo(() => orders.filter((o) => o.status === 'Plockas' || o.status === 'Packad').length, [orders])
  const shippedCount = useMemo(() => orders.filter((o) => o.status === 'Skickad' || o.status === 'Levererad').length, [orders])
  const totalValue = useMemo(() => orders.reduce((s, o) => s + o.totalAmount, 0), [orders])

  async function handleUpdateStatus(orderId: string, newStatus: OrderStatus) {
    const updated = orders.map((o) => o.id === orderId ? { ...o, status: newStatus } : o)
    setOrders(updated)
    await saveOrders(updated)
  }

  async function handleBatchUpdateStatus(newStatus: OrderStatus) {
    if (selectedOrders.size === 0) return
    const updated = orders.map((o) => selectedOrders.has(o.id) ? { ...o, status: newStatus } : o)
    setOrders(updated)
    setSelectedOrders(new Set())
    await saveOrders(updated)
  }

  function toggleSelectOrder(id: string) {
    setSelectedOrders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set())
    } else {
      setSelectedOrders(new Set(filteredOrders.map((o) => o.id)))
    }
  }

  // Pick list: all orders with status "Plockas"
  const pickList = useMemo(() => {
    const items: { sku: string; name: string; totalQty: number; orders: string[] }[] = []
    const map: Record<string, { name: string; totalQty: number; orders: string[] }> = {}
    for (const o of orders.filter((o) => o.status === 'Plockas')) {
      for (const item of o.items) {
        if (!map[item.sku]) map[item.sku] = { name: item.name, totalQty: 0, orders: [] }
        map[item.sku].totalQty += item.qty
        map[item.sku].orders.push(o.orderId)
      }
    }
    return Object.entries(map).map(([sku, d]) => ({ sku, ...d })).sort((a, b) => b.totalQty - a.totalQty)
  }, [orders])

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="operativ"
      sectorName="E-handel"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
      actions={
        selectedOrders.size > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedOrders.size} valda</span>
            <Select onValueChange={(v) => handleBatchUpdateStatus(v as OrderStatus)}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Ändra status" /></SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        ) : undefined
      }
    >
      <Tabs defaultValue="ordrar" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ordrar">Ordrar ({orders.length})</TabsTrigger>
          <TabsTrigger value="plocklista">Plocklista</TabsTrigger>
        </TabsList>

        <TabsContent value="ordrar" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Nya ordrar" value={String(newCount)} unit="st" trend={newCount > 5 ? 'down' : 'neutral'} trendLabel={newCount > 5 ? 'Hög volym' : undefined} />
                <KPICard label="Under plockning" value={String(pickingCount)} unit="st" />
                <KPICard label="Skickade" value={String(shippedCount)} unit="st" />
                <KPICard label="Totalt ordervärde" value={fmt(totalValue)} unit="kr" />
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Sök order-ID eller kund..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as OrderStatus | 'all')}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla statusar</SelectItem>
                    {ORDER_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Select value={filterChannel} onValueChange={(v) => setFilterChannel(v as OrderChannel | 'all')}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Kanal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla kanaler</SelectItem>
                    {ORDER_CHANNELS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
                {saving && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sparar...
                  </div>
                )}
              </div>

              {filteredOrders.length === 0 ? (
                <EmptyModuleState
                  icon={ClipboardList}
                  title="Inga ordrar"
                  description="Inga ordrar matchar filtret."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-10">
                          <Checkbox checked={selectedOrders.size === filteredOrders.length && filteredOrders.length > 0} onCheckedChange={toggleSelectAll} />
                        </TableHead>
                        <TableHead className="font-medium">Order-ID</TableHead>
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Kanal</TableHead>
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium">Artiklar</TableHead>
                        <TableHead className="font-medium text-right">Belopp</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>
                            <Checkbox checked={selectedOrders.has(o.id)} onCheckedChange={() => toggleSelectOrder(o.id)} />
                          </TableCell>
                          <TableCell className="font-mono font-medium">{o.orderId}</TableCell>
                          <TableCell className="text-muted-foreground">{o.date}</TableCell>
                          <TableCell><Badge variant="outline">{o.channel}</Badge></TableCell>
                          <TableCell>{o.customerName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{o.items.map((i) => `${i.name} x${i.qty}`).join(', ')}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(o.totalAmount)} kr</TableCell>
                          <TableCell><StatusBadge label={o.status} variant={STATUS_VARIANTS[o.status]} /></TableCell>
                          <TableCell className="text-right">
                            {o.status === 'Ny' && (
                              <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(o.id, 'Plockas')}>Starta plock</Button>
                            )}
                            {o.status === 'Plockas' && (
                              <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(o.id, 'Packad')}>Packad</Button>
                            )}
                            {o.status === 'Packad' && (
                              <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(o.id, 'Skickad')}>Skicka</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="plocklista" className="space-y-6">
          {pickList.length === 0 ? (
            <EmptyModuleState icon={Package} title="Ingen plocklista" description="Det finns inga ordrar med status 'Plockas'." />
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">SKU</TableHead>
                    <TableHead className="font-medium">Artikel</TableHead>
                    <TableHead className="font-medium text-right">Totalt antal</TableHead>
                    <TableHead className="font-medium">Ordrar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pickList.map((item) => (
                    <TableRow key={item.sku}>
                      <TableCell className="font-mono font-medium">{item.sku}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{item.totalQty}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.orders.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
