'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
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
  Pencil,
  Trash2,
  Loader2,
  Repeat,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type SubscriptionStatus = 'Aktiv' | 'Churnad' | 'Pausad'

interface Subscription {
  id: string
  customerName: string
  plan: string
  mrrAmount: number
  startDate: string
  status: SubscriptionStatus
  expansionRevenue: number
}

interface MonthlyMrr {
  month: string
  newMrr: number
  expansionMrr: number
  churnedMrr: number
  netMrr: number
  totalMrr: number
}

const DEFAULT_SUBSCRIPTIONS: Subscription[] = [
  { id: '1', customerName: 'Acme AB', plan: 'Enterprise', mrrAmount: 25000, startDate: '2023-01-15', status: 'Aktiv', expansionRevenue: 5000 },
  { id: '2', customerName: 'Beta Corp', plan: 'Pro', mrrAmount: 8000, startDate: '2023-06-01', status: 'Aktiv', expansionRevenue: 2000 },
  { id: '3', customerName: 'Gamma Gruppen', plan: 'Pro', mrrAmount: 8000, startDate: '2023-03-10', status: 'Aktiv', expansionRevenue: 0 },
  { id: '4', customerName: 'Delta AB', plan: 'Start', mrrAmount: 3000, startDate: '2024-01-01', status: 'Aktiv', expansionRevenue: 0 },
  { id: '5', customerName: 'Epsilon Tech', plan: 'Enterprise', mrrAmount: 20000, startDate: '2022-08-15', status: 'Churnad', expansionRevenue: 0 },
  { id: '6', customerName: 'Zeta Solutions', plan: 'Pro', mrrAmount: 8000, startDate: '2024-02-01', status: 'Aktiv', expansionRevenue: 1000 },
]

const DEFAULT_MONTHLY: MonthlyMrr[] = [
  { month: '2024-01', newMrr: 3000, expansionMrr: 2000, churnedMrr: 0, netMrr: 5000, totalMrr: 52000 },
  { month: '2024-02', newMrr: 8000, expansionMrr: 1000, churnedMrr: 0, netMrr: 9000, totalMrr: 61000 },
  { month: '2024-03', newMrr: 0, expansionMrr: 3000, churnedMrr: 20000, netMrr: -17000, totalMrr: 44000 },
  { month: '2024-04', newMrr: 5000, expansionMrr: 2000, churnedMrr: 0, netMrr: 7000, totalMrr: 51000 },
  { month: '2024-05', newMrr: 0, expansionMrr: 0, churnedMrr: 0, netMrr: 0, totalMrr: 51000 },
  { month: '2024-06', newMrr: 12000, expansionMrr: 5000, churnedMrr: 0, netMrr: 17000, totalMrr: 68000 },
]

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  Aktiv: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  Churnad: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  Pausad: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const STATUSES: SubscriptionStatus[] = ['Aktiv', 'Churnad', 'Pausad']

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM: Omit<Subscription, 'id'> = {
  customerName: '',
  plan: 'Pro',
  mrrAmount: 0,
  startDate: new Date().toISOString().slice(0, 10),
  status: 'Aktiv',
  expansionRevenue: 0,
}

