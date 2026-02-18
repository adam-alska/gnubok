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
  Trash2,
  Loader2,
  PieChart,
  TrendingUp,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type PayerCategory = 'Region' | 'Privat' | 'Försäkring'

interface PatientMixEntry {
  id: string
  period: string
  payerCategory: PayerCategory
  patientCount: number
  revenue: number
}

interface CategorySummary {
  category: PayerCategory
  patientCount: number
  revenue: number
  pctPatients: number
  pctRevenue: number
  avgPerPatient: number
}

interface TrendRow {
  period: string
  regionPct: number
  privatPct: number
  insurancePct: number
  totalRevenue: number
}

const PAYER_CATEGORIES: PayerCategory[] = ['Region', 'Privat', 'Försäkring']

const PAYER_COLORS: Record<PayerCategory, string> = {
  'Region': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Privat': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Försäkring': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
}

const PAYER_BAR_COLORS: Record<PayerCategory, string> = {
  'Region': 'bg-blue-500',
  'Privat': 'bg-emerald-500',
  'Försäkring': 'bg-purple-500',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
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

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

export function PatientmixWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<PatientMixEntry[]>([])
  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [entryForm, setEntryForm] = useState({
    period: todayStr().slice(0, 7),
    payerCategory: 'Region' as PayerCategory,
    patientCount: 0,
    revenue: 0,
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<PatientMixEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: PatientMixEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'patientmix_entries',
        config_value: newEntries,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'patientmix_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as PatientMixEntry[])
    } else {
      setEntries([])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const categorySummaries = useMemo(() => {
    const periodFiltered = entries.filter((e) => e.period >= from.slice(0, 7) && e.period <= to.slice(0, 7))
    const totalPatients = periodFiltered.reduce((s, e) => s + e.patientCount, 0)
    const totalRevenue = periodFiltered.reduce((s, e) => s + e.revenue, 0)

    return PAYER_CATEGORIES.map((cat): CategorySummary => {
      const catEntries = periodFiltered.filter((e) => e.payerCategory === cat)
      const patients = catEntries.reduce((s, e) => s + e.patientCount, 0)
      const revenue = catEntries.reduce((s, e) => s + e.revenue, 0)
      return {
        category: cat,
        patientCount: patients,
        revenue,
        pctPatients: totalPatients > 0 ? (patients / totalPatients) * 100 : 0,
        pctRevenue: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
        avgPerPatient: patients > 0 ? revenue / patients : 0,
      }
    })
  }, [entries, from, to])

  const trendData = useMemo(() => {
    const periodMap: Record<string, Record<PayerCategory, number>> = {}
    const revenueMap: Record<string, number> = {}

    for (const e of entries) {
      if (!periodMap[e.period]) {
        periodMap[e.period] = { Region: 0, Privat: 0, 'Försäkring': 0 }
        revenueMap[e.period] = 0
      }
      periodMap[e.period][e.payerCategory] += e.revenue
      revenueMap[e.period] += e.revenue
    }

    return Object.entries(periodMap)
      .map(([period, cats]): TrendRow => {
        const total = revenueMap[period]
        return {
          period,
          regionPct: total > 0 ? (cats.Region / total) * 100 : 0,
          privatPct: total > 0 ? (cats.Privat / total) * 100 : 0,
          insurancePct: total > 0 ? (cats['Försäkring'] / total) * 100 : 0,
          totalRevenue: total,
        }
      })
      .sort((a, b) => a.period.localeCompare(b.period))
  }, [entries])

  const totals = useMemo(() => {
    const totalPatients = categorySummaries.reduce((s, c) => s + c.patientCount, 0)
    const totalRevenue = categorySummaries.reduce((s, c) => s + c.revenue, 0)
    const avgPerPatient = totalPatients > 0 ? totalRevenue / totalPatients : 0
    return { totalPatients, totalRevenue, avgPerPatient }
  }, [categorySummaries])

  function openNewEntry() {
    setEntryForm({
      period: todayStr().slice(0, 7),
      payerCategory: 'Region',
      patientCount: 0,
      revenue: 0,
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    const newEntry: PatientMixEntry = {
      id: generateId(),
      period: entryForm.period,
      payerCategory: entryForm.payerCategory,
      patientCount: entryForm.patientCount,
      revenue: entryForm.revenue,
    }

    const updated = [...entries, newEntry]
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: PatientMixEntry) {
    setEntryToDelete(entry)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteEntry() {
    if (!entryToDelete) return
    const updated = entries.filter((e) => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Hälsa & Sjukvård"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        }
      >
        <Tabs defaultValue="fordelning" className="space-y-6">
          <TabsList>
            <TabsTrigger value="fordelning">Fördelning</TabsTrigger>
            <TabsTrigger value="trend">Trend</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="fordelning" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : totals.totalPatients === 0 ? (
              <EmptyModuleState
                icon={PieChart}
                title="Ingen patientmixdata"
                description="Lägg till data per betalkategori och period för att se fördelningen."
                actionLabel="Ny datarad"
                onAction={openNewEntry}
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <KPICard label="Totalt patienter" value={totals.totalPatients.toString()} />
                  <KPICard label="Total intäkt" value={fmt(totals.totalRevenue)} unit="kr" />
                  <KPICard label="Snitt per patient" value={fmt(totals.avgPerPatient)} unit="kr" />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {categorySummaries.map((cs) => (
                    <div key={cs.category} className="rounded-xl border border-border bg-card p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className={PAYER_COLORS[cs.category]}>
                          {cs.category}
                        </Badge>
                        <span className="text-sm font-medium">{fmtPct(cs.pctRevenue)}%</span>
                      </div>
                      <div>
                        <p className="text-2xl font-semibold tracking-tight">{fmt(cs.revenue)} kr</p>
                        <p className="text-sm text-muted-foreground">{cs.patientCount} patienter</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Andel intäkt</span>
                          <span>{fmtPct(cs.pctRevenue)}%</span>
                        </div>
                        <Progress value={cs.pctRevenue} className="h-2" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Snitt per patient: {fmt(cs.avgPerPatient)} kr
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="trend" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : trendData.length === 0 ? (
              <EmptyModuleState
                icon={TrendingUp}
                title="Ingen trenddata"
                description="Lägg till data för flera perioder för att se trenden."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Period</TableHead>
                      <TableHead className="font-medium text-right">Region %</TableHead>
                      <TableHead className="font-medium text-right">Privat %</TableHead>
                      <TableHead className="font-medium text-right">Försäkring %</TableHead>
                      <TableHead className="font-medium text-right">Total intäkt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trendData.map((row) => (
                      <TableRow key={row.period}>
                        <TableCell className="font-medium">{row.period}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(row.regionPct)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(row.privatPct)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(row.insurancePct)}%</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{fmt(row.totalRevenue)} kr</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="data" className="space-y-6">
            <div className="flex items-center gap-3">
              <Button onClick={openNewEntry}>
                <Plus className="mr-2 h-4 w-4" />
                Ny datarad
              </Button>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={PieChart}
                title="Ingen data"
                description="Lägg till rader med patientmixdata."
                actionLabel="Ny datarad"
                onAction={openNewEntry}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Period</TableHead>
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium text-right">Patienter</TableHead>
                      <TableHead className="font-medium text-right">Intäkt</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries
                      .sort((a, b) => b.period.localeCompare(a.period))
                      .map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.period}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={PAYER_COLORS[entry.payerCategory]}>
                              {entry.payerCategory}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{entry.patientCount}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(entry.revenue)} kr</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(entry)} title="Ta bort">
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
            <DialogTitle>Ny patientmixrad</DialogTitle>
            <DialogDescription>
              Lägg till data per betalarkategori och period.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mix-period">Period (YYYY-MM) *</Label>
                <Input
                  id="mix-period"
                  value={entryForm.period}
                  onChange={(e) => setEntryForm((f) => ({ ...f, period: e.target.value }))}
                  placeholder="2024-01"
                  maxLength={7}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mix-payer">Betalkategori *</Label>
                <Select
                  value={entryForm.payerCategory}
                  onValueChange={(val) => setEntryForm((f) => ({ ...f, payerCategory: val as PayerCategory }))}
                >
                  <SelectTrigger id="mix-payer">
                    <SelectValue placeholder="Välj kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYER_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mix-patients">Antal patienter *</Label>
                <Input
                  id="mix-patients"
                  type="number"
                  min={0}
                  value={entryForm.patientCount}
                  onChange={(e) => setEntryForm((f) => ({ ...f, patientCount: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mix-revenue">Intäkt (kr) *</Label>
                <Input
                  id="mix-revenue"
                  type="number"
                  min={0}
                  value={entryForm.revenue}
                  onChange={(e) => setEntryForm((f) => ({ ...f, revenue: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveEntry}
              disabled={!entryForm.period.trim() || entryForm.patientCount <= 0}
            >
              Spara rad
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort rad</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort raden för {entryToDelete?.payerCategory} ({entryToDelete?.period})? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Avbryt
            </Button>
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
