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
  Target,
  Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface LawyerUtilization {
  id: string
  lawyerName: string
  totalHours: number
  billableHours: number
  period: string
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

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const EMPTY_FORM = {
  lawyerName: '',
  totalHours: 0,
  billableHours: 0,
  period: currentPeriod(),
}

export function DebiteringsgradJuridikWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<LawyerUtilization[]>([])
  const [targetPct, setTargetPct] = useState<number>(75)
  const [targetInput, setTargetInput] = useState('75')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<LawyerUtilization | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<LawyerUtilization | null>(null)

  const saveData = useCallback(async (newEntries: LawyerUtilization[], newTarget: number) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await Promise.all([
      supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'utilization_entries',
          config_value: newEntries,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'utilization_target',
          config_value: { target: newTarget },
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
    ])
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [entriesRes, targetRes] = await Promise.all([
      supabase.from('module_configs').select('config_value')
        .eq('user_id', user.id).eq('sector_slug', sectorSlug)
        .eq('module_slug', mod.slug).eq('config_key', 'utilization_entries').maybeSingle(),
      supabase.from('module_configs').select('config_value')
        .eq('user_id', user.id).eq('sector_slug', sectorSlug)
        .eq('module_slug', mod.slug).eq('config_key', 'utilization_target').maybeSingle(),
    ])

    if (entriesRes.data?.config_value && Array.isArray(entriesRes.data.config_value)) {
      setEntries(entriesRes.data.config_value as LawyerUtilization[])
    }
    if (targetRes.data?.config_value && typeof targetRes.data.config_value === 'object') {
      const t = (targetRes.data.config_value as { target: number }).target
      setTargetPct(t)
      setTargetInput(String(t))
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const summary = useMemo(() => {
    const cp = currentPeriod()
    const currentEntries = entries.filter((e) => e.period === cp)
    const totalBillable = currentEntries.reduce((s, e) => s + e.billableHours, 0)
    const totalHours = currentEntries.reduce((s, e) => s + e.totalHours, 0)
    const avgPct = totalHours > 0 ? (totalBillable / totalHours) * 100 : 0
    const variance = avgPct - targetPct
    return { totalBillable, totalHours, avgPct, variance, lawyerCount: currentEntries.length }
  }, [entries, targetPct])

  const lawyerSummary = useMemo(() => {
    const map: Record<string, { totalH: number; billH: number; periods: number }> = {}
    for (const e of entries) {
      if (!map[e.lawyerName]) map[e.lawyerName] = { totalH: 0, billH: 0, periods: 0 }
      map[e.lawyerName].totalH += e.totalHours
      map[e.lawyerName].billH += e.billableHours
      map[e.lawyerName].periods += 1
    }
    return Object.entries(map)
      .map(([name, d]) => ({
        name,
        totalHours: d.totalH,
        billableHours: d.billH,
        utilization: d.totalH > 0 ? (d.billH / d.totalH) * 100 : 0,
        periods: d.periods,
      }))
      .sort((a, b) => b.utilization - a.utilization)
  }, [entries])

  function openNewEntry() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditEntry(entry: LawyerUtilization) {
    setEditingEntry(entry)
    setForm({
      lawyerName: entry.lawyerName,
      totalHours: entry.totalHours,
      billableHours: entry.billableHours,
      period: entry.period,
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    let updated: LawyerUtilization[]
    if (editingEntry) {
      updated = entries.map((e) =>
        e.id === editingEntry.id
          ? { ...e, lawyerName: form.lawyerName.trim(), totalHours: form.totalHours, billableHours: form.billableHours, period: form.period }
          : e
      )
    } else {
      updated = [...entries, { id: generateId(), ...form, lawyerName: form.lawyerName.trim() }]
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveData(updated, targetPct)
  }

  async function handleSaveTarget() {
    const val = parseFloat(targetInput)
    if (isNaN(val)) return
    setTargetPct(val)
    await saveData(entries, val)
  }

  function openDeleteConfirmation(entry: LawyerUtilization) {
    setEntryToDelete(entry)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteEntry() {
    if (!entryToDelete) return
    const updated = entries.filter((e) => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveData(updated, targetPct)
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
            Ny registrering
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="per-jurist">Per jurist</TabsTrigger>
            <TabsTrigger value="detaljer">Detaljer</TabsTrigger>
            <TabsTrigger value="installningar">Inställningar</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={Target}
                title="Ingen data"
                description="Registrera debiterbara och totala timmar för att beräkna debiteringsgrad."
                actionLabel="Ny registrering"
                onAction={openNewEntry}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard
                  label="Debiteringsgrad"
                  value={fmtPct(summary.avgPct)}
                  unit="%"
                  target={targetPct}
                  trend={summary.variance >= 0 ? 'up' : 'down'}
                  trendLabel={`${summary.variance >= 0 ? '+' : ''}${fmtPct(summary.variance)} pp`}
                />
                <KPICard label="Målvärde" value={fmtPct(targetPct)} unit="%" />
                <KPICard label="Debiterbara timmar" value={fmt(summary.totalBillable)} unit="h" />
                <KPICard label="Totalt timmar" value={fmt(summary.totalHours)} unit="h" />
                <KPICard label="Antal jurister" value={String(summary.lawyerCount)} />
              </div>
            )}
          </TabsContent>

          {/* Per lawyer */}
          <TabsContent value="per-jurist" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : lawyerSummary.length === 0 ? (
              <EmptyModuleState
                icon={Target}
                title="Ingen data per jurist"
                description="Lägg till tidsregistreringar för att se debiteringsgrad per jurist."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Jurist</TableHead>
                      <TableHead className="font-medium text-right">Debiterbara</TableHead>
                      <TableHead className="font-medium text-right">Totalt</TableHead>
                      <TableHead className="font-medium">Debiteringsgrad</TableHead>
                      <TableHead className="font-medium text-right">vs Mål</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lawyerSummary.map((l) => {
                      const diff = l.utilization - targetPct
                      return (
                        <TableRow key={l.name}>
                          <TableCell className="font-medium">{l.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(l.billableHours)} h</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(l.totalHours)} h</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Progress value={Math.min(l.utilization, 100)} className="h-2 flex-1" />
                              <span className="text-sm tabular-nums font-medium w-14 text-right">{fmtPct(l.utilization)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={diff >= 0 ? 'secondary' : 'destructive'} className={cn(diff >= 0 && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400')}>
                              {diff >= 0 ? '+' : ''}{fmtPct(diff)} pp
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
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
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={Target}
                title="Inga registreringar"
                description="Börja registrera tidsdata per jurist och period."
                actionLabel="Ny registrering"
                onAction={openNewEntry}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Period</TableHead>
                      <TableHead className="font-medium">Jurist</TableHead>
                      <TableHead className="font-medium text-right">Totalt (h)</TableHead>
                      <TableHead className="font-medium text-right">Debiterbart (h)</TableHead>
                      <TableHead className="font-medium text-right">Grad (%)</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.sort((a, b) => b.period.localeCompare(a.period)).map((entry) => {
                      const pct = entry.totalHours > 0 ? (entry.billableHours / entry.totalHours) * 100 : 0
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>{entry.period}</TableCell>
                          <TableCell className="font-medium">{entry.lawyerName}</TableCell>
                          <TableCell className="text-right tabular-nums">{entry.totalHours}</TableCell>
                          <TableCell className="text-right tabular-nums">{entry.billableHours}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtPct(pct)}%</TableCell>
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
          </TabsContent>

          {/* Settings */}
          <TabsContent value="installningar" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
              <h3 className="text-sm font-semibold">Målvärde debiteringsgrad</h3>
              <p className="text-xs text-muted-foreground">
                Ange målvärde för debiteringsgrad i procent. Typiskt 65-80% för advokatbyråer.
              </p>
              <div className="flex items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mål (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min={0}
                    max={100}
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    className="h-9 w-32"
                    placeholder="75.0"
                  />
                </div>
                <Button size="sm" onClick={handleSaveTarget} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                  Spara
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera registrering' : 'Ny registrering'}</DialogTitle>
            <DialogDescription>
              {editingEntry ? 'Uppdatera tidsdata nedan.' : 'Registrera debiterbara och totala timmar per jurist.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="util-lawyer">Jurist *</Label>
                <Input id="util-lawyer" value={form.lawyerName} onChange={(e) => setForm((f) => ({ ...f, lawyerName: e.target.value }))} placeholder="Namn" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="util-period">Period *</Label>
                <Input id="util-period" type="month" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="util-total">Totala timmar *</Label>
                <Input id="util-total" type="number" min={0} step="0.5" value={form.totalHours} onChange={(e) => setForm((f) => ({ ...f, totalHours: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="util-bill">Debiterbara timmar *</Label>
                <Input id="util-bill" type="number" min={0} step="0.5" value={form.billableHours} onChange={(e) => setForm((f) => ({ ...f, billableHours: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveEntry} disabled={!form.lawyerName.trim() || form.totalHours <= 0}>
              {editingEntry ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort registrering</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort registreringen för{' '}
              <span className="font-semibold">{entryToDelete?.lawyerName}</span> ({entryToDelete?.period})?
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
