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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Loader2,
  PieChart,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface StylistEntry {
  id: string
  name: string
}

interface MonthlyData {
  stylistId: string
  stylistName: string
  month: string
  revenue: number
  commission: number
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

export function ProvisionsandelWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stylists, setStylists] = useState<StylistEntry[]>([])
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)

  const [stylistDialogOpen, setStylistDialogOpen] = useState(false)
  const [stylistForm, setStylistForm] = useState({ name: '' })

  const [dataDialogOpen, setDataDialogOpen] = useState(false)
  const [dataForm, setDataForm] = useState({ stylistId: '', revenue: 0, commission: 0 })

  const saveData = useCallback(async (key: string, value: unknown) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: key,
        config_value: value,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: sData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'report_stylists')
      .maybeSingle()

    if (sData?.config_value && Array.isArray(sData.config_value)) {
      setStylists(sData.config_value as StylistEntry[])
    }

    const { data: mData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'monthly_data')
      .maybeSingle()

    if (mData?.config_value && Array.isArray(mData.config_value)) {
      setMonthlyData(mData.config_value as MonthlyData[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const currentMonthData = useMemo(() => {
    return monthlyData.filter((d) => d.month === selectedMonth)
  }, [monthlyData, selectedMonth])

  const previousMonthData = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const prevDate = new Date(year, month - 2, 1)
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    return monthlyData.filter((d) => d.month === prevMonth)
  }, [monthlyData, selectedMonth])

  const summaries = useMemo(() => {
    return stylists.map((s) => {
      const current = currentMonthData.find((d) => d.stylistId === s.id)
      const previous = previousMonthData.find((d) => d.stylistId === s.id)
      const pct = current && current.revenue > 0 ? (current.commission / current.revenue) * 100 : 0
      const prevPct = previous && previous.revenue > 0 ? (previous.commission / previous.revenue) * 100 : null
      const trend = prevPct !== null ? pct - prevPct : null
      return {
        ...s,
        revenue: current?.revenue ?? 0,
        commission: current?.commission ?? 0,
        pct,
        prevPct,
        trend,
        profitable: current ? current.revenue - current.commission : 0,
      }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [stylists, currentMonthData, previousMonthData])

  const totalRevenue = summaries.reduce((s, st) => s + st.revenue, 0)
  const totalCommission = summaries.reduce((s, st) => s + st.commission, 0)
  const avgPct = totalRevenue > 0 ? (totalCommission / totalRevenue) * 100 : 0

  const trendData = useMemo(() => {
    const months: string[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months.map((m) => {
      const data = monthlyData.filter((d) => d.month === m)
      const rev = data.reduce((s, d) => s + d.revenue, 0)
      const com = data.reduce((s, d) => s + d.commission, 0)
      return { month: m, revenue: rev, commission: com, pct: rev > 0 ? (com / rev) * 100 : 0 }
    })
  }, [monthlyData])

  async function handleAddStylist() {
    const newStylist: StylistEntry = { id: generateId(), name: stylistForm.name.trim() }
    const updated = [...stylists, newStylist]
    setStylists(updated)
    setStylistDialogOpen(false)
    setStylistForm({ name: '' })
    await saveData('report_stylists', updated)
  }

  async function handleAddData() {
    const stylist = stylists.find((s) => s.id === dataForm.stylistId)
    if (!stylist) return

    const newEntry: MonthlyData = {
      stylistId: stylist.id,
      stylistName: stylist.name,
      month: selectedMonth,
      revenue: dataForm.revenue,
      commission: dataForm.commission,
    }

    const filtered = monthlyData.filter((d) => !(d.stylistId === stylist.id && d.month === selectedMonth))
    const updated = [...filtered, newEntry]
    setMonthlyData(updated)
    setDataDialogOpen(false)
    setDataForm({ stylistId: '', revenue: 0, commission: 0 })
    await saveData('monthly_data', updated)
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
          <Input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 w-44"
          />
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
              <TabsTrigger value="trend">Trendanalys</TabsTrigger>
              <TabsTrigger value="lonsamhet">Lönsamhet</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total intäkt" value={fmt(totalRevenue)} unit="kr" />
                <KPICard label="Total provision" value={fmt(totalCommission)} unit="kr" />
                <KPICard label="Provisionsandel" value={fmtPct(avgPct)} unit="%" />
                <KPICard label="Antal stylister" value={String(stylists.length)} unit="st" />
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={() => setStylistDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Ny stylist
                </Button>
                <Button variant="outline" onClick={() => { setDataForm((f) => ({ ...f, stylistId: stylists[0]?.id ?? '' })); setDataDialogOpen(true) }} disabled={stylists.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />
                  Registrera data
                </Button>
              </div>

              {summaries.length === 0 || totalRevenue === 0 ? (
                <EmptyModuleState
                  icon={PieChart}
                  title="Ingen provisionsdata"
                  description="Lägg till stylister och registrera månadsdata för att se provisionsandelen."
                  actionLabel="Ny stylist"
                  onAction={() => setStylistDialogOpen(true)}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Stylist</TableHead>
                        <TableHead className="font-medium text-right">Intäkt</TableHead>
                        <TableHead className="font-medium text-right">Provision</TableHead>
                        <TableHead className="font-medium text-right">Andel %</TableHead>
                        <TableHead className="font-medium text-right">Trend</TableHead>
                        <TableHead className="font-medium">Andel av total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaries.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(s.revenue)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(s.commission)} kr</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtPct(s.pct)}%</TableCell>
                          <TableCell className="text-right">
                            {s.trend !== null ? (
                              <div className={cn(
                                'flex items-center justify-end gap-1 text-xs font-medium',
                                s.trend < -1 ? 'text-emerald-600' : s.trend > 1 ? 'text-red-500' : 'text-muted-foreground'
                              )}>
                                {s.trend < -1 ? <TrendingDown className="h-3 w-3" /> : s.trend > 1 ? <TrendingUp className="h-3 w-3" /> : null}
                                {s.trend > 0 ? '+' : ''}{fmtPct(s.trend)} pp
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0} className="h-2 flex-1" />
                              <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                                {totalRevenue > 0 ? fmtPct((s.revenue / totalRevenue) * 100) : '0'}%
                              </span>
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

            <TabsContent value="trend" className="space-y-6">
              {trendData.every((d) => d.revenue === 0) ? (
                <EmptyModuleState
                  icon={PieChart}
                  title="Ingen trenddata"
                  description="Registrera månadsdata för minst 2 månader för att se trender."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Månad</TableHead>
                        <TableHead className="font-medium text-right">Intäkt</TableHead>
                        <TableHead className="font-medium text-right">Provision</TableHead>
                        <TableHead className="font-medium text-right">Provisionsandel</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trendData.map((d) => (
                        <TableRow key={d.month}>
                          <TableCell>{d.month}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(d.revenue)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(d.commission)} kr</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtPct(d.pct)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="lonsamhet" className="space-y-6">
              {summaries.length === 0 ? (
                <EmptyModuleState
                  icon={PieChart}
                  title="Ingen data"
                  description="Registrera intäkt- och provisionsdata för att se lönsamhet per anställd."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {summaries.map((s) => (
                    <Card key={s.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">{s.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Intäkt</span>
                          <span className="tabular-nums font-medium">{fmt(s.revenue)} kr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Provision</span>
                          <span className="tabular-nums">{fmt(s.commission)} kr</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Provisionsandel</span>
                          <span className="tabular-nums">{fmtPct(s.pct)}%</span>
                        </div>
                        <div className="border-t border-border pt-2 flex justify-between font-semibold">
                          <span>Kvarvarande</span>
                          <span className={cn('tabular-nums', s.profitable >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {fmt(s.profitable)} kr
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={stylistDialogOpen} onOpenChange={setStylistDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ny stylist</DialogTitle>
            <DialogDescription>Lägg till en stylist för provisionsuppföljning.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ps-name">Namn *</Label>
              <Input
                id="ps-name"
                value={stylistForm.name}
                onChange={(e) => setStylistForm({ name: e.target.value })}
                placeholder="Anna Andersson"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStylistDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleAddStylist} disabled={!stylistForm.name.trim()}>Lägg till</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dataDialogOpen} onOpenChange={setDataDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrera månadsdata</DialogTitle>
            <DialogDescription>Ange intäkt och utbetald provision för {selectedMonth}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pd-stylist">Stylist *</Label>
              <Select
                value={dataForm.stylistId}
                onValueChange={(val) => setDataForm((f) => ({ ...f, stylistId: val }))}
              >
                <SelectTrigger id="pd-stylist">
                  <SelectValue placeholder="Välj stylist" />
                </SelectTrigger>
                <SelectContent>
                  {stylists.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pd-revenue">Intäkt (kr)</Label>
                <Input
                  id="pd-revenue"
                  type="number"
                  min={0}
                  value={dataForm.revenue}
                  onChange={(e) => setDataForm((f) => ({ ...f, revenue: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pd-commission">Provision (kr)</Label>
                <Input
                  id="pd-commission"
                  type="number"
                  min={0}
                  value={dataForm.commission}
                  onChange={(e) => setDataForm((f) => ({ ...f, commission: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDataDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleAddData} disabled={!dataForm.stylistId}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
