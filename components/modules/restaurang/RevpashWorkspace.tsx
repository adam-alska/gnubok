'use client'

import { useEffect, useState, useCallback } from 'react'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { Armchair, Save, Loader2 } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface CapacityRow {
  id: string
  total_seats: number
  lunch_start: string
  lunch_end: string
  dinner_start: string
  dinner_end: string
}

interface DailyRow {
  date: string
  revenue: number
  seats: number
  hoursPerDay: number
  revpash: number
}

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function parseTimeToHours(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h + (m || 0) / 60
}

function calcServiceHours(
  lunchStart: string,
  lunchEnd: string,
  dinnerStart: string,
  dinnerEnd: string
): number {
  const lunchHours = Math.max(0, parseTimeToHours(lunchEnd) - parseTimeToHours(lunchStart))
  const dinnerHours = Math.max(0, parseTimeToHours(dinnerEnd) - parseTimeToHours(dinnerStart))
  return lunchHours + dinnerHours
}

function getDatesInRange(fromStr: string, toStr: string): string[] {
  const dates: string[] = []
  const current = new Date(fromStr + 'T00:00:00')
  const end = new Date(toStr + 'T00:00:00')
  while (current <= end) {
    const y = current.getFullYear()
    const m = String(current.getMonth() + 1).padStart(2, '0')
    const d = String(current.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    current.setDate(current.getDate() + 1)
  }
  return dates
}

const DEFAULT_CAPACITY: Omit<CapacityRow, 'id'> = {
  total_seats: 40,
  lunch_start: '11:00',
  lunch_end: '14:00',
  dinner_start: '17:00',
  dinner_end: '22:00',
}

export function RevpashWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)

  const [totalRevenue, setTotalRevenue] = useState(0)
  const [capacity, setCapacity] = useState<CapacityRow | null>(null)
  const [configForm, setConfigForm] = useState(DEFAULT_CAPACITY)
  const [dailyData, setDailyData] = useState<DailyRow[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Fetch or create restaurant_capacity
    const { data: capRow } = await supabase
      .from('restaurant_capacity')
      .select('*')
      .maybeSingle()

    let activeCapacity: CapacityRow

    if (capRow) {
      activeCapacity = capRow as CapacityRow
      setCapacity(activeCapacity)
      setConfigForm({
        total_seats: activeCapacity.total_seats,
        lunch_start: activeCapacity.lunch_start,
        lunch_end: activeCapacity.lunch_end,
        dinner_start: activeCapacity.dinner_start,
        dinner_end: activeCapacity.dinner_end,
      })
    } else {
      // Insert default row
      const { data: newRow } = await supabase
        .from('restaurant_capacity')
        .insert({
          total_seats: DEFAULT_CAPACITY.total_seats,
          lunch_start: DEFAULT_CAPACITY.lunch_start,
          lunch_end: DEFAULT_CAPACITY.lunch_end,
          dinner_start: DEFAULT_CAPACITY.dinner_start,
          dinner_end: DEFAULT_CAPACITY.dinner_end,
        })
        .select()
        .single()

      activeCapacity = (newRow as CapacityRow) ?? {
        id: '',
        ...DEFAULT_CAPACITY,
      }
      setCapacity(activeCapacity)
      setConfigForm(DEFAULT_CAPACITY)
    }

    // Fetch revenue lines (accounts 3000-3999)
    const { data: revenueLines } = await supabase
      .from('journal_entry_lines')
      .select('credit, journal_entries!inner(date)')
      .like('account_number', '3%')
      .gte('journal_entries.date', from)
      .lte('journal_entries.date', to) as {
      data: { credit: number; journal_entries: { date: string } }[] | null
    }

    const lines = revenueLines ?? []
    const total = lines.reduce((s, l) => s + Number(l.credit), 0)
    setTotalRevenue(total)

    // Daily breakdown
    const hoursPerDay = calcServiceHours(
      activeCapacity.lunch_start,
      activeCapacity.lunch_end,
      activeCapacity.dinner_start,
      activeCapacity.dinner_end
    )
    const seats = activeCapacity.total_seats

    const revenueByDate: Record<string, number> = {}
    for (const l of lines) {
      const date = l.journal_entries.date
      revenueByDate[date] = (revenueByDate[date] ?? 0) + Number(l.credit)
    }

    const dates = getDatesInRange(from, to)
    const daily: DailyRow[] = dates.map((date) => {
      const rev = revenueByDate[date] ?? 0
      return {
        date,
        revenue: rev,
        seats,
        hoursPerDay,
        revpash: seats > 0 && hoursPerDay > 0 ? rev / (seats * hoursPerDay) : 0,
      }
    })
    setDailyData(daily)

    setLoading(false)
  }, [from, to, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    if (capacity?.id) {
      await supabase
        .from('restaurant_capacity')
        .update({
          total_seats: configForm.total_seats,
          lunch_start: configForm.lunch_start,
          lunch_end: configForm.lunch_end,
          dinner_start: configForm.dinner_start,
          dinner_end: configForm.dinner_end,
        })
        .eq('id', capacity.id)
    } else {
      await supabase.from('restaurant_capacity').upsert({
        total_seats: configForm.total_seats,
        lunch_start: configForm.lunch_start,
        lunch_end: configForm.lunch_end,
        dinner_start: configForm.dinner_start,
        dinner_end: configForm.dinner_end,
      })
    }
    setSavingConfig(false)
    fetchData()
  }

  const hoursPerDay = calcServiceHours(
    configForm.lunch_start,
    configForm.lunch_end,
    configForm.dinner_start,
    configForm.dinner_end
  )
  const seats = configForm.total_seats
  const daysInRange = dailyData.length || 1
  const revpash =
    seats > 0 && hoursPerDay > 0 && daysInRange > 0
      ? totalRevenue / (seats * hoursPerDay * daysInRange)
      : 0
  const revenuePerService =
    daysInRange > 0 ? totalRevenue / daysInRange : 0

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="rapport"
      sectorName="Restaurang"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
      actions={
        <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      }
    >
      <Tabs defaultValue="oversikt" className="space-y-6">
        <TabsList>
          <TabsTrigger value="oversikt">Översikt</TabsTrigger>
          <TabsTrigger value="daglig">Daglig</TabsTrigger>
          <TabsTrigger value="installningar">Inställningar</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="oversikt" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : totalRevenue === 0 ? (
            <EmptyModuleState
              icon={Armchair}
              title="Ingen intäktsdata"
              description="Det finns inga bokförda intäkter för vald period. Justera datumfiltret eller importera transaktioner."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard
                label="RevPASH"
                value={fmtDec(revpash)}
                unit="kr/stolstimme"
              />
              <KPICard
                label="Totala platser"
                value={seats}
                unit="platser"
              />
              <KPICard
                label="Intäkt per dag"
                value={fmt(revenuePerService)}
                unit="kr"
              />
              <KPICard
                label="Servicetimmar/dag"
                value={fmtDec(hoursPerDay)}
                unit="h"
              />
            </div>
          )}
        </TabsContent>

        {/* Daily breakdown */}
        <TabsContent value="daglig" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : dailyData.length === 0 ? (
            <EmptyModuleState
              icon={Armchair}
              title="Ingen daglig data"
              description="Inga dagar i vald period."
            />
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Datum</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Intäkt (kr)</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Platser</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Timmar</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">RevPASH (kr)</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.map((d) => (
                    <tr key={d.date} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap">{d.date}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(d.revenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.seats}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtDec(d.hoursPerDay)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {fmtDec(d.revpash)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Configuration */}
        <TabsContent value="installningar" className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-6">
            <div>
              <h3 className="text-sm font-semibold">Kapacitet</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Konfigurera antal sittplatser och servicetider för korrekt RevPASH-beräkning.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Totala sittplatser</Label>
              <Input
                type="number"
                min={1}
                value={configForm.total_seats}
                onChange={(e) =>
                  setConfigForm({ ...configForm, total_seats: parseInt(e.target.value) || 0 })
                }
                className="h-9 w-32"
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Lunch
              </p>
              <div className="flex items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Öppnar</Label>
                  <Input
                    type="time"
                    value={configForm.lunch_start}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, lunch_start: e.target.value })
                    }
                    className="h-9 w-36"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Stänger</Label>
                  <Input
                    type="time"
                    value={configForm.lunch_end}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, lunch_end: e.target.value })
                    }
                    className="h-9 w-36"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Middag
              </p>
              <div className="flex items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Öppnar</Label>
                  <Input
                    type="time"
                    value={configForm.dinner_start}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, dinner_start: e.target.value })
                    }
                    className="h-9 w-36"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Stänger</Label>
                  <Input
                    type="time"
                    value={configForm.dinner_end}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, dinner_end: e.target.value })
                    }
                    className="h-9 w-36"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Beräknade servicetimmar per dag: <span className="font-medium">{fmtDec(hoursPerDay)} h</span>
              </p>
              <Button size="sm" onClick={handleSaveConfig} disabled={savingConfig}>
                {savingConfig ? (
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
    </ModuleWorkspaceShell>
  )
}
