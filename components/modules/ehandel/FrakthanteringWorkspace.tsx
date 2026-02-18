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
  Truck,
  Package,
  RotateCcw,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ShipmentStatus = 'Skapad' | 'Hämtad' | 'Under transport' | 'Levererad' | 'Retur'

interface Shipment {
  id: string
  orderId: string
  trackingId: string
  carrier: string
  createdDate: string
  status: ShipmentStatus
  customerName: string
  address: string
  weight: number
  returnTracking: string
}

const SHIPMENT_STATUSES: ShipmentStatus[] = ['Skapad', 'Hämtad', 'Under transport', 'Levererad', 'Retur']
const CARRIERS = ['PostNord', 'DHL', 'Budbee', 'Instabox', 'DB Schenker']

const STATUS_VARIANTS: Record<ShipmentStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  'Skapad': 'info',
  'Hämtad': 'warning',
  'Under transport': 'warning',
  'Levererad': 'success',
  'Retur': 'danger',
}

const DEFAULT_SHIPMENTS: Shipment[] = [
  { id: '1', orderId: 'ORD-5004', trackingId: 'PN-12345678', carrier: 'PostNord', createdDate: '2025-01-14', status: 'Levererad', customerName: 'Olof Nilsson', address: 'Storgatan 12, Stockholm', weight: 0.8, returnTracking: '' },
  { id: '2', orderId: 'ORD-5005', trackingId: 'DHL-87654321', carrier: 'DHL', createdDate: '2025-01-13', status: 'Levererad', customerName: 'Lisa Bergström', address: 'Kungsgatan 5, Göteborg', weight: 0.3, returnTracking: '' },
  { id: '3', orderId: 'ORD-5007', trackingId: 'BB-99887766', carrier: 'Budbee', createdDate: '2025-01-15', status: 'Under transport', customerName: 'Karl Eriksson', address: 'Drottninggatan 8, Malmö', weight: 1.5, returnTracking: '' },
  { id: '4', orderId: 'ORD-5008', trackingId: 'PN-55443322', carrier: 'PostNord', createdDate: '2025-01-15', status: 'Skapad', customerName: 'Sofia Andersson', address: 'Vasagatan 20, Uppsala', weight: 2.1, returnTracking: '' },
  { id: '5', orderId: 'ORD-4990', trackingId: 'DHL-11223344', carrier: 'DHL', createdDate: '2025-01-10', status: 'Retur', customerName: 'Emma Ljung', address: 'Björkvägen 3, Lund', weight: 0.5, returnTracking: 'RET-DHL-44332211' },
]

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

const EMPTY_FORM = {
  orderId: '',
  carrier: 'PostNord',
  customerName: '',
  address: '',
  weight: '',
}

