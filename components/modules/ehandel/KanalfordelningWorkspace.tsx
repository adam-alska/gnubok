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
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
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
  BarChart3,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ChannelData {
  id: string
  channel: string
  revenue: number
  costs: number
  margin: number
  marginPercent: number
  orders: number
  aov: number
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
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

const DEFAULT_CHANNELS: ChannelData[] = [
  { id: '1', channel: 'Webbshop (egen)', revenue: 840000, costs: 504000, margin: 336000, marginPercent: 40.0, orders: 1200, aov: 700 },
  { id: '2', channel: 'Shopify POS', revenue: 108000, costs: 70200, margin: 37800, marginPercent: 35.0, orders: 180, aov: 600 },
  { id: '3', channel: 'Amazon', revenue: 72000, costs: 50400, margin: 21600, marginPercent: 30.0, orders: 120, aov: 600 },
  { id: '4', channel: 'Instagram Shop', revenue: 47500, costs: 30875, margin: 16625, marginPercent: 35.0, orders: 95, aov: 500 },
  { id: '5', channel: 'Facebook Marketplace', revenue: 33000, costs: 23100, margin: 9900, marginPercent: 30.0, orders: 60, aov: 550 },
  { id: '6', channel: 'CDON', revenue: 25000, costs: 18750, margin: 6250, marginPercent: 25.0, orders: 50, aov: 500 },
]

const EMPTY_FORM = {
  channel: '',
  revenue: '',
  costs: '',
  orders: '',
}

export function KanalfordelningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [channels, setChannels] = useState<ChannelData[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<ChannelData | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [channelToDelete, setChannelToDelete] = useState<ChannelData | null>(null)

  const saveChannels = useCallback(async (newChannels: ChannelData[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'channels', config_value: newChannels },
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
      .eq('config_key', 'channels').maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setChannels(data.config_value as ChannelData[])
    } else {
      setChannels(DEFAULT_CHANNELS)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'channels', config_value: DEFAULT_CHANNELS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalRevenue = useMemo(() => channels.reduce((s, c) => s + c.revenue, 0), [channels])
  const totalCosts = useMemo(() => channels.reduce((s, c) => s + c.costs, 0), [channels])
  const totalMargin = useMemo(() => channels.reduce((s, c) => s + c.margin, 0), [channels])
  const overallMarginPct = useMemo(() => totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0, [totalRevenue, totalMargin])
  const totalOrders = useMemo(() => channels.reduce((s, c) => s + c.orders, 0), [channels])
  const bestMarginChannel = useMemo(() => channels.length > 0 ? channels.reduce((a, b) => a.marginPercent > b.marginPercent ? a : b) : null, [channels])

  function openNewChannel() {
    setEditingChannel(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditChannel(ch: ChannelData) {
    setEditingChannel(ch)
    setForm({
      channel: ch.channel,
      revenue: String(ch.revenue),
      costs: String(ch.costs),
      orders: String(ch.orders),
    })
    setDialogOpen(true)
  }

  async function handleSaveChannel() {
    const revenue = parseFloat(form.revenue)
    const costs = parseFloat(form.costs)
    const orders = parseInt(form.orders, 10)
    if (!form.channel.trim() || isNaN(revenue) || isNaN(costs) || isNaN(orders)) return

    const margin = revenue - costs
    const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0
    const aov = orders > 0 ? revenue / orders : 0

    const newChannel: ChannelData = {
      id: editingChannel?.id ?? generateId(),
      channel: form.channel.trim(),
      revenue,
      costs,
      margin,
      marginPercent,
      orders,
      aov,
    }

    let updated: ChannelData[]
    if (editingChannel) {
      updated = channels.map((c) => c.id === editingChannel.id ? newChannel : c)
    } else {
      updated = [...channels, newChannel]
    }

    setChannels(updated)
    setDialogOpen(false)
    await saveChannels(updated)
  }

  async function handleDeleteChannel() {
    if (!channelToDelete) return
    const updated = channels.filter((c) => c.id !== channelToDelete.id)
    setChannels(updated)
    setDeleteDialogOpen(false)
    setChannelToDelete(null)
    await saveChannels(updated)
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
            <Button onClick={openNewChannel}>
              <Plus className="mr-2 h-4 w-4" />
              Ny kanal
            </Button>
          </div>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="detalj">Detaljvy</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : channels.length === 0 ? (
              <EmptyModuleState
                icon={BarChart3}
                title="Inga försäljningskanaler"
                description="Lägg till kanaler för att se fördelning."
                actionLabel="Ny kanal"
                onAction={openNewChannel}
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <KPICard label="Total omsättning" value={fmt(totalRevenue)} unit="kr" />
                  <KPICard label="Total marginal" value={fmt(totalMargin)} unit="kr" />
                  <KPICard label="Marginalprocent" value={fmtPct(overallMarginPct)} unit="%" />
                  <KPICard label="Totala ordrar" value={fmt(totalOrders)} unit="st" />
                  <KPICard label="Bästa marginal" value={bestMarginChannel ? `${fmtPct(bestMarginChannel.marginPercent)}%` : '-'} unit={bestMarginChannel?.channel ?? ''} />
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Omsättningsfördelning per kanal</h3>
                  {channels.sort((a, b) => b.revenue - a.revenue).map((c) => (
                    <div key={c.id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{c.channel}</span>
                        <span className="tabular-nums">{fmt(c.revenue)} kr ({fmtPct(totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0)}%)</span>
                      </div>
                      <Progress value={totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0} className="h-2" />
                    </div>
                  ))}
                </div>

                {saving && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sparar...
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="detalj" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Kanal</TableHead>
                      <TableHead className="font-medium text-right">Omsättning</TableHead>
                      <TableHead className="font-medium text-right">Kostnader</TableHead>
                      <TableHead className="font-medium text-right">Marginal</TableHead>
                      <TableHead className="font-medium text-right">Marginal %</TableHead>
                      <TableHead className="font-medium text-right">Ordrar</TableHead>
                      <TableHead className="font-medium text-right">AOV</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channels.sort((a, b) => b.revenue - a.revenue).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.channel}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.revenue)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.costs)} kr</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmt(c.margin)} kr</TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${c.marginPercent >= 35 ? 'text-emerald-600' : c.marginPercent >= 25 ? 'text-amber-600' : 'text-red-600'}`}>
                          {fmtPct(c.marginPercent)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.orders)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.aov)} kr</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditChannel(c)} title="Redigera">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setChannelToDelete(c); setDeleteDialogOpen(true) }} title="Ta bort">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
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
            <DialogTitle>{editingChannel ? 'Redigera kanal' : 'Ny kanal'}</DialogTitle>
            <DialogDescription>
              {editingChannel ? 'Uppdatera kanalens siffror.' : 'Lägg till en ny försäljningskanal.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Kanalnamn *</Label>
              <Input value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} placeholder="Webbshop" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Omsättning (kr) *</Label>
                <Input type="number" min={0} value={form.revenue} onChange={(e) => setForm((f) => ({ ...f, revenue: e.target.value }))} placeholder="840000" />
              </div>
              <div className="grid gap-2">
                <Label>Kostnader (kr) *</Label>
                <Input type="number" min={0} value={form.costs} onChange={(e) => setForm((f) => ({ ...f, costs: e.target.value }))} placeholder="504000" />
              </div>
              <div className="grid gap-2">
                <Label>Ordrar *</Label>
                <Input type="number" min={0} value={form.orders} onChange={(e) => setForm((f) => ({ ...f, orders: e.target.value }))} placeholder="1200" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveChannel} disabled={!form.channel.trim() || !form.revenue || !form.costs || !form.orders}>
              {editingChannel ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort kanal</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort{' '}
              <span className="font-semibold">{channelToDelete?.channel}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteChannel}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