export function MrrArrWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [monthly, setMonthly] = useState<MonthlyMrr[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Subscription | null>(null)

  const saveData = useCallback(async (subs: Subscription[], monthlyEntries?: MonthlyMrr[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'subscriptions',
        config_value: subs,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )

    if (monthlyEntries) {
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'monthly_mrr',
          config_value: monthlyEntries,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: subData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'subscriptions')
      .maybeSingle()

    if (subData?.config_value && Array.isArray(subData.config_value) && subData.config_value.length > 0) {
      setSubscriptions(subData.config_value as Subscription[])
    } else {
      setSubscriptions(DEFAULT_SUBSCRIPTIONS)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'subscriptions',
          config_value: DEFAULT_SUBSCRIPTIONS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: monthData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'monthly_mrr')
      .maybeSingle()

    if (monthData?.config_value && Array.isArray(monthData.config_value) && monthData.config_value.length > 0) {
      setMonthly(monthData.config_value as MonthlyMrr[])
    } else {
      setMonthly(DEFAULT_MONTHLY)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'monthly_mrr',
          config_value: DEFAULT_MONTHLY,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = useMemo(() => {
    const activeSubs = subscriptions.filter((s) => s.status === 'Aktiv')
    const currentMrr = activeSubs.reduce((s, sub) => s + sub.mrrAmount + sub.expansionRevenue, 0)
    const arr = currentMrr * 12
    const churnedMrr = subscriptions.filter((s) => s.status === 'Churnad').reduce((s, sub) => s + sub.mrrAmount, 0)
    const totalMrrEver = subscriptions.reduce((s, sub) => s + sub.mrrAmount, 0)
    const churnRate = totalMrrEver > 0 ? (churnedMrr / totalMrrEver) * 100 : 0
    const expansionRevenue = activeSubs.reduce((s, sub) => s + sub.expansionRevenue, 0)

    // Growth rate from monthly data
    let growthRate = 0
    if (monthly.length >= 2) {
      const lastTwo = monthly.slice(-2)
      if (lastTwo[0].totalMrr > 0) {
        growthRate = ((lastTwo[1].totalMrr - lastTwo[0].totalMrr) / lastTwo[0].totalMrr) * 100
      }
    }

    return { currentMrr, arr, churnedMrr, churnRate, expansionRevenue, activeCount: activeSubs.length, growthRate }
  }, [subscriptions, monthly])

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(sub: Subscription) {
    setEditing(sub)
    setForm({
      customerName: sub.customerName,
      plan: sub.plan,
      mrrAmount: sub.mrrAmount,
      startDate: sub.startDate,
      status: sub.status,
      expansionRevenue: sub.expansionRevenue,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: Subscription = {
      id: editing?.id ?? crypto.randomUUID(),
      ...form,
      customerName: form.customerName.trim(),
    }
    let updated: Subscription[]
    if (editing) {
      updated = subscriptions.map((s) => (s.id === editing.id ? item : s))
    } else {
      updated = [...subscriptions, item]
    }
    setSubscriptions(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = subscriptions.filter((s) => s.id !== toDelete.id)
    setSubscriptions(updated)
    setDeleteDialogOpen(false)
    setToDelete(null)
    await saveData(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Tech & IT"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt abonnemang
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList>
              <TabsTrigger value="oversikt">Översikt</TabsTrigger>
              <TabsTrigger value="abonnemang">Abonnemang</TabsTrigger>
              <TabsTrigger value="trend">Månadstrend</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="MRR" value={fmt(kpis.currentMrr)} unit="kr/mån" />
                <KPICard label="ARR" value={fmt(kpis.arr)} unit="kr/år" />
                <KPICard
                  label="Tillväxt"
                  value={fmtPct(kpis.growthRate)}
                  unit="%"
                  trend={kpis.growthRate > 0 ? 'up' : kpis.growthRate < 0 ? 'down' : 'neutral'}
                  trendLabel="MoM"
                />
                <KPICard
                  label="Churn rate"
                  value={fmtPct(kpis.churnRate)}
                  unit="%"
                  trend={kpis.churnRate > 5 ? 'down' : 'up'}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <KPICard label="Aktiva kunder" value={String(kpis.activeCount)} unit="st" />
                <KPICard label="Expansion MRR" value={fmt(kpis.expansionRevenue)} unit="kr/mån" />
                <KPICard label="Churnad MRR" value={fmt(kpis.churnedMrr)} unit="kr/mån" />
              </div>
            </TabsContent>

            <TabsContent value="abonnemang" className="space-y-4">
              {subscriptions.length === 0 ? (
                <EmptyModuleState
                  icon={Repeat}
                  title="Inga abonnemang"
                  description="Lägg till SaaS-abonnemang för att börja tracka MRR/ARR."
                  actionLabel="Nytt abonnemang"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium">Plan</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium">Startdatum</TableHead>
                        <TableHead className="font-medium text-right">MRR</TableHead>
                        <TableHead className="font-medium text-right">Expansion</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subscriptions.map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">{sub.customerName}</TableCell>
                          <TableCell><Badge variant="outline">{sub.plan}</Badge></TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_COLORS[sub.status]}>{sub.status}</Badge>
                          </TableCell>
                          <TableCell>{sub.startDate}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(sub.mrrAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(sub.expansionRevenue)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(sub)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(sub); setDeleteDialogOpen(true) }} title="Ta bort">
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
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="trend" className="space-y-4">
              {monthly.length === 0 ? (
                <EmptyModuleState
                  icon={Repeat}
                  title="Ingen trenddata"
                  description="Månatlig MRR-data visas här när den finns tillgänglig."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Månad</TableHead>
                        <TableHead className="font-medium text-right">Ny MRR</TableHead>
                        <TableHead className="font-medium text-right">Expansion</TableHead>
                        <TableHead className="font-medium text-right">Churn</TableHead>
                        <TableHead className="font-medium text-right">Netto</TableHead>
                        <TableHead className="font-medium text-right">Total MRR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthly.map((m) => (
                        <TableRow key={m.month}>
                          <TableCell className="font-medium">{m.month}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600">+{fmt(m.newMrr)}</TableCell>
                          <TableCell className="text-right tabular-nums text-blue-600">+{fmt(m.expansionMrr)}</TableCell>
                          <TableCell className="text-right tabular-nums text-red-500">-{fmt(m.churnedMrr)}</TableCell>
                          <TableCell className={cn('text-right tabular-nums font-medium', m.netMrr >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {m.netMrr >= 0 ? '+' : ''}{fmt(m.netMrr)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{fmt(m.totalMrr)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Redigera abonnemang' : 'Nytt abonnemang'}</DialogTitle>
            <DialogDescription>{editing ? 'Uppdatera abonnemangsuppgifter.' : 'Lägg till ett nytt SaaS-abonnemang.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kund *</Label>
                <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Acme AB" />
              </div>
              <div className="grid gap-2">
                <Label>Plan</Label>
                <Input value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))} placeholder="Pro" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>MRR (kr)</Label>
                <Input type="number" min={0} value={form.mrrAmount} onChange={(e) => setForm((f) => ({ ...f, mrrAmount: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Expansion (kr)</Label>
                <Input type="number" min={0} value={form.expansionRevenue} onChange={(e) => setForm((f) => ({ ...f, expansionRevenue: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as SubscriptionStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2 max-w-[200px]">
              <Label>Startdatum</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.customerName.trim()}>
              {editing ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort abonnemang</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort abonnemanget för {toDelete?.customerName}? Denna åtgärd kan inte ångras.
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
