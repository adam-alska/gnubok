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
  Armchair,
  TrendingUp,
  Lightbulb,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Station {
  id: string
  name: string
  stylistName: string
}

interface StationRevenue {
  stationId: string
  stationName: string
  stylistName: string
  date: string
  revenue: number
  bookings: number
  hoursWorked: number
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function startOfWeek(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

export function IntaktPerStolWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stations, setStations] = useState<Station[]>([])
  const [revenues, setRevenues] = useState<StationRevenue[]>([])
  const [from, setFrom] = useState(startOfWeek)
  const [to, setTo] = useState(todayStr)

  const [stationDialogOpen, setStationDialogOpen] = useState(false)
  const [stationForm, setStationForm] = useState({ name: '', stylistName: '' })

  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false)
  const [revenueForm, setRevenueForm] = useState({ stationId: '', date: todayStr(), revenue: 0, bookings: 0, hoursWorked: 8 })

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

    const { data: stationData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'stations')
      .maybeSingle()

    if (stationData?.config_value && Array.isArray(stationData.config_value)) {
      setStations(stationData.config_value as Station[])
    }

    const { data: revData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'station_revenues')
      .maybeSingle()

    if (revData?.config_value && Array.isArray(revData.config_value)) {
      setRevenues(revData.config_value as StationRevenue[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredRevenues = useMemo(() => {
    return revenues.filter((r) => r.date >= from && r.date <= to)
  }, [revenues, from, to])

  const stationSummaries = useMemo(() => {
    const map: Record<string, { revenue: number; bookings: number; hours: number; days: number }> = {}
    for (const r of filteredRevenues) {
      if (!map[r.stationId]) map[r.stationId] = { revenue: 0, bookings: 0, hours: 0, days: 0 }
      map[r.stationId].revenue += r.revenue
      map[r.stationId].bookings += r.bookings
      map[r.stationId].hours += r.hoursWorked
      map[r.stationId].days += 1
    }

    return stations.map((s) => {
      const data = map[s.id] ?? { revenue: 0, bookings: 0, hours: 0, days: 0 }
      return {
        ...s,
        ...data,
        revenuePerHour: data.hours > 0 ? data.revenue / data.hours : 0,
        avgBookingsPerDay: data.days > 0 ? data.bookings / data.days : 0,
        utilization: data.hours > 0 ? Math.min((data.bookings * 1.5) / data.hours * 100, 100) : 0,
      }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [stations, filteredRevenues])

  const totalRevenue = stationSummaries.reduce((s, st) => s + st.revenue, 0)
  const totalBookings = stationSummaries.reduce((s, st) => s + st.bookings, 0)
  const avgUtilization = stationSummaries.length > 0 ? stationSummaries.reduce((s, st) => s + st.utilization, 0) / stationSummaries.length : 0
  const bestStation = stationSummaries[0]

  async function handleSaveStation() {
    const newStation: Station = {
      id: generateId(),
      name: stationForm.name.trim(),
      stylistName: stationForm.stylistName.trim(),
    }
    const updated = [...stations, newStation]
    setStations(updated)
    setStationDialogOpen(false)
    setStationForm({ name: '', stylistName: '' })
    await saveData('stations', updated)
  }

  async function handleSaveRevenue() {
    const station = stations.find((s) => s.id === revenueForm.stationId)
    if (!station) return

    const newEntry: StationRevenue = {
      stationId: station.id,
      stationName: station.name,
      stylistName: station.stylistName,
      date: revenueForm.date,
      revenue: revenueForm.revenue,
      bookings: revenueForm.bookings,
      hoursWorked: revenueForm.hoursWorked,
    }

    const updated = [...revenues, newEntry]
    setRevenues(updated)
    setRevenueDialogOpen(false)
    setRevenueForm({ stationId: '', date: todayStr(), revenue: 0, bookings: 0, hoursWorked: 8 })
    await saveData('station_revenues', updated)
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
              <TabsTrigger value="stolar">Stolöversikt</TabsTrigger>
              <TabsTrigger value="tips">Optimeringsförslag</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total intäkt" value={fmt(totalRevenue)} unit="kr" />
                <KPICard label="Totala bokningar" value={String(totalBookings)} unit="st" />
                <KPICard label="Snitt beläggning" value={fmtPct(avgUtilization)} unit="%" />
                <KPICard label="Bästa stol" value={bestStation?.name ?? '-'} unit={bestStation ? `${fmt(bestStation.revenue)} kr` : ''} />
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={() => setStationDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Ny stol/station
                </Button>
                <Button variant="outline" onClick={() => { setRevenueForm((f) => ({ ...f, stationId: stations[0]?.id ?? '' })); setRevenueDialogOpen(true) }} disabled={stations.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />
                  Registrera intäkt
                </Button>
              </div>

              {stationSummaries.length === 0 || totalRevenue === 0 ? (
                <EmptyModuleState
                  icon={Armchair}
                  title="Ingen data"
                  description="Lägg till stolar/stationer och registrera dagliga intäkter för att se rapporter."
                  actionLabel="Ny stol"
                  onAction={() => setStationDialogOpen(true)}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Stol</TableHead>
                        <TableHead className="font-medium">Stylist</TableHead>
                        <TableHead className="font-medium text-right">Intäkt</TableHead>
                        <TableHead className="font-medium text-right">Bokningar</TableHead>
                        <TableHead className="font-medium text-right">Kr/timme</TableHead>
                        <TableHead className="font-medium text-right">Beläggning</TableHead>
                        <TableHead className="font-medium">Andel av total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stationSummaries.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.stylistName}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(s.revenue)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{s.bookings}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(s.revenuePerHour)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtPct(s.utilization)}%</TableCell>
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

            <TabsContent value="stolar" className="space-y-6">
              {stationSummaries.length === 0 ? (
                <EmptyModuleState
                  icon={Armchair}
                  title="Inga stolar"
                  description="Lägg till salongens stolar/stationer."
                  actionLabel="Ny stol"
                  onAction={() => setStationDialogOpen(true)}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stationSummaries.map((s) => (
                    <Card key={s.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium">{s.name}</CardTitle>
                          <Badge variant="outline">{s.stylistName}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Intäkt</span>
                          <span className="tabular-nums font-medium">{fmt(s.revenue)} kr</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Bokningar</span>
                          <span className="tabular-nums">{s.bookings} st</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Kr/timme</span>
                          <span className="tabular-nums">{fmt(s.revenuePerHour)} kr</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Beläggning</span>
                            <span>{fmtPct(s.utilization)}%</span>
                          </div>
                          <Progress value={s.utilization} className="h-2" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="tips" className="space-y-6">
              <div className="grid gap-4 max-w-2xl">
                {stationSummaries.filter((s) => s.utilization < 60).length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        <CardTitle className="text-sm">Låg beläggning</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {stationSummaries.filter((s) => s.utilization < 60).map((s) => s.name).join(', ')} har under 60% beläggning.
                      Överväg att erbjuda rabatterade tider, marknadsföra lediga tider via sociala medier, eller omfördela bokningar.
                    </CardContent>
                  </Card>
                )}
                {stationSummaries.length >= 2 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        <CardTitle className="text-sm">Intäktsskillnad mellan stolar</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {bestStation && stationSummaries[stationSummaries.length - 1] && bestStation.revenue > 0 ? (
                        <>
                          Största skillnad: {bestStation.name} ({fmt(bestStation.revenue)} kr) vs {stationSummaries[stationSummaries.length - 1].name} ({fmt(stationSummaries[stationSummaries.length - 1].revenue)} kr).
                          Analysera vad som gör toppstolen framgångsrik och tillämpa lärdomar.
                        </>
                      ) : (
                        'Lägg till fler datapunkter för att se jämförelser mellan stolar.'
                      )}
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-blue-500" />
                      <CardTitle className="text-sm">Generella tips</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>Optimera stolens intäkt genom att minska luckor mellan bokningar.</p>
                    <p>Uppmuntra merförsäljning av produkter vid varje besök.</p>
                    <p>Analysera vilka dagar och tider som genererar mest intäkt per stol.</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={stationDialogOpen} onOpenChange={setStationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny stol/station</DialogTitle>
            <DialogDescription>Lägg till en ny stol eller station i salongen.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="station-name">Stationsnamn *</Label>
              <Input
                id="station-name"
                value={stationForm.name}
                onChange={(e) => setStationForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Stol 1"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="station-stylist">Ansvarig stylist</Label>
              <Input
                id="station-stylist"
                value={stationForm.stylistName}
                onChange={(e) => setStationForm((f) => ({ ...f, stylistName: e.target.value }))}
                placeholder="Anna Andersson"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStationDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveStation} disabled={!stationForm.name.trim()}>Lägg till</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revenueDialogOpen} onOpenChange={setRevenueDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrera intäkt</DialogTitle>
            <DialogDescription>Ange dagens intäkt och bokningar per stol.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rev-station">Stol *</Label>
                <Select
                  value={revenueForm.stationId}
                  onValueChange={(val) => setRevenueForm((f) => ({ ...f, stationId: val }))}
                >
                  <SelectTrigger id="rev-station">
                    <SelectValue placeholder="Välj stol" />
                  </SelectTrigger>
                  <SelectContent>
                    {stations.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rev-date">Datum</Label>
                <Input
                  id="rev-date"
                  type="date"
                  value={revenueForm.date}
                  onChange={(e) => setRevenueForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rev-amount">Intäkt (kr)</Label>
                <Input
                  id="rev-amount"
                  type="number"
                  min={0}
                  value={revenueForm.revenue}
                  onChange={(e) => setRevenueForm((f) => ({ ...f, revenue: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rev-bookings">Bokningar</Label>
                <Input
                  id="rev-bookings"
                  type="number"
                  min={0}
                  value={revenueForm.bookings}
                  onChange={(e) => setRevenueForm((f) => ({ ...f, bookings: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rev-hours">Timmar</Label>
                <Input
                  id="rev-hours"
                  type="number"
                  min={0}
                  step={0.5}
                  value={revenueForm.hoursWorked}
                  onChange={(e) => setRevenueForm((f) => ({ ...f, hoursWorked: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevenueDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveRevenue} disabled={!revenueForm.stationId}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