export function FrakthanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [shipments, setShipments] = useState<Shipment[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<ShipmentStatus | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveShipments = useCallback(async (newShipments: Shipment[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'shipments', config_value: newShipments },
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
      .eq('config_key', 'shipments').maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setShipments(data.config_value as Shipment[])
    } else {
      setShipments(DEFAULT_SHIPMENTS)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'shipments', config_value: DEFAULT_SHIPMENTS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredShipments = useMemo(() => {
    let result = shipments
    if (filterStatus !== 'all') result = result.filter((s) => s.status === filterStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((s) => s.orderId.toLowerCase().includes(q) || s.trackingId.toLowerCase().includes(q) || s.customerName.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.createdDate.localeCompare(a.createdDate))
  }, [shipments, filterStatus, searchQuery])

  const activeCount = useMemo(() => shipments.filter((s) => s.status !== 'Levererad' && s.status !== 'Retur').length, [shipments])
  const deliveredCount = useMemo(() => shipments.filter((s) => s.status === 'Levererad').length, [shipments])
  const returnCount = useMemo(() => shipments.filter((s) => s.status === 'Retur').length, [shipments])

  async function handleCreateShipment() {
    if (!form.orderId.trim() || !form.customerName.trim()) return

    const trackingId = `${form.carrier.replace(/\s/g, '').slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-8)}`
    const today = new Date().toISOString().slice(0, 10)

    const newShipment: Shipment = {
      id: generateId(),
      orderId: form.orderId.trim(),
      trackingId,
      carrier: form.carrier,
      createdDate: today,
      status: 'Skapad',
      customerName: form.customerName.trim(),
      address: form.address.trim(),
      weight: parseFloat(form.weight) || 0,
      returnTracking: '',
    }

    const updated = [newShipment, ...shipments]
    setShipments(updated)
    setDialogOpen(false)
    setForm(EMPTY_FORM)
    await saveShipments(updated)
  }

  async function handleUpdateStatus(id: string, newStatus: ShipmentStatus) {
    const updated = shipments.map((s) => s.id === id ? { ...s, status: newStatus } : s)
    setShipments(updated)
    await saveShipments(updated)
  }

  // Return logistics
  const returnShipments = useMemo(() => shipments.filter((s) => s.status === 'Retur'), [shipments])

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="E-handel"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={() => { setForm(EMPTY_FORM); setDialogOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt fraktsedel
          </Button>
        }
      >
        <Tabs defaultValue="forsandelser" className="space-y-6">
          <TabsList>
            <TabsTrigger value="forsandelser">Försändelser</TabsTrigger>
            <TabsTrigger value="returer">Returlogistik ({returnCount})</TabsTrigger>
          </TabsList>

          <TabsContent value="forsandelser" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Aktiva försändelser" value={String(activeCount)} unit="st" />
                  <KPICard label="Levererade" value={String(deliveredCount)} unit="st" />
                  <KPICard label="Returer" value={String(returnCount)} unit="st" trend={returnCount > 0 ? 'down' : 'neutral'} />
                  <KPICard label="Totalt" value={String(shipments.length)} unit="st" />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Sök order, tracking eller kund..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as ShipmentStatus | 'all')}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      {SHIPMENT_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredShipments.length === 0 ? (
                  <EmptyModuleState icon={Truck} title="Inga försändelser" description="Skapa fraktsedlar för att hantera leveranser." actionLabel="Nytt fraktsedel" onAction={() => setDialogOpen(true)} />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Order-ID</TableHead>
                          <TableHead className="font-medium">Tracking</TableHead>
                          <TableHead className="font-medium">Transportör</TableHead>
                          <TableHead className="font-medium">Kund</TableHead>
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium text-right">Vikt</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredShipments.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-mono font-medium">{s.orderId}</TableCell>
                            <TableCell className="font-mono text-sm">{s.trackingId}</TableCell>
                            <TableCell><Badge variant="outline">{s.carrier}</Badge></TableCell>
                            <TableCell>{s.customerName}</TableCell>
                            <TableCell className="text-muted-foreground">{s.createdDate}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.weight.toFixed(1)} kg</TableCell>
                            <TableCell><StatusBadge label={s.status} variant={STATUS_VARIANTS[s.status]} /></TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {s.status === 'Skapad' && (
                                  <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(s.id, 'Hämtad')}>Hämtad</Button>
                                )}
                                {s.status === 'Hämtad' && (
                                  <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(s.id, 'Under transport')}>Under transport</Button>
                                )}
                                {s.status === 'Under transport' && (
                                  <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(s.id, 'Levererad')}>Levererad</Button>
                                )}
                                {(s.status === 'Levererad') && (
                                  <Button variant="ghost" size="sm" className="text-amber-600" onClick={() => handleUpdateStatus(s.id, 'Retur')}>
                                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                    Retur
                                  </Button>
                                )}
                              </div>
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

          <TabsContent value="returer" className="space-y-6">
            {returnShipments.length === 0 ? (
              <EmptyModuleState icon={RotateCcw} title="Inga returförsändelser" description="Det finns inga försändelser med returstatus." />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Order-ID</TableHead>
                      <TableHead className="font-medium">Original tracking</TableHead>
                      <TableHead className="font-medium">Transportör</TableHead>
                      <TableHead className="font-medium">Kund</TableHead>
                      <TableHead className="font-medium">Adress</TableHead>
                      <TableHead className="font-medium">Retur-tracking</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnShipments.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono font-medium">{s.orderId}</TableCell>
                        <TableCell className="font-mono text-sm">{s.trackingId}</TableCell>
                        <TableCell><Badge variant="outline">{s.carrier}</Badge></TableCell>
                        <TableCell>{s.customerName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.address}</TableCell>
                        <TableCell className="font-mono text-sm">{s.returnTracking || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nytt fraktsedel</DialogTitle>
            <DialogDescription>Skapa fraktsedel med tracking-nummer.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Order-ID *</Label>
                <Input value={form.orderId} onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))} placeholder="ORD-5004" />
              </div>
              <div className="grid gap-2">
                <Label>Transportör *</Label>
                <Select value={form.carrier} onValueChange={(v) => setForm((f) => ({ ...f, carrier: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARRIERS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Kundnamn *</Label>
              <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Anna Svensson" />
            </div>
            <div className="grid gap-2">
              <Label>Leveransadress</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Storgatan 12, Stockholm" />
            </div>
            <div className="grid gap-2">
              <Label>Vikt (kg)</Label>
              <Input type="number" min={0} step="0.1" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} placeholder="0.8" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleCreateShipment} disabled={!form.orderId.trim() || !form.customerName.trim()}>
              Skapa fraktsedel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
