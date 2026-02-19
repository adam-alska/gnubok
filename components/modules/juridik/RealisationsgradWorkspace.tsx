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
import { Progress } from '@/components/ui/progress'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type CaseType = 'Affärsjuridik' | 'Tvistemål' | 'Familjerätt' | 'Fastighetsrätt' | 'Arbetsrätt' | 'Straffrätt' | 'Övrigt'

interface RealizationEntry {
  id: string
  caseRef: string
  caseType: CaseType
  clientName: string
  timeValue: number
  invoicedAmount: number
  period: string
}

const CASE_TYPES: CaseType[] = ['Affärsjuridik', 'Tvistemål', 'Familjerätt', 'Fastighetsrätt', 'Arbetsrätt', 'Straffrätt', 'Övrigt']

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const EMPTY_FORM = {
  caseRef: '',
  caseType: 'Affärsjuridik' as CaseType,
  clientName: '',
  timeValue: 0,
  invoicedAmount: 0,
  period: currentPeriod(),
}

export function RealisationsgradWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<RealizationEntry[]>([])

  const [filterCaseType, setFilterCaseType] = useState<CaseType | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<RealizationEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<RealizationEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: RealizationEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'realization_entries',
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
      .eq('config_key', 'realization_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as RealizationEntry[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    if (filterCaseType === 'all') return entries
    return entries.filter((e) => e.caseType === filterCaseType)
  }, [entries, filterCaseType])

  const summary = useMemo(() => {
    const totalTimeValue = entries.reduce((s, e) => s + e.timeValue, 0)
    const totalInvoiced = entries.reduce((s, e) => s + e.invoicedAmount, 0)
    const realisationPct = totalTimeValue > 0 ? (totalInvoiced / totalTimeValue) * 100 : 0
    const writeOff = totalTimeValue - totalInvoiced
    return { totalTimeValue, totalInvoiced, realisationPct, writeOff, count: entries.length }
  }, [entries])

  const caseTypeSummary = useMemo(() => {
    const map: Record<string, { timeValue: number; invoiced: number; count: number }> = {}
    for (const e of entries) {
      if (!map[e.caseType]) map[e.caseType] = { timeValue: 0, invoiced: 0, count: 0 }
      map[e.caseType].timeValue += e.timeValue
      map[e.caseType].invoiced += e.invoicedAmount
      map[e.caseType].count += 1
    }
    return Object.entries(map)
      .map(([caseType, d]) => ({
        caseType,
        timeValue: d.timeValue,
        invoiced: d.invoiced,
        realisation: d.timeValue > 0 ? (d.invoiced / d.timeValue) * 100 : 0,
        count: d.count,
      }))
      .sort((a, b) => b.realisation - a.realisation)
  }, [entries])

  function openNewEntry() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditEntry(entry: RealizationEntry) {
    setEditingEntry(entry)
    setForm({
      caseRef: entry.caseRef,
      caseType: entry.caseType,
      clientName: entry.clientName,
      timeValue: entry.timeValue,
      invoicedAmount: entry.invoicedAmount,
      period: entry.period,
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    let updated: RealizationEntry[]
    if (editingEntry) {
      updated = entries.map((e) =>
        e.id === editingEntry.id
          ? { ...e, ...form, caseRef: form.caseRef.trim(), clientName: form.clientName.trim() }
          : e
      )
    } else {
      updated = [...entries, { id: generateId(), ...form, caseRef: form.caseRef.trim(), clientName: form.clientName.trim() }]
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: RealizationEntry) {
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
            Ny post
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="per-arendetyp">Per ärendetyp</TabsTrigger>
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
                icon={TrendingUp}
                title="Ingen data"
                description="Registrera tidsvärden och fakturerade belopp för att beräkna realisationsgrad."
                actionLabel="Ny post"
                onAction={openNewEntry}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard
                  label="Realisationsgrad"
                  value={fmtPct(summary.realisationPct)}
                  unit="%"
                  trend={summary.realisationPct >= 90 ? 'up' : summary.realisationPct >= 75 ? 'neutral' : 'down'}
                  trendLabel={summary.realisationPct >= 90 ? 'Bra' : summary.realisationPct >= 75 ? 'OK' : 'Låg'}
                />
                <KPICard label="Tidsvärde" value={fmt(summary.totalTimeValue)} unit="kr" />
                <KPICard label="Fakturerat" value={fmt(summary.totalInvoiced)} unit="kr" />
                <KPICard
                  label="Avskrivning"
                  value={fmt(summary.writeOff)}
                  unit="kr"
                  trend={summary.writeOff > 0 ? 'down' : 'up'}
                />
                <KPICard label="Antal ärenden" value={String(summary.count)} />
              </div>
            )}
          </TabsContent>

          {/* Per case type */}
          <TabsContent value="per-arendetyp" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : caseTypeSummary.length === 0 ? (
              <EmptyModuleState
                icon={TrendingUp}
                title="Ingen data per ärendetyp"
                description="Registrera data för att se lönsamhet per ärendetyp."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Ärendetyp</TableHead>
                      <TableHead className="font-medium text-right">Tidsvärde (kr)</TableHead>
                      <TableHead className="font-medium text-right">Fakturerat (kr)</TableHead>
                      <TableHead className="font-medium">Realisationsgrad</TableHead>
                      <TableHead className="font-medium text-right">Antal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {caseTypeSummary.map((ct) => (
                      <TableRow key={ct.caseType}>
                        <TableCell className="font-medium">{ct.caseType}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(ct.timeValue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(ct.invoiced)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Progress value={Math.min(ct.realisation, 100)} className="h-2 flex-1" />
                            <span className={cn('text-sm tabular-nums font-medium w-14 text-right', ct.realisation < 75 && 'text-red-600')}>
                              {fmtPct(ct.realisation)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{ct.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
                <div className="flex items-center gap-3">
                  <Select value={filterCaseType} onValueChange={(val) => setFilterCaseType(val as CaseType | 'all')}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filtrera ärendetyp" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla ärendetyper</SelectItem>
                      {CASE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
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
                    icon={TrendingUp}
                    title="Inga poster"
                    description="Inga poster matchar filtret."
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Period</TableHead>
                          <TableHead className="font-medium">Ärende</TableHead>
                          <TableHead className="font-medium">Klient</TableHead>
                          <TableHead className="font-medium">Typ</TableHead>
                          <TableHead className="font-medium text-right">Tidsvärde</TableHead>
                          <TableHead className="font-medium text-right">Fakturerat</TableHead>
                          <TableHead className="font-medium text-right">Grad</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntries.sort((a, b) => b.period.localeCompare(a.period)).map((entry) => {
                          const pct = entry.timeValue > 0 ? (entry.invoicedAmount / entry.timeValue) * 100 : 0
                          return (
                            <TableRow key={entry.id}>
                              <TableCell>{entry.period}</TableCell>
                              <TableCell className="font-mono text-sm">{entry.caseRef}</TableCell>
                              <TableCell>{entry.clientName}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{entry.caseType}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(entry.timeValue)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(entry.invoicedAmount)}</TableCell>
                              <TableCell className={cn('text-right tabular-nums font-medium', pct < 75 && 'text-red-600')}>
                                {fmtPct(pct)}%
                              </TableCell>
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
                          )
                        })}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera post' : 'Ny post'}</DialogTitle>
            <DialogDescription>
              {editingEntry ? 'Uppdatera realisationsdata.' : 'Registrera tidsvärde och fakturerat belopp per ärende.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="real-case">Ärende *</Label>
                <Input id="real-case" value={form.caseRef} onChange={(e) => setForm((f) => ({ ...f, caseRef: e.target.value }))} placeholder="2024-001" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="real-client">Klient *</Label>
                <Input id="real-client" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Klient AB" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="real-type">Ärendetyp</Label>
                <Select value={form.caseType} onValueChange={(val) => setForm((f) => ({ ...f, caseType: val as CaseType }))}>
                  <SelectTrigger id="real-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CASE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="real-period">Period</Label>
                <Input id="real-period" type="month" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="real-time">Tidsvärde (kr) *</Label>
                <Input id="real-time" type="number" min={0} value={form.timeValue} onChange={(e) => setForm((f) => ({ ...f, timeValue: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="real-inv">Fakturerat (kr) *</Label>
                <Input id="real-inv" type="number" min={0} value={form.invoicedAmount} onChange={(e) => setForm((f) => ({ ...f, invoicedAmount: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveEntry} disabled={!form.caseRef.trim() || !form.clientName.trim()}>
              {editingEntry ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort post</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort posten för{' '}
              <span className="font-semibold">{entryToDelete?.caseRef}</span>?
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
