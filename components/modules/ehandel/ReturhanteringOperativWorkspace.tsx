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
  RotateCcw,
  Package,
  Banknote,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ReturnStatus = 'Mottagen' | 'Godkänd' | 'Lager återställd' | 'Återbetald' | 'Avvisad'

interface ReturnCase {
  id: string
  returnId: string
  orderId: string
  date: string
  customerName: string
  product: string
  qty: number
  amount: number
  reason: string
  status: ReturnStatus
  stockRestored: boolean
  refunded: boolean
  notes: string
}

const RETURN_STATUSES: ReturnStatus[] = ['Mottagen', 'Godkänd', 'Lager återställd', 'Återbetald', 'Avvisad']

const STATUS_VARIANTS: Record<ReturnStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  'Mottagen': 'info',
  'Godkänd': 'warning',
  'Lager återställd': 'success',
  'Återbetald': 'success',
  'Avvisad': 'danger',
}

const DEFAULT_RETURNS: ReturnCase[] = [
  { id: '1', returnId: 'RET-001', orderId: 'ORD-5001', date: '2025-01-15', customerName: 'Anna Svensson', product: 'T-shirt Basic', qty: 1, amount: 199, reason: 'Fel storlek', status: 'Mottagen', stockRestored: false, refunded: false, notes: '' },
  { id: '2', returnId: 'RET-002', orderId: 'ORD-4990', date: '2025-01-14', customerName: 'Emma Ljung', product: 'Solglasögon Sport', qty: 1, amount: 299, reason: 'Defekt vara', status: 'Godkänd', stockRestored: false, refunded: false, notes: 'Bekräftad defekt vid inspektion' },
  { id: '3', returnId: 'RET-003', orderId: 'ORD-4980', date: '2025-01-13', customerName: 'Erik Lindberg', product: 'Hoodie Premium', qty: 1, amount: 499, reason: 'Ångerrätt', status: 'Lager återställd', stockRestored: true, refunded: false, notes: '' },
  { id: '4', returnId: 'RET-004', orderId: 'ORD-4970', date: '2025-01-12', customerName: 'Maria Karlsson', product: 'Ryggsäck 25L', qty: 1, amount: 649, reason: 'Ångerrätt', status: 'Återbetald', stockRestored: true, refunded: true, notes: 'Swish-återbetalning' },
  { id: '5', returnId: 'RET-005', orderId: 'ORD-4960', date: '2025-01-11', customerName: 'Per Johansson', product: 'Mössa Vinter', qty: 2, amount: 110, reason: 'Använd vara', status: 'Avvisad', stockRestored: false, refunded: false, notes: 'Tydliga bruksspår' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

const EMPTY_FORM = {
  orderId: '',
  customerName: '',
  product: '',
  qty: '1',
  amount: '',
  reason: '',
}

export function ReturhanteringOperativWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [returns, setReturns] = useState<ReturnCase[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<ReturnStatus | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveReturns = useCallback(async (newReturns: ReturnCase[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'return_cases', config_value: newReturns },
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
      .eq('config_key', 'return_cases').maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setReturns(data.config_value as ReturnCase[])
    } else {
      setReturns(DEFAULT_RETURNS)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'return_cases', config_value: DEFAULT_RETURNS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredReturns = useMemo(() => {
    let result = returns
    if (filterStatus !== 'all') result = result.filter((r) => r.status === filterStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) => r.returnId.toLowerCase().includes(q) || r.orderId.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q) || r.product.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [returns, filterStatus, searchQuery])

  const pendingCount = useMemo(() => returns.filter((r) => r.status === 'Mottagen' || r.status === 'Godkänd').length, [returns])
  const approvedCount = useMemo(() => returns.filter((r) => r.status !== 'Avvisad' && r.status !== 'Mottagen').length, [returns])
  const refundedAmount = useMemo(() => returns.filter((r) => r.refunded).reduce((s, r) => s + r.amount, 0), [returns])
  const restoredCount = useMemo(() => returns.filter((r) => r.stockRestored).length, [returns])

  async function handleAddReturn() {
    const amount = parseFloat(form.amount)
    const qty = parseInt(form.qty, 10)
    if (!form.orderId.trim() || !form.product.trim() || isNaN(amount)) return

    const today = new Date().toISOString().slice(0, 10)
    const returnId = `RET-${String(returns.length + 1).padStart(3, '0')}`

    const newReturn: ReturnCase = {
      id: generateId(),
      returnId,
      orderId: form.orderId.trim(),
      date: today,
      customerName: form.customerName.trim(),
      product: form.product.trim(),
      qty: qty || 1,
      amount,
      reason: form.reason.trim() || 'Ej angiven',
      status: 'Mottagen',
      stockRestored: false,
      refunded: false,
      notes: '',
    }

    const updated = [newReturn, ...returns]
    setReturns(updated)
    setDialogOpen(false)
    setForm(EMPTY_FORM)
    await saveReturns(updated)
  }

  async function handleUpdateStatus(id: string, newStatus: ReturnStatus) {
    const updated = returns.map((r) => {
      if (r.id !== id) return r
      return {
        ...r,
        status: newStatus,
        stockRestored: newStatus === 'Lager återställd' || newStatus === 'Återbetald' ? true : r.stockRestored,
        refunded: newStatus === 'Återbetald' ? true : r.refunded,
      }
    })
    setReturns(updated)
    await saveReturns(updated)
  }

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
            Ny retur
          </Button>
        }
      >
        <Tabs defaultValue="returer" className="space-y-6">
          <TabsList>
            <TabsTrigger value="returer">Returer ({returns.length})</TabsTrigger>
            <TabsTrigger value="lager">Lagerflöde</TabsTrigger>
          </TabsList>

          <TabsContent value="returer" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Väntar behandling" value={String(pendingCount)} unit="st" trend={pendingCount > 5 ? 'down' : 'neutral'} trendLabel={pendingCount > 5 ? 'Hög volym' : undefined} />
                  <KPICard label="Godkända" value={String(approvedCount)} unit="st" />
                  <KPICard label="Återbetalat" value={fmt(refundedAmount)} unit="kr" />
                  <KPICard label="Lager återställt" value={String(restoredCount)} unit="st" />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Sök retur-ID, order, kund eller produkt..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as ReturnStatus | 'all')}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      {RETURN_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredReturns.length === 0 ? (
                  <EmptyModuleState
                    icon={RotateCcw}
                    title="Inga returer"
                    description="Registrera returer för att hantera godkännande och återbetalning."
                    actionLabel="Ny retur"
                    onAction={() => { setForm(EMPTY_FORM); setDialogOpen(true) }}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Retur-ID</TableHead>
                          <TableHead className="font-medium">Order-ID</TableHead>
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Kund</TableHead>
                          <TableHead className="font-medium">Produkt</TableHead>
                          <TableHead className="font-medium text-right">Belopp</TableHead>
                          <TableHead className="font-medium">Orsak</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredReturns.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono font-medium">{r.returnId}</TableCell>
                            <TableCell className="font-mono">{r.orderId}</TableCell>
                            <TableCell className="text-muted-foreground">{r.date}</TableCell>
                            <TableCell>{r.customerName}</TableCell>
                            <TableCell>{r.product} x{r.qty}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(r.amount)} kr</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.reason}</TableCell>
                            <TableCell><StatusBadge label={r.status} variant={STATUS_VARIANTS[r.status]} /></TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {r.status === 'Mottagen' && (
                                  <>
                                    <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(r.id, 'Godkänd')}>Godkänn</Button>
                                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => handleUpdateStatus(r.id, 'Avvisad')}>Avvisa</Button>
                                  </>
                                )}
                                {r.status === 'Godkänd' && (
                                  <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(r.id, 'Lager återställd')}>
                                    <Package className="mr-1 h-3.5 w-3.5" />
                                    Återställ lager
                                  </Button>
                                )}
                                {r.status === 'Lager återställd' && !r.refunded && (
                                  <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(r.id, 'Återbetald')}>
                                    <Banknote className="mr-1 h-3.5 w-3.5" />
                                    Återbetala
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

          <TabsContent value="lager" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Lageråterställningar</h3>
                <p className="text-xs text-muted-foreground">Visar alla returer där lagret har återställts.</p>
                {returns.filter((r) => r.stockRestored).length === 0 ? (
                  <EmptyModuleState icon={Package} title="Inga lageråterställningar" description="Inga returer har fått lagret återställt ännu." />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Retur-ID</TableHead>
                          <TableHead className="font-medium">Produkt</TableHead>
                          <TableHead className="font-medium text-right">Antal</TableHead>
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Återbetald</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {returns.filter((r) => r.stockRestored).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono font-medium">{r.returnId}</TableCell>
                            <TableCell>{r.product}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                            <TableCell className="text-muted-foreground">{r.date}</TableCell>
                            <TableCell>{r.refunded ? <StatusBadge label="Ja" variant="success" /> : <StatusBadge label="Nej" variant="neutral" />}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny retur</DialogTitle>
            <DialogDescription>Registrera en kundreturnering.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Order-ID *</Label>
                <Input value={form.orderId} onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))} placeholder="ORD-5001" />
              </div>
              <div className="grid gap-2">
                <Label>Kundnamn</Label>
                <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Anna Svensson" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Produkt *</Label>
                <Input value={form.product} onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))} placeholder="T-shirt Basic" />
              </div>
              <div className="grid gap-2">
                <Label>Antal</Label>
                <Input type="number" min={1} value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Belopp (kr) *</Label>
                <Input type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="199" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Orsak</Label>
              <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Fel storlek, defekt, ångerrätt..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleAddReturn} disabled={!form.orderId.trim() || !form.product.trim() || !form.amount}>
              Registrera retur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
