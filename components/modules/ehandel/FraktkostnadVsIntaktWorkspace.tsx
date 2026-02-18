'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
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
  Trash2,
  Loader2,
  Truck,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ShippingEntry {
  id: string
  orderId: string
  date: string
  shippingCost: number
  shippingRevenue: number
  orderValue: number
  carrier: string
  subsidized: boolean
}

interface Settings {
  freeShippingThreshold: number
  flatShippingFee: number
}

const DEFAULT_SETTINGS: Settings = {
  freeShippingThreshold: 499,
  flatShippingFee: 49,
}

const CARRIERS = ['PostNord', 'DHL', 'Budbee', 'Instabox', 'DB Schenker', 'Övrigt']

const DEFAULT_ENTRIES: ShippingEntry[] = [
  { id: '1', orderId: 'ORD-3001', date: '2025-01-15', shippingCost: 45, shippingRevenue: 49, orderValue: 299, carrier: 'PostNord', subsidized: false },
  { id: '2', orderId: 'ORD-3002', date: '2025-01-15', shippingCost: 62, shippingRevenue: 0, orderValue: 899, carrier: 'DHL', subsidized: true },
  { id: '3', orderId: 'ORD-3003', date: '2025-01-14', shippingCost: 38, shippingRevenue: 49, orderValue: 349, carrier: 'Budbee', subsidized: false },
  { id: '4', orderId: 'ORD-3004', date: '2025-01-14', shippingCost: 55, shippingRevenue: 0, orderValue: 1299, carrier: 'PostNord', subsidized: true },
  { id: '5', orderId: 'ORD-3005', date: '2025-01-13', shippingCost: 48, shippingRevenue: 49, orderValue: 450, carrier: 'Instabox', subsidized: false },
  { id: '6', orderId: 'ORD-3006', date: '2025-01-13', shippingCost: 72, shippingRevenue: 0, orderValue: 2499, carrier: 'DHL', subsidized: true },
  { id: '7', orderId: 'ORD-3007', date: '2025-01-12', shippingCost: 42, shippingRevenue: 49, orderValue: 199, carrier: 'PostNord', subsidized: false },
  { id: '8', orderId: 'ORD-3008', date: '2025-01-12', shippingCost: 85, shippingRevenue: 0, orderValue: 599, carrier: 'DB Schenker', subsidized: true },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmt2(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

const EMPTY_FORM = {
  orderId: '',
  shippingCost: '',
  shippingRevenue: '',
  orderValue: '',
  carrier: 'PostNord',
}

export function FraktkostnadVsIntaktWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<ShippingEntry[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<ShippingEntry | null>(null)

  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_SETTINGS.freeShippingThreshold))
  const [feeInput, setFeeInput] = useState(String(DEFAULT_SETTINGS.flatShippingFee))

  const saveEntries = useCallback(async (newEntries: ShippingEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'shipping_entries', config_value: newEntries },
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
      .eq('config_key', 'shipping_entries').maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setEntries(data.config_value as ShippingEntry[])
    } else {
      setEntries(DEFAULT_ENTRIES)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'shipping_entries', config_value: DEFAULT_ENTRIES },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: settingsData } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'settings').maybeSingle()

    if (settingsData?.config_value) {
      const s = settingsData.config_value as Settings
      setSettings(s)
      setThresholdInput(String(s.freeShippingThreshold))
      setFeeInput(String(s.flatShippingFee))
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalCost = useMemo(() => entries.reduce((s, e) => s + e.shippingCost, 0), [entries])
  const totalRevenue = useMemo(() => entries.reduce((s, e) => s + e.shippingRevenue, 0), [entries])
  const netShipping = useMemo(() => totalRevenue - totalCost, [totalRevenue, totalCost])
  const subsidizedCount = useMemo(() => entries.filter((e) => e.subsidized).length, [entries])
  const subsidizedCost = useMemo(() => entries.filter((e) => e.subsidized).reduce((s, e) => s + e.shippingCost, 0), [entries])
  const avgCostPerOrder = useMemo(() => entries.length > 0 ? totalCost / entries.length : 0, [totalCost, entries.length])
  const breakEvenOrderValue = useMemo(() => {
    if (avgCostPerOrder <= 0) return 0
    return avgCostPerOrder / 0.40 * 100 // assuming ~40% margin
  }, [avgCostPerOrder])

  const carrierBreakdown = useMemo(() => {
    const map: Record<string, { cost: number; count: number; revenue: number }> = {}
    for (const e of entries) {
      if (!map[e.carrier]) map[e.carrier] = { cost: 0, count: 0, revenue: 0 }
      map[e.carrier].cost += e.shippingCost
      map[e.carrier].count++
      map[e.carrier].revenue += e.shippingRevenue
    }
    return Object.entries(map)
      .map(([carrier, data]) => ({
        carrier,
        totalCost: data.cost,
        totalRevenue: data.revenue,
        count: data.count,
        avgCost: data.count > 0 ? data.cost / data.count : 0,
        netResult: data.revenue - data.cost,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
  }, [entries])

  async function handleAddEntry() {
    const shippingCost = parseFloat(form.shippingCost)
    const shippingRevenue = parseFloat(form.shippingRevenue) || 0
    const orderValue = parseFloat(form.orderValue)
    if (!form.orderId.trim() || isNaN(shippingCost) || isNaN(orderValue)) return

    const subsidized = shippingRevenue === 0 && shippingCost > 0
    const today = new Date().toISOString().slice(0, 10)

    const newEntry: ShippingEntry = {
      id: generateId(),
      orderId: form.orderId.trim(),
      date: today,
      shippingCost,
      shippingRevenue,
      orderValue,
      carrier: form.carrier,
      subsidized,
    }

    const updated = [newEntry, ...entries]
    setEntries(updated)
    setDialogOpen(false)
    setForm(EMPTY_FORM)
    await saveEntries(updated)
  }

  async function handleDeleteEntry() {
    if (!entryToDelete) return
    const updated = entries.filter((e) => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
  }

  async function handleSaveSettings() {
    setSaving(true)
    const newSettings: Settings = {
      freeShippingThreshold: parseFloat(thresholdInput) || 499,
      flatShippingFee: parseFloat(feeInput) || 49,
    }
    setSettings(newSettings)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'settings', config_value: newSettings },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setSaving(false)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="E-handel"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-3">
            <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            <Button onClick={() => { setForm(EMPTY_FORM); setDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Ny post
            </Button>
          </div>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="per-order">Per order</TabsTrigger>
            <TabsTrigger value="transportor">Per transportör</TabsTrigger>
            <TabsTrigger value="installningar">Inställningar</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={Truck}
                title="Inga fraktposter"
                description="Registrera fraktposter för att analysera kostnad vs intäkt."
                actionLabel="Ny post"
                onAction={() => { setForm(EMPTY_FORM); setDialogOpen(true) }}
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <KPICard label="Total fraktkostnad" value={fmt(totalCost)} unit="kr" />
                  <KPICard label="Fraktintäkt" value={fmt(totalRevenue)} unit="kr" />
                  <KPICard label="Netto frakt" value={`${netShipping >= 0 ? '+' : ''}${fmt(netShipping)}`} unit="kr" trend={netShipping >= 0 ? 'up' : 'down'} />
                  <KPICard label="Subventionerade" value={String(subsidizedCount)} unit={`st (${fmt(subsidizedCost)} kr)`} />
                  <KPICard label="Snitt/order" value={fmt2(avgCostPerOrder)} unit="kr" />
                </div>

                <div className="rounded-xl border border-border bg-card p-5 max-w-md space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Break-even analys</p>
                  <p className="text-sm">
                    Med snittfraktkostnad <span className="font-semibold">{fmt2(avgCostPerOrder)} kr</span> och antagen 40% marginalbehöver ordervärdet vara minst{' '}
                    <span className="font-semibold">{fmt(breakEvenOrderValue)} kr</span> för att fraktsubventionen ska bäras av marginalen.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Nuvarande fri frakt-gräns: {fmt(settings.freeShippingThreshold)} kr
                  </p>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="per-order" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Order-ID</TableHead>
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">Transportör</TableHead>
                      <TableHead className="font-medium text-right">Ordervärde</TableHead>
                      <TableHead className="font-medium text-right">Fraktkostnad</TableHead>
                      <TableHead className="font-medium text-right">Fraktintäkt</TableHead>
                      <TableHead className="font-medium text-right">Netto</TableHead>
                      <TableHead className="font-medium">Subv.</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.sort((a, b) => b.date.localeCompare(a.date)).map((e) => {
                      const net = e.shippingRevenue - e.shippingCost
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="font-mono font-medium">{e.orderId}</TableCell>
                          <TableCell className="text-muted-foreground">{e.date}</TableCell>
                          <TableCell><Badge variant="outline">{e.carrier}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.orderValue)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.shippingCost)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.shippingRevenue)} kr</TableCell>
                          <TableCell className={`text-right tabular-nums font-medium ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {net >= 0 ? '+' : ''}{fmt(net)} kr
                          </TableCell>
                          <TableCell>{e.subsidized ? <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Ja</Badge> : <span className="text-muted-foreground text-sm">Nej</span>}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(e); setDeleteDialogOpen(true) }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="transportor" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Transportör</TableHead>
                      <TableHead className="font-medium text-right">Antal</TableHead>
                      <TableHead className="font-medium text-right">Total kostnad</TableHead>
                      <TableHead className="font-medium text-right">Total intäkt</TableHead>
                      <TableHead className="font-medium text-right">Netto</TableHead>
                      <TableHead className="font-medium text-right">Snitt/order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {carrierBreakdown.map((cb) => (
                      <TableRow key={cb.carrier}>
                        <TableCell className="font-medium">{cb.carrier}</TableCell>
                        <TableCell className="text-right tabular-nums">{cb.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(cb.totalCost)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(cb.totalRevenue)} kr</TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${cb.netResult >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {cb.netResult >= 0 ? '+' : ''}{fmt(cb.netResult)} kr
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt2(cb.avgCost)} kr</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="installningar" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
              <h3 className="text-sm font-semibold">Fraktinställningar</h3>
              <p className="text-xs text-muted-foreground">
                Ange gränsvärde för fri frakt och standardavgift.
              </p>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Fri frakt-gräns (kr)</Label>
                  <Input type="number" min={0} value={thresholdInput} onChange={(e) => setThresholdInput(e.target.value)} className="h-9 w-32" placeholder="499" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fraktavgift (kr)</Label>
                  <Input type="number" min={0} value={feeInput} onChange={(e) => setFeeInput(e.target.value)} className="h-9 w-32" placeholder="49" />
                </div>
              </div>
              <Button size="sm" onClick={handleSaveSettings} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                Spara
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny fraktpost</DialogTitle>
            <DialogDescription>Registrera fraktkostnad och intäkt per order.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Order-ID *</Label>
                <Input value={form.orderId} onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))} placeholder="ORD-3001" />
              </div>
              <div className="grid gap-2">
                <Label>Transportör</Label>
                <Select value={form.carrier} onValueChange={(v) => setForm((f) => ({ ...f, carrier: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARRIERS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Ordervärde (kr) *</Label>
                <Input type="number" min={0} value={form.orderValue} onChange={(e) => setForm((f) => ({ ...f, orderValue: e.target.value }))} placeholder="899" />
              </div>
              <div className="grid gap-2">
                <Label>Fraktkostnad (kr) *</Label>
                <Input type="number" min={0} value={form.shippingCost} onChange={(e) => setForm((f) => ({ ...f, shippingCost: e.target.value }))} placeholder="45" />
              </div>
              <div className="grid gap-2">
                <Label>Fraktintäkt (kr)</Label>
                <Input type="number" min={0} value={form.shippingRevenue} onChange={(e) => setForm((f) => ({ ...f, shippingRevenue: e.target.value }))} placeholder="49" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleAddEntry} disabled={!form.orderId.trim() || !form.shippingCost || !form.orderValue}>
              Lägg till
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort fraktpost</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort posten för{' '}
              <span className="font-mono font-semibold">{entryToDelete?.orderId}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteEntry}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
