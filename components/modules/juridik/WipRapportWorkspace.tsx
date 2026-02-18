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
  Search,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type RiskLevel = 'Låg' | 'Medel' | 'Hög'

interface WipReportEntry {
  id: string
  clientName: string
  caseRef: string
  unbilledAmount: number
  unbilledHours: number
  oldestDate: string
  riskLevel: RiskLevel
  writeDownRisk: number
  note: string
}

const RISK_LEVELS: RiskLevel[] = ['Låg', 'Medel', 'Hög']

const RISK_COLORS: Record<RiskLevel, string> = {
  'Låg': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Medel': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Hög': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function daysSince(dateStr: string): number {
  if (!dateStr) return 0
  return Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

const EMPTY_FORM = {
  clientName: '',
  caseRef: '',
  unbilledAmount: 0,
  unbilledHours: 0,
  oldestDate: new Date().toISOString().slice(0, 10),
  riskLevel: 'Låg' as RiskLevel,
  writeDownRisk: 0,
  note: '',
}

export function WipRapportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<WipReportEntry[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterRisk, setFilterRisk] = useState<RiskLevel | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<WipReportEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<WipReportEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: WipReportEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'wip_report_entries',
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
      .eq('config_key', 'wip_report_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as WipReportEntry[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    let result = entries
    if (filterRisk !== 'all') {
      result = result.filter((e) => e.riskLevel === filterRisk)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (e) => e.clientName.toLowerCase().includes(q) || e.caseRef.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.unbilledAmount - a.unbilledAmount)
  }, [entries, filterRisk, searchQuery])

  const summary = useMemo(() => {
    const totalUnbilled = entries.reduce((s, e) => s + e.unbilledAmount, 0)
    const totalHours = entries.reduce((s, e) => s + e.unbilledHours, 0)
    const totalWriteDownRisk = entries.reduce((s, e) => s + (e.unbilledAmount * e.writeDownRisk / 100), 0)
    const highRisk = entries.filter((e) => e.riskLevel === 'Hög').length
    const over90 = entries.filter((e) => daysSince(e.oldestDate) > 90).length
    return { totalUnbilled, totalHours, totalWriteDownRisk, highRisk, over90, count: entries.length }
  }, [entries])

  const clientSummary = useMemo(() => {
    const map: Record<string, { amount: number; hours: number; cases: number }> = {}
    for (const e of entries) {
      if (!map[e.clientName]) map[e.clientName] = { amount: 0, hours: 0, cases: 0 }
      map[e.clientName].amount += e.unbilledAmount
      map[e.clientName].hours += e.unbilledHours
      map[e.clientName].cases += 1
    }
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.amount - a.amount)
  }, [entries])

  function openNewEntry() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditEntry(entry: WipReportEntry) {
    setEditingEntry(entry)
    setForm({
      clientName: entry.clientName,
      caseRef: entry.caseRef,
      unbilledAmount: entry.unbilledAmount,
      unbilledHours: entry.unbilledHours,
      oldestDate: entry.oldestDate,
      riskLevel: entry.riskLevel,
      writeDownRisk: entry.writeDownRisk,
      note: entry.note,
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    let updated: WipReportEntry[]
    if (editingEntry) {
      updated = entries.map((e) =>
        e.id === editingEntry.id
          ? { ...e, ...form, clientName: form.clientName.trim(), caseRef: form.caseRef.trim(), note: form.note.trim() }
          : e
      )
    } else {
      updated = [...entries, { id: generateId(), ...form, clientName: form.clientName.trim(), caseRef: form.caseRef.trim(), note: form.note.trim() }]
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: WipReportEntry) {
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
        sectorName="Juridik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewEntry}>
            <Plus className="mr-2 h-4 w-4" />
            Ny WIP-post
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
            <TabsTrigger value="per-klient">Per klient</TabsTrigger>
            <TabsTrigger value="aging">Aldersanalys</TabsTrigger>
            <TabsTrigger value="detaljer">Detaljer</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={Clock}
                title="Ingen WIP-data"
                description="Lagg till ofakturerade poster for att se en sammanstallning."
                actionLabel="Ny WIP-post"
                onAction={openNewEntry}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Totalt ofakturerat" value={fmt(summary.totalUnbilled)} unit="kr" />
                <KPICard label="Ofakturerade timmar" value={fmt(summary.totalHours)} unit="h" />
                <KPICard
                  label="Nedskrivningsrisk"
                  value={fmt(summary.totalWriteDownRisk)}
                  unit="kr"
                  trend={summary.totalWriteDownRisk > 0 ? 'down' : 'up'}
                />
                <KPICard
                  label="Hog risk"
                  value={String(summary.highRisk)}
                  trend={summary.highRisk > 0 ? 'down' : 'up'}
                  trendLabel={summary.highRisk > 0 ? 'Krav atgard' : 'OK'}
                />
                <KPICard
                  label="Aldre an 90d"
                  value={String(summary.over90)}
                  trend={summary.over90 > 0 ? 'down' : 'up'}
                />
              </div>
            )}
          </TabsContent>

          {/* Per client */}
          <TabsContent value="per-klient" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : clientSummary.length === 0 ? (
              <EmptyModuleState
                icon={Clock}
                title="Ingen data per klient"
                description="Lagg till WIP-poster for att se sammanstallning per klient."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Klient</TableHead>
                      <TableHead className="font-medium text-right">Ofakturerat (kr)</TableHead>
                      <TableHead className="font-medium text-right">Timmar</TableHead>
                      <TableHead className="font-medium text-right">Antal arenden</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientSummary.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.hours)}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.cases}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Aging analysis */}
          <TabsContent value="aging" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={AlertTriangle}
                title="Ingen aldersanalys"
                description="Lagg till poster med datum for att se aldersfordelning."
              />
            ) : (
              <>
                {/* Aging buckets */}
                {(() => {
                  const buckets = [
                    { label: '0-30 dagar', min: 0, max: 30 },
                    { label: '31-60 dagar', min: 31, max: 60 },
                    { label: '61-90 dagar', min: 61, max: 90 },
                    { label: '90+ dagar', min: 91, max: Infinity },
                  ]
                  return (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {buckets.map((b) => {
                        const items = entries.filter((e) => {
                          const days = daysSince(e.oldestDate)
                          return days >= b.min && days <= b.max
                        })
                        const total = items.reduce((s, e) => s + e.unbilledAmount, 0)
                        return (
                          <KPICard
                            key={b.label}
                            label={b.label}
                            value={fmt(total)}
                            unit="kr"
                            trendLabel={`${items.length} arenden`}
                            className={cn(b.min >= 91 && total > 0 && 'border-red-200 dark:border-red-900/50')}
                          />
                        )
                      })}
                    </div>
                  )
                })()}

                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Klient</TableHead>
                        <TableHead className="font-medium">Arende</TableHead>
                        <TableHead className="font-medium text-right">Belopp (kr)</TableHead>
                        <TableHead className="font-medium text-right">Alder (dagar)</TableHead>
                        <TableHead className="font-medium">Risk</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries
                        .sort((a, b) => daysSince(b.oldestDate) - daysSince(a.oldestDate))
                        .map((entry) => {
                          const days = daysSince(entry.oldestDate)
                          return (
                            <TableRow key={entry.id} className={cn(days > 90 && 'bg-red-50 dark:bg-red-950/10')}>
                              <TableCell className="font-medium">{entry.clientName}</TableCell>
                              <TableCell className="font-mono text-sm">{entry.caseRef}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(entry.unbilledAmount)}</TableCell>
                              <TableCell className={cn('text-right tabular-nums', days > 90 && 'text-red-600 font-medium')}>{days}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className={RISK_COLORS[entry.riskLevel]}>{entry.riskLevel}</Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>

          {/* Detail entries */}
          <TabsContent value="detaljer" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sok klient eller arende..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterRisk} onValueChange={(val) => setFilterRisk(val as RiskLevel | 'all')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrera risk" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla riskniver</SelectItem>
                      {RISK_LEVELS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredEntries.length === 0 ? (
                  <EmptyModuleState
                    icon={Clock}
                    title="Inga poster"
                    description="Inga WIP-poster matchar filtret."
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Klient</TableHead>
                          <TableHead className="font-medium">Arende</TableHead>
                          <TableHead className="font-medium text-right">Belopp (kr)</TableHead>
                          <TableHead className="font-medium text-right">Timmar</TableHead>
                          <TableHead className="font-medium">Risk</TableHead>
                          <TableHead className="font-medium text-right">Nedskr. %</TableHead>
                          <TableHead className="font-medium text-right">Atgarder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">{entry.clientName}</TableCell>
                            <TableCell className="font-mono text-sm">{entry.caseRef}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(entry.unbilledAmount)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(entry.unbilledHours)}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={RISK_COLORS[entry.riskLevel]}>{entry.riskLevel}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmtPct(entry.writeDownRisk)}%</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditEntry(entry)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(entry)} title="Ta bort">
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
              </>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera WIP-post' : 'Ny WIP-post'}</DialogTitle>
            <DialogDescription>
              {editingEntry ? 'Uppdatera WIP-posten.' : 'Registrera ofakturerad tid for WIP-rapporten.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="wip-r-client">Klient *</Label>
                <Input id="wip-r-client" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Klient AB" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wip-r-case">Arende *</Label>
                <Input id="wip-r-case" value={form.caseRef} onChange={(e) => setForm((f) => ({ ...f, caseRef: e.target.value }))} placeholder="2024-001" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="wip-r-amount">Belopp (kr) *</Label>
                <Input id="wip-r-amount" type="number" min={0} value={form.unbilledAmount} onChange={(e) => setForm((f) => ({ ...f, unbilledAmount: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wip-r-hours">Timmar</Label>
                <Input id="wip-r-hours" type="number" min={0} step="0.5" value={form.unbilledHours} onChange={(e) => setForm((f) => ({ ...f, unbilledHours: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wip-r-date">Aldsta datum</Label>
                <Input id="wip-r-date" type="date" value={form.oldestDate} onChange={(e) => setForm((f) => ({ ...f, oldestDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="wip-r-risk">Riskniva</Label>
                <Select value={form.riskLevel} onValueChange={(val) => setForm((f) => ({ ...f, riskLevel: val as RiskLevel }))}>
                  <SelectTrigger id="wip-r-risk"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wip-r-wd">Nedskrivningsrisk (%)</Label>
                <Input id="wip-r-wd" type="number" min={0} max={100} step="5" value={form.writeDownRisk} onChange={(e) => setForm((f) => ({ ...f, writeDownRisk: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wip-r-note">Anteckning</Label>
              <Input id="wip-r-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Frivillig anteckning..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveEntry} disabled={!form.clientName.trim() || !form.caseRef.trim()}>
              {editingEntry ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort WIP-post</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort posten for{' '}
              <span className="font-semibold">{entryToDelete?.clientName}</span> ({entryToDelete?.caseRef})?
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
