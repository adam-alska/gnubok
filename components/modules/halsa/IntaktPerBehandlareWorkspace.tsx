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
  Search,
  UserCheck,
  TrendingUp,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type PayerType = 'Region' | 'Privat' | 'Försäkring'
type PeriodView = 'dag' | 'vecka' | 'manad'

interface RevenueEntry {
  id: string
  practitionerName: string
  date: string
  payerType: PayerType
  visits: number
  revenue: number
}

interface PractitionerSummary {
  name: string
  totalRevenue: number
  totalVisits: number
  avgPerVisit: number
  regionRevenue: number
  privatRevenue: number
  insuranceRevenue: number
}

const PAYER_TYPES: PayerType[] = ['Region', 'Privat', 'Försäkring']

const PAYER_COLORS: Record<PayerType, string> = {
  'Region': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Privat': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Försäkring': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
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

export function IntaktPerBehandlareWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<RevenueEntry[]>([])
  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)
  const [periodView, setPeriodView] = useState<PeriodView>('manad')

  const [searchQuery, setSearchQuery] = useState('')
  const [filterPayer, setFilterPayer] = useState<PayerType | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [entryForm, setEntryForm] = useState({
    practitionerName: '',
    date: todayStr(),
    payerType: 'Region' as PayerType,
    visits: 1,
    revenue: 0,
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<RevenueEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: RevenueEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'revenue_entries',
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
      .eq('config_key', 'revenue_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as RevenueEntry[])
    } else {
      setEntries([])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    let result = entries.filter((e) => e.date >= from && e.date <= to)
    if (filterPayer !== 'all') {
      result = result.filter((e) => e.payerType === filterPayer)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) => e.practitionerName.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, from, to, filterPayer, searchQuery])

  const practitionerSummaries = useMemo(() => {
    const dateFiltered = entries.filter((e) => e.date >= from && e.date <= to)
    const map: Record<string, PractitionerSummary> = {}

    for (const e of dateFiltered) {
      if (!map[e.practitionerName]) {
        map[e.practitionerName] = {
          name: e.practitionerName,
          totalRevenue: 0,
          totalVisits: 0,
          avgPerVisit: 0,
          regionRevenue: 0,
          privatRevenue: 0,
          insuranceRevenue: 0,
        }
      }
      const s = map[e.practitionerName]
      s.totalRevenue += e.revenue
      s.totalVisits += e.visits
      if (e.payerType === 'Region') s.regionRevenue += e.revenue
      if (e.payerType === 'Privat') s.privatRevenue += e.revenue
      if (e.payerType === 'Försäkring') s.insuranceRevenue += e.revenue
    }

    return Object.values(map)
      .map((s) => ({ ...s, avgPerVisit: s.totalVisits > 0 ? s.totalRevenue / s.totalVisits : 0 }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
  }, [entries, from, to])

  const totals = useMemo(() => {
    const totalRevenue = practitionerSummaries.reduce((s, p) => s + p.totalRevenue, 0)
    const totalVisits = practitionerSummaries.reduce((s, p) => s + p.totalVisits, 0)
    const avgPerVisit = totalVisits > 0 ? totalRevenue / totalVisits : 0
    return { totalRevenue, totalVisits, avgPerVisit, practitioners: practitionerSummaries.length }
  }, [practitionerSummaries])

  function openNewEntry() {
    setEntryForm({
      practitionerName: '',
      date: todayStr(),
      payerType: 'Region',
      visits: 1,
      revenue: 0,
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    const newEntry: RevenueEntry = {
      id: generateId(),
      practitionerName: entryForm.practitionerName.trim(),
      date: entryForm.date,
      payerType: entryForm.payerType,
      visits: entryForm.visits,
      revenue: entryForm.revenue,
    }

    const updated = [...entries, newEntry]
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: RevenueEntry) {
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
        <Tabs defaultValue="sammanfattning" className="space-y-6">
          <TabsList>
            <TabsTrigger value="sammanfattning">Sammanfattning</TabsTrigger>
            <TabsTrigger value="behandlare">Per behandlare</TabsTrigger>
            <TabsTrigger value="detaljer">Detaljrader</TabsTrigger>
          </TabsList>

          <TabsContent value="sammanfattning" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : practitionerSummaries.length === 0 ? (
              <EmptyModuleState
                icon={UserCheck}
                title="Ingen intäktsdata"
                description="Registrera intäkter per behandlare för att se sammanfattningen."
                actionLabel="Ny intäktsrad"
                onAction={openNewEntry}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total intäkt" value={fmt(totals.totalRevenue)} unit="kr" />
                <KPICard label="Totalt besök" value={totals.totalVisits.toString()} />
                <KPICard label="Snitt per besök" value={fmt(totals.avgPerVisit)} unit="kr" />
                <KPICard label="Behandlare" value={totals.practitioners.toString()} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="behandlare" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : practitionerSummaries.length === 0 ? (
              <EmptyModuleState
                icon={UserCheck}
                title="Inga behandlare"
                description="Lägg till intäktsrader för att se per-behandlare-statistik."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Behandlare</TableHead>
                      <TableHead className="font-medium text-right">Total intäkt</TableHead>
                      <TableHead className="font-medium text-right">Besök</TableHead>
                      <TableHead className="font-medium text-right">Snitt/besök</TableHead>
                      <TableHead className="font-medium text-right">Region</TableHead>
                      <TableHead className="font-medium text-right">Privat</TableHead>
                      <TableHead className="font-medium text-right">Försäkring</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {practitionerSummaries.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{fmt(p.totalRevenue)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{p.totalVisits}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{fmt(p.avgPerVisit)} kr</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{fmt(p.regionRevenue)} kr</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{fmt(p.privatRevenue)} kr</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{fmt(p.insuranceRevenue)} kr</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="detaljer" className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök behandlare..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterPayer} onValueChange={(val) => setFilterPayer(val as PayerType | 'all')}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Betalare" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla betalare</SelectItem>
                  {PAYER_TYPES.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={openNewEntry}>
                <Plus className="mr-2 h-4 w-4" />
                Ny rad
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
            ) : filteredEntries.length === 0 ? (
              <EmptyModuleState
                icon={TrendingUp}
                title="Inga rader"
                description="Lägg till intäktsrader för att bygga upp rapporten."
                actionLabel="Ny intäktsrad"
                onAction={openNewEntry}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">Behandlare</TableHead>
                      <TableHead className="font-medium">Betalare</TableHead>
                      <TableHead className="font-medium text-right">Besök</TableHead>
                      <TableHead className="font-medium text-right">Intäkt</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">{entry.date}</TableCell>
                        <TableCell className="font-medium">{entry.practitionerName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={PAYER_COLORS[entry.payerType]}>
                            {entry.payerType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{entry.visits}</TableCell>
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
            <DialogTitle>Ny intäktsrad</DialogTitle>
            <DialogDescription>
              Registrera intäkter per behandlare, betalarkategori och dag.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="entry-name">Behandlare *</Label>
              <Input
                id="entry-name"
                value={entryForm.practitionerName}
                onChange={(e) => setEntryForm((f) => ({ ...f, practitionerName: e.target.value }))}
                placeholder="Dr. Svensson"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="entry-date">Datum *</Label>
                <Input
                  id="entry-date"
                  type="date"
                  value={entryForm.date}
                  onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="entry-payer">Betalare *</Label>
                <Select
                  value={entryForm.payerType}
                  onValueChange={(val) => setEntryForm((f) => ({ ...f, payerType: val as PayerType }))}
                >
                  <SelectTrigger id="entry-payer">
                    <SelectValue placeholder="Välj betalare" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYER_TYPES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="entry-visits">Antal besök *</Label>
                <Input
                  id="entry-visits"
                  type="number"
                  min={1}
                  value={entryForm.visits}
                  onChange={(e) => setEntryForm((f) => ({ ...f, visits: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="entry-revenue">Intäkt (kr) *</Label>
                <Input
                  id="entry-revenue"
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
              disabled={!entryForm.practitionerName.trim() || entryForm.revenue <= 0}
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
              Är du säker på att du vill ta bort intäktsraden för{' '}
              <span className="font-semibold">{entryToDelete?.practitionerName}</span> ({entryToDelete?.date})? Denna åtgärd kan inte ångras.
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
