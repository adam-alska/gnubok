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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Loader2,
  Receipt,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface DailyReconciliation {
  id: string
  date: string
  zReportTotal: number
  cardAmount: number
  swishAmount: number
  cashAmount: number
  giftCardAmount: number
  totalRegistered: number
  variance: number
  verified: boolean
  note: string
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

const EMPTY_FORM = {
  date: todayStr(),
  zReportTotal: 0,
  cardAmount: 0,
  swishAmount: 0,
  cashAmount: 0,
  giftCardAmount: 0,
  note: '',
}

export function KassaavstamningSalongWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reconciliations, setReconciliations] = useState<DailyReconciliation[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (data: DailyReconciliation[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'reconciliations',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'reconciliations')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setReconciliations(data.config_value as DailyReconciliation[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const registeredTotal = form.cardAmount + form.swishAmount + form.cashAmount + form.giftCardAmount
  const currentVariance = form.zReportTotal - registeredTotal

  const kpis = useMemo(() => {
    const last7 = reconciliations.slice(-7)
    const totalVariance = last7.reduce((s, r) => s + Math.abs(r.variance), 0)
    const avgVariance = last7.length > 0 ? totalVariance / last7.length : 0
    const verifiedCount = last7.filter((r) => r.verified).length
    const totalRevenue = last7.reduce((s, r) => s + r.zReportTotal, 0)
    return { totalVariance, avgVariance, verifiedCount, totalRevenue, days: last7.length }
  }, [reconciliations])

  function openNew() {
    setForm({ ...EMPTY_FORM, date: todayStr() })
    setDialogOpen(true)
  }

  async function handleSave() {
    const totalRegistered = form.cardAmount + form.swishAmount + form.cashAmount + form.giftCardAmount
    const variance = form.zReportTotal - totalRegistered

    const newRec: DailyReconciliation = {
      id: generateId(),
      date: form.date,
      zReportTotal: form.zReportTotal,
      cardAmount: form.cardAmount,
      swishAmount: form.swishAmount,
      cashAmount: form.cashAmount,
      giftCardAmount: form.giftCardAmount,
      totalRegistered: totalRegistered,
      variance,
      verified: Math.abs(variance) < 50,
      note: form.note,
    }

    const existing = reconciliations.filter((r) => r.date !== form.date)
    const updated = [...existing, newRec].sort((a, b) => b.date.localeCompare(a.date))
    setReconciliations(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  async function toggleVerified(id: string) {
    const updated = reconciliations.map((r) =>
      r.id === id ? { ...r, verified: !r.verified } : r
    )
    setReconciliations(updated)
    await saveData(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Frisör & Skönhet"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny avstämning
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="daglig" className="space-y-6">
            <TabsList>
              <TabsTrigger value="daglig">Daglig avstämning</TabsTrigger>
              <TabsTrigger value="historik">Historik</TabsTrigger>
            </TabsList>

            <TabsContent value="daglig" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Senaste 7 dagar" value={fmt(kpis.totalRevenue)} unit="kr" />
                <KPICard label="Snittavvikelse" value={fmt(kpis.avgVariance)} unit="kr" />
                <KPICard label="Verifierade" value={`${kpis.verifiedCount}/${kpis.days}`} unit="dagar" />
                <KPICard
                  label="Total avvikelse"
                  value={fmt(kpis.totalVariance)}
                  unit="kr"
                  trend={kpis.avgVariance < 50 ? 'up' : kpis.avgVariance < 200 ? 'neutral' : 'down'}
                  trendLabel={kpis.avgVariance < 50 ? 'Bra' : kpis.avgVariance < 200 ? 'Godkänt' : 'Hög avvikelse'}
                />
              </div>

              {reconciliations.length === 0 ? (
                <EmptyModuleState
                  icon={Receipt}
                  title="Ingen kassaavstämning"
                  description="Registrera dagens kassaavstämning med Z-rapport, kort, Swish och kontantbelopp."
                  actionLabel="Ny avstämning"
                  onAction={openNew}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {reconciliations.slice(0, 6).map((rec) => (
                    <Card key={rec.id} className={cn(
                      'cursor-pointer transition-colors',
                      rec.verified ? 'border-emerald-200 dark:border-emerald-800' : Math.abs(rec.variance) > 100 ? 'border-red-200 dark:border-red-800' : ''
                    )}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium">{rec.date}</CardTitle>
                          {rec.verified ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Z-rapport</span>
                          <span className="tabular-nums">{fmt(rec.zReportTotal)} kr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Kort</span>
                          <span className="tabular-nums">{fmt(rec.cardAmount)} kr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Swish</span>
                          <span className="tabular-nums">{fmt(rec.swishAmount)} kr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Kontant</span>
                          <span className="tabular-nums">{fmt(rec.cashAmount)} kr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Presentkort</span>
                          <span className="tabular-nums">{fmt(rec.giftCardAmount)} kr</span>
                        </div>
                        <div className="border-t border-border pt-2 flex justify-between font-semibold">
                          <span>Avvikelse</span>
                          <span className={cn(
                            'tabular-nums',
                            Math.abs(rec.variance) < 50 ? 'text-emerald-600' : Math.abs(rec.variance) < 200 ? 'text-amber-600' : 'text-red-600'
                          )}>
                            {rec.variance >= 0 ? '+' : ''}{fmt(rec.variance)} kr
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mt-2"
                          onClick={() => toggleVerified(rec.id)}
                        >
                          {rec.verified ? 'Avmarkera verifierad' : 'Markera som verifierad'}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="historik" className="space-y-6">
              {reconciliations.length === 0 ? (
                <EmptyModuleState
                  icon={Receipt}
                  title="Ingen historik"
                  description="Kassaavstämningar visas här efter att de registreras."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium text-right">Z-rapport</TableHead>
                        <TableHead className="font-medium text-right">Kort</TableHead>
                        <TableHead className="font-medium text-right">Swish</TableHead>
                        <TableHead className="font-medium text-right">Kontant</TableHead>
                        <TableHead className="font-medium text-right">Presentkort</TableHead>
                        <TableHead className="font-medium text-right">Avvikelse</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reconciliations.map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell className="font-medium">{rec.date}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(rec.zReportTotal)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(rec.cardAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(rec.swishAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(rec.cashAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(rec.giftCardAmount)}</TableCell>
                          <TableCell className={cn(
                            'text-right tabular-nums font-medium',
                            Math.abs(rec.variance) < 50 ? 'text-emerald-600' : Math.abs(rec.variance) < 200 ? 'text-amber-600' : 'text-red-600'
                          )}>
                            {rec.variance >= 0 ? '+' : ''}{fmt(rec.variance)} kr
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              label={rec.verified ? 'Verifierad' : 'Ej verifierad'}
                              variant={rec.verified ? 'success' : 'warning'}
                            />
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
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny kassaavstämning</DialogTitle>
            <DialogDescription>Ange belopp från Z-rapport och registrera betalningsmetoder för avstämning.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rec-date">Datum *</Label>
                <Input
                  id="rec-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rec-z">Z-rapport total (kr) *</Label>
                <Input
                  id="rec-z"
                  type="number"
                  min={0}
                  value={form.zReportTotal}
                  onChange={(e) => setForm((f) => ({ ...f, zReportTotal: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rec-card">Kort (kr)</Label>
                <Input
                  id="rec-card"
                  type="number"
                  min={0}
                  value={form.cardAmount}
                  onChange={(e) => setForm((f) => ({ ...f, cardAmount: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rec-swish">Swish (kr)</Label>
                <Input
                  id="rec-swish"
                  type="number"
                  min={0}
                  value={form.swishAmount}
                  onChange={(e) => setForm((f) => ({ ...f, swishAmount: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rec-cash">Kontant (kr)</Label>
                <Input
                  id="rec-cash"
                  type="number"
                  min={0}
                  value={form.cashAmount}
                  onChange={(e) => setForm((f) => ({ ...f, cashAmount: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rec-gift">Presentkort (kr)</Label>
                <Input
                  id="rec-gift"
                  type="number"
                  min={0}
                  value={form.giftCardAmount}
                  onChange={(e) => setForm((f) => ({ ...f, giftCardAmount: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rec-note">Anteckning</Label>
              <Input
                id="rec-note"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Valfri notering"
              />
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Registrerat totalt</span>
                <span className="tabular-nums font-medium">{fmt(registeredTotal)} kr</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avvikelse</span>
                <span className={cn(
                  'tabular-nums font-semibold',
                  Math.abs(currentVariance) < 50 ? 'text-emerald-600' : Math.abs(currentVariance) < 200 ? 'text-amber-600' : 'text-red-600'
                )}>
                  {currentVariance >= 0 ? '+' : ''}{fmt(currentVariance)} kr
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={form.zReportTotal <= 0}>Spara avstämning</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
