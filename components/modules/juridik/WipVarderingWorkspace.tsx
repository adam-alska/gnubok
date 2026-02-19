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
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface WipEntry {
  id: string
  clientName: string
  caseRef: string
  lawyer: string
  hours: number
  hourlyRate: number
  lastRevaluation: string
  writeDownPct: number
}

interface MonthlyRevaluation {
  month: string
  totalBefore: number
  totalAfter: number
  writeDown: number
}

const EMPTY_WIP_FORM = {
  clientName: '',
  caseRef: '',
  lawyer: '',
  hours: 0,
  hourlyRate: 0,
  writeDownPct: 0,
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

export function WipVarderingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<WipEntry[]>([])
  const [revaluations, setRevaluations] = useState<MonthlyRevaluation[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<WipEntry | null>(null)
  const [wipForm, setWipForm] = useState(EMPTY_WIP_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<WipEntry | null>(null)

  const saveData = useCallback(async (newEntries: WipEntry[], newRevaluations: MonthlyRevaluation[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await Promise.all([
      supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'wip_entries',
          config_value: newEntries,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'wip_revaluations',
          config_value: newRevaluations,
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

    const [entriesRes, revalRes] = await Promise.all([
      supabase.from('module_configs').select('config_value')
        .eq('user_id', user.id).eq('sector_slug', sectorSlug)
        .eq('module_slug', mod.slug).eq('config_key', 'wip_entries').maybeSingle(),
      supabase.from('module_configs').select('config_value')
        .eq('user_id', user.id).eq('sector_slug', sectorSlug)
        .eq('module_slug', mod.slug).eq('config_key', 'wip_revaluations').maybeSingle(),
    ])

    if (entriesRes.data?.config_value && Array.isArray(entriesRes.data.config_value)) {
      setEntries(entriesRes.data.config_value as WipEntry[])
    }
    if (revalRes.data?.config_value && Array.isArray(revalRes.data.config_value)) {
      setRevaluations(revalRes.data.config_value as MonthlyRevaluation[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const summary = useMemo(() => {
    const totalGross = entries.reduce((s, e) => s + e.hours * e.hourlyRate, 0)
    const totalWriteDown = entries.reduce((s, e) => s + (e.hours * e.hourlyRate * e.writeDownPct / 100), 0)
    const totalNet = totalGross - totalWriteDown
    const totalHours = entries.reduce((s, e) => s + e.hours, 0)
    return { totalGross, totalWriteDown, totalNet, totalHours, count: entries.length }
  }, [entries])

  function openNewEntry() {
    setEditingEntry(null)
    setWipForm({ ...EMPTY_WIP_FORM })
    setDialogOpen(true)
  }

  function openEditEntry(entry: WipEntry) {
    setEditingEntry(entry)
    setWipForm({
      clientName: entry.clientName,
      caseRef: entry.caseRef,
      lawyer: entry.lawyer,
      hours: entry.hours,
      hourlyRate: entry.hourlyRate,
      writeDownPct: entry.writeDownPct,
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    const today = new Date().toISOString().slice(0, 10)

    let updated: WipEntry[]
    if (editingEntry) {
      updated = entries.map((e) =>
        e.id === editingEntry.id
          ? {
              ...e,
              clientName: wipForm.clientName.trim(),
              caseRef: wipForm.caseRef.trim(),
              lawyer: wipForm.lawyer.trim(),
              hours: wipForm.hours,
              hourlyRate: wipForm.hourlyRate,
              writeDownPct: wipForm.writeDownPct,
              lastRevaluation: today,
            }
          : e
      )
    } else {
      updated = [
        ...entries,
        {
          id: generateId(),
          clientName: wipForm.clientName.trim(),
          caseRef: wipForm.caseRef.trim(),
          lawyer: wipForm.lawyer.trim(),
          hours: wipForm.hours,
          hourlyRate: wipForm.hourlyRate,
          writeDownPct: wipForm.writeDownPct,
          lastRevaluation: today,
        },
      ]
    }

    setEntries(updated)
    setDialogOpen(false)
    await saveData(updated, revaluations)
  }

  async function handleRevalue() {
    const today = new Date()
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    const totalBefore = entries.reduce((s, e) => s + e.hours * e.hourlyRate, 0)
    const totalAfter = entries.reduce((s, e) => s + e.hours * e.hourlyRate * (1 - e.writeDownPct / 100), 0)

    const updatedRevals = [
      ...revaluations.filter((r) => r.month !== month),
      { month, totalBefore, totalAfter, writeDown: totalBefore - totalAfter },
    ].sort((a, b) => a.month.localeCompare(b.month))

    const updatedEntries = entries.map((e) => ({
      ...e,
      lastRevaluation: today.toISOString().slice(0, 10),
    }))

    setRevaluations(updatedRevals)
    setEntries(updatedEntries)
    await saveData(updatedEntries, updatedRevals)
  }

  function openDeleteConfirmation(entry: WipEntry) {
    setEntryToDelete(entry)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteEntry() {
    if (!entryToDelete) return
    const updated = entries.filter((e) => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveData(updated, revaluations)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Juridik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleRevalue} disabled={saving || entries.length === 0}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Månadlig omvärdering
            </Button>
            <Button onClick={openNewEntry}>
              <Plus className="mr-2 h-4 w-4" />
              Ny WIP-post
            </Button>
          </div>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="detaljer">WIP-poster</TabsTrigger>
            <TabsTrigger value="historik">Omvärderingshistorik</TabsTrigger>
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
                title="Inga WIP-poster"
                description="Lägg till pågående arbete för att börja värdera ofakturerad tid."
                actionLabel="Ny WIP-post"
                onAction={openNewEntry}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Bruttovärde" value={fmt(summary.totalGross)} unit="kr" />
                <KPICard label="Nedskrivning" value={fmt(summary.totalWriteDown)} unit="kr" />
                <KPICard
                  label="Nettovärde (1470)"
                  value={fmt(summary.totalNet)}
                  unit="kr"
                  trend={summary.totalNet > 0 ? 'up' : 'neutral'}
                />
                <KPICard label="Totalt timmar" value={String(summary.totalHours)} unit="h" />
                <KPICard label="Antal poster" value={String(summary.count)} />
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
                icon={Clock}
                title="Inga WIP-poster"
                description="Börja med att lägga till ofakturerade uppdrag."
                actionLabel="Ny WIP-post"
                onAction={openNewEntry}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Klient</TableHead>
                      <TableHead className="font-medium">Ärende</TableHead>
                      <TableHead className="font-medium">Jurist</TableHead>
                      <TableHead className="font-medium text-right">Timmar</TableHead>
                      <TableHead className="font-medium text-right">Timpris</TableHead>
                      <TableHead className="font-medium text-right">Brutto</TableHead>
                      <TableHead className="font-medium text-right">Nedskr. %</TableHead>
                      <TableHead className="font-medium text-right">Netto</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const gross = entry.hours * entry.hourlyRate
                      const net = gross * (1 - entry.writeDownPct / 100)
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.clientName}</TableCell>
                          <TableCell className="font-mono text-sm">{entry.caseRef}</TableCell>
                          <TableCell>{entry.lawyer}</TableCell>
                          <TableCell className="text-right tabular-nums">{entry.hours}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(entry.hourlyRate)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(gross)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Badge variant={entry.writeDownPct > 0 ? 'secondary' : 'outline'}>
                              {fmtPct(entry.writeDownPct)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(net)}</TableCell>
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
            {saving && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sparar...
              </div>
            )}
          </TabsContent>

          {/* Revaluation history */}
          <TabsContent value="historik" className="space-y-4">
            {revaluations.length === 0 ? (
              <EmptyModuleState
                icon={RefreshCw}
                title="Ingen omvärderingshistorik"
                description="Kör en månadlig omvärdering för att börja bygga upp historiken."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Månad</TableHead>
                      <TableHead className="font-medium text-right">Före (kr)</TableHead>
                      <TableHead className="font-medium text-right">Efter (kr)</TableHead>
                      <TableHead className="font-medium text-right">Nedskrivning (kr)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revaluations.map((r) => (
                      <TableRow key={r.month}>
                        <TableCell>{r.month}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.totalBefore)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.totalAfter)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-red-600">{fmt(r.writeDown)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Add/Edit WIP Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera WIP-post' : 'Ny WIP-post'}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? 'Uppdatera värderingsuppgifterna nedan.'
                : 'Registrera ofakturerat arbete för värdering på konto 1470.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="wip-client">Klient *</Label>
                <Input
                  id="wip-client"
                  value={wipForm.clientName}
                  onChange={(e) => setWipForm((f) => ({ ...f, clientName: e.target.value }))}
                  placeholder="Klient AB"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wip-case">Ärende *</Label>
                <Input
                  id="wip-case"
                  value={wipForm.caseRef}
                  onChange={(e) => setWipForm((f) => ({ ...f, caseRef: e.target.value }))}
                  placeholder="2024-001"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="wip-lawyer">Jurist</Label>
              <Input
                id="wip-lawyer"
                value={wipForm.lawyer}
                onChange={(e) => setWipForm((f) => ({ ...f, lawyer: e.target.value }))}
                placeholder="Namn på jurist"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="wip-hours">Timmar *</Label>
                <Input
                  id="wip-hours"
                  type="number"
                  step="0.5"
                  min={0}
                  value={wipForm.hours}
                  onChange={(e) => setWipForm((f) => ({ ...f, hours: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wip-rate">Timpris (kr) *</Label>
                <Input
                  id="wip-rate"
                  type="number"
                  min={0}
                  value={wipForm.hourlyRate}
                  onChange={(e) => setWipForm((f) => ({ ...f, hourlyRate: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wip-wd">Nedskr. %</Label>
                <Input
                  id="wip-wd"
                  type="number"
                  step="1"
                  min={0}
                  max={100}
                  value={wipForm.writeDownPct}
                  onChange={(e) => setWipForm((f) => ({ ...f, writeDownPct: parseFloat(e.target.value) || 0 }))}
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
              disabled={!wipForm.clientName.trim() || !wipForm.caseRef.trim() || wipForm.hours <= 0}
            >
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
              Är du säker på att du vill ta bort WIP-posten för{' '}
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
