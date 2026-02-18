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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Loader2,
  ShoppingBag,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface DailyEntry {
  id: string
  date: string
  totalVisits: number
  productSales: number
  serviceRevenue: number
  visitsWithProduct: number
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
  return Math.random().toString(36).substring(2, 11)
}

export function ProduktforsaljningPerBesokWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<DailyEntry[]>([])
  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)

  const [target, setTarget] = useState<number | null>(null)
  const [targetInput, setTargetInput] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({
    date: todayStr(),
    totalVisits: 0,
    productSales: 0,
    serviceRevenue: 0,
    visitsWithProduct: 0,
  })

  const saveEntries = useCallback(async (data: DailyEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'daily_entries',
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
      .eq('config_key', 'daily_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as DailyEntry[])
    }

    const { data: tgt } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'product_target')
      .maybeSingle()

    if (tgt?.config_value != null) {
      const val = Number(tgt.config_value)
      setTarget(val)
      setTargetInput(String(val))
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => e.date >= from && e.date <= to).sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, from, to])

  const kpis = useMemo(() => {
    const totalVisits = filteredEntries.reduce((s, e) => s + e.totalVisits, 0)
    const totalProductSales = filteredEntries.reduce((s, e) => s + e.productSales, 0)
    const totalServiceRevenue = filteredEntries.reduce((s, e) => s + e.serviceRevenue, 0)
    const totalVisitsWithProduct = filteredEntries.reduce((s, e) => s + e.visitsWithProduct, 0)
    const avgPerVisit = totalVisits > 0 ? totalProductSales / totalVisits : 0
    const productPct = (totalServiceRevenue + totalProductSales) > 0 ? (totalProductSales / (totalServiceRevenue + totalProductSales)) * 100 : 0
    const conversionRate = totalVisits > 0 ? (totalVisitsWithProduct / totalVisits) * 100 : 0
    return { totalVisits, totalProductSales, totalServiceRevenue, avgPerVisit, productPct, conversionRate, totalVisitsWithProduct }
  }, [filteredEntries])

  async function handleSaveEntry() {
    const newEntry: DailyEntry = {
      id: generateId(),
      date: form.date,
      totalVisits: form.totalVisits,
      productSales: form.productSales,
      serviceRevenue: form.serviceRevenue,
      visitsWithProduct: form.visitsWithProduct,
    }

    const existing = entries.filter((e) => e.date !== form.date)
    const updated = [...existing, newEntry]
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  async function handleSaveTarget() {
    const val = parseFloat(targetInput)
    if (isNaN(val)) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'product_target',
        config_value: val,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setTarget(val)
    setSaving(false)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Frisör & Skönhet"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
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
              <TabsTrigger value="daglig">Daglig data</TabsTrigger>
              <TabsTrigger value="installningar">Inställningar</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard
                  label="Snitt per besök"
                  value={fmt(kpis.avgPerVisit)}
                  unit="kr"
                  target={target ?? undefined}
                />
                <KPICard label="Produktförsäljning" value={fmt(kpis.totalProductSales)} unit="kr" />
                <KPICard label="Andel av intäkt" value={fmtPct(kpis.productPct)} unit="%" />
                <KPICard label="Konverteringsgrad" value={fmtPct(kpis.conversionRate)} unit="%" />
                <KPICard label="Totala besök" value={String(kpis.totalVisits)} unit="st" />
              </div>

              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Registrera dagsdata
              </Button>

              {filteredEntries.length === 0 ? (
                <EmptyModuleState
                  icon={ShoppingBag}
                  title="Ingen data för perioden"
                  description="Registrera daglig data med antal besök, produktförsäljning och serviceintäkter."
                  actionLabel="Registrera dagsdata"
                  onAction={() => setDialogOpen(true)}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredEntries.slice(0, 6).map((e) => (
                    <Card key={e.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{e.date}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Besök</span>
                          <span className="tabular-nums">{e.totalVisits} st</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Produktförsäljning</span>
                          <span className="tabular-nums">{fmt(e.productSales)} kr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Snitt per besök</span>
                          <span className="tabular-nums font-medium">{e.totalVisits > 0 ? fmt(e.productSales / e.totalVisits) : '0'} kr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Konvertering</span>
                          <span className="tabular-nums">{e.totalVisits > 0 ? fmtPct((e.visitsWithProduct / e.totalVisits) * 100) : '0'}%</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="daglig" className="space-y-6">
              {filteredEntries.length === 0 ? (
                <EmptyModuleState
                  icon={ShoppingBag}
                  title="Ingen daglig data"
                  description="Registrera data för att se daglig uppföljning av produktförsäljning per besök."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium text-right">Besök</TableHead>
                        <TableHead className="font-medium text-right">Produktförsäljn.</TableHead>
                        <TableHead className="font-medium text-right">Serviceintäkt</TableHead>
                        <TableHead className="font-medium text-right">Snitt/besök</TableHead>
                        <TableHead className="font-medium text-right">Konvertering</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium">{e.date}</TableCell>
                          <TableCell className="text-right tabular-nums">{e.totalVisits}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.productSales)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.serviceRevenue)} kr</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{e.totalVisits > 0 ? fmt(e.productSales / e.totalVisits) : '0'} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{e.totalVisits > 0 ? fmtPct((e.visitsWithProduct / e.totalVisits) * 100) : '0'}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="installningar" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
                <h3 className="text-sm font-semibold">Målvärde produktförsäljning per besök</h3>
                <p className="text-xs text-muted-foreground">
                  Ange ditt mål för snittförsäljning av produkter per kundbesök (kr).
                </p>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mål (kr)</Label>
                    <Input
                      type="number"
                      step="10"
                      min={0}
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      className="h-9 w-32"
                      placeholder="150"
                    />
                  </div>
                  <Button size="sm" onClick={handleSaveTarget} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-3.5 w-3.5" />
                    )}
                    Spara
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrera dagsdata</DialogTitle>
            <DialogDescription>Ange daglig statistik för produktförsäljning per besök.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pf-date">Datum *</Label>
              <Input
                id="pf-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pf-visits">Antal besök</Label>
                <Input
                  id="pf-visits"
                  type="number"
                  min={0}
                  value={form.totalVisits}
                  onChange={(e) => setForm((f) => ({ ...f, totalVisits: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pf-with-product">Besök med produkt</Label>
                <Input
                  id="pf-with-product"
                  type="number"
                  min={0}
                  value={form.visitsWithProduct}
                  onChange={(e) => setForm((f) => ({ ...f, visitsWithProduct: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pf-product">Produktförsäljning (kr)</Label>
                <Input
                  id="pf-product"
                  type="number"
                  min={0}
                  value={form.productSales}
                  onChange={(e) => setForm((f) => ({ ...f, productSales: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pf-service">Serviceintäkt (kr)</Label>
                <Input
                  id="pf-service"
                  type="number"
                  min={0}
                  value={form.serviceRevenue}
                  onChange={(e) => setForm((f) => ({ ...f, serviceRevenue: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveEntry} disabled={form.totalVisits <= 0}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
