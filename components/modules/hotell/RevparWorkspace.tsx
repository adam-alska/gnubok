'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
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
  TrendingUp,
  Save,
  BarChart3,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface MonthlyData {
  id: string
  month: string
  roomsAvailable: number
  roomsSold: number
  roomRevenue: number
  revpar: number
  occupancy: number
  adr: number
}

interface RevparTarget {
  revparTarget: number
  occupancyTarget: number
  adrTarget: number
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function RevparWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<MonthlyData[]>([])
  const [targets, setTargets] = useState<RevparTarget>({ revparTarget: 0, occupancyTarget: 0, adrTarget: 0 })
  const [targetInput, setTargetInput] = useState({ revpar: '', occupancy: '', adr: '' })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<MonthlyData | null>(null)
  const [form, setForm] = useState({ month: currentMonth(), roomsAvailable: 0, roomsSold: 0, roomRevenue: 0 })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<MonthlyData | null>(null)

  const saveData = useCallback(async (newData: MonthlyData[], newTargets?: RevparTarget) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const ops = [
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'monthly_data', config_value: newData },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
    ]
    if (newTargets) {
      ops.push(
        supabase.from('module_configs').upsert(
          { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'targets', config_value: newTargets },
          { onConflict: 'user_id,sector_slug,module_slug,config_key' }
        )
      )
    }
    await Promise.all(ops)
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: rows } = await supabase
      .from('module_configs')
      .select('config_key, config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .in('config_key', ['monthly_data', 'targets'])

    for (const row of rows ?? []) {
      if (row.config_key === 'monthly_data' && Array.isArray(row.config_value)) {
        setData(row.config_value as MonthlyData[])
      }
      if (row.config_key === 'targets' && row.config_value) {
        const t = row.config_value as RevparTarget
        setTargets(t)
        setTargetInput({ revpar: String(t.revparTarget || ''), occupancy: String(t.occupancyTarget || ''), adr: String(t.adrTarget || '') })
      }
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.month.localeCompare(a.month))
  }, [data])

  // Current month KPIs
  const current = useMemo(() => {
    const cm = data.find(d => d.month === currentMonth())
    return cm ?? null
  }, [data])

  function openNew() {
    setEditingEntry(null)
    setForm({ month: currentMonth(), roomsAvailable: 0, roomsSold: 0, roomRevenue: 0 })
    setDialogOpen(true)
  }

  function openEdit(entry: MonthlyData) {
    setEditingEntry(entry)
    setForm({ month: entry.month, roomsAvailable: entry.roomsAvailable, roomsSold: entry.roomsSold, roomRevenue: entry.roomRevenue })
    setDialogOpen(true)
  }

  async function handleSave() {
    const roomsAvailable = form.roomsAvailable
    const roomsSold = form.roomsSold
    const roomRevenue = form.roomRevenue
    const occupancy = roomsAvailable > 0 ? (roomsSold / roomsAvailable) * 100 : 0
    const adr = roomsSold > 0 ? roomRevenue / roomsSold : 0
    const revpar = roomsAvailable > 0 ? roomRevenue / roomsAvailable : 0

    const item: MonthlyData = {
      id: editingEntry?.id ?? generateId(),
      month: form.month,
      roomsAvailable,
      roomsSold,
      roomRevenue,
      revpar,
      occupancy,
      adr,
    }

    let updated: MonthlyData[]
    if (editingEntry) {
      updated = data.map(d => d.id === editingEntry.id ? item : d)
    } else {
      if (data.some(d => d.month === form.month)) {
        updated = data.map(d => d.month === form.month ? { ...item, id: d.id } : d)
      } else {
        updated = [...data, item]
      }
    }
    setData(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  async function handleDelete() {
    if (!entryToDelete) return
    const updated = data.filter(d => d.id !== entryToDelete.id)
    setData(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveData(updated)
  }

  async function handleSaveTargets() {
    const newTargets: RevparTarget = {
      revparTarget: parseFloat(targetInput.revpar) || 0,
      occupancyTarget: parseFloat(targetInput.occupancy) || 0,
      adrTarget: parseFloat(targetInput.adr) || 0,
    }
    setTargets(newTargets)
    await saveData(data, newTargets)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Lagg till manad
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList>
              <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
              <TabsTrigger value="trend">Manadstrend</TabsTrigger>
              <TabsTrigger value="mal">Malvarden</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              {!current ? (
                <EmptyModuleState
                  icon={BarChart3}
                  title="Ingen data for aktuell manad"
                  description="Lagg till data for att se RevPAR, belaggning och ADR."
                  actionLabel="Lagg till data"
                  onAction={openNew}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <KPICard
                    label="RevPAR"
                    value={fmtDec(current.revpar)}
                    unit="kr"
                    target={targets.revparTarget || undefined}
                    trend={targets.revparTarget > 0 ? (current.revpar >= targets.revparTarget ? 'up' : 'down') : undefined}
                  />
                  <KPICard
                    label="Belaggning"
                    value={fmtPct(current.occupancy)}
                    unit="%"
                    target={targets.occupancyTarget || undefined}
                    trend={targets.occupancyTarget > 0 ? (current.occupancy >= targets.occupancyTarget ? 'up' : 'down') : undefined}
                  />
                  <KPICard
                    label="ADR"
                    value={fmtDec(current.adr)}
                    unit="kr"
                    target={targets.adrTarget || undefined}
                    trend={targets.adrTarget > 0 ? (current.adr >= targets.adrTarget ? 'up' : 'down') : undefined}
                  />
                  <KPICard label="Rum tillgangliga" value={fmt(current.roomsAvailable)} unit="st" />
                  <KPICard label="Rum salda" value={fmt(current.roomsSold)} unit="st" />
                </div>
              )}
            </TabsContent>

            <TabsContent value="trend" className="space-y-4">
              {sortedData.length === 0 ? (
                <EmptyModuleState icon={TrendingUp} title="Ingen data" description="Lagg till manadsdata for att se trender." actionLabel="Lagg till" onAction={openNew} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Manad</TableHead>
                        <TableHead className="font-medium text-right">Tillgangliga</TableHead>
                        <TableHead className="font-medium text-right">Salda</TableHead>
                        <TableHead className="font-medium text-right">Intakt (kr)</TableHead>
                        <TableHead className="font-medium text-right">RevPAR</TableHead>
                        <TableHead className="font-medium text-right">Belaggning %</TableHead>
                        <TableHead className="font-medium text-right">ADR</TableHead>
                        <TableHead className="font-medium text-right">Atgarder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedData.map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.month}</TableCell>
                          <TableCell className="text-right">{fmt(entry.roomsAvailable)}</TableCell>
                          <TableCell className="text-right">{fmt(entry.roomsSold)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(entry.roomRevenue)}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{fmtDec(entry.revpar)}</TableCell>
                          <TableCell className="text-right font-mono">{fmtPct(entry.occupancy)}%</TableCell>
                          <TableCell className="text-right font-mono">{fmtDec(entry.adr)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(entry)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(entry); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="mal" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
                <h3 className="text-sm font-semibold">Malvarden</h3>
                <p className="text-xs text-muted-foreground">Ange malvarden for RevPAR, belaggning och ADR.</p>
                <div className="grid gap-4">
                  <div className="flex items-end gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Label className="text-xs">RevPAR-mal (kr)</Label>
                      <Input type="number" step="0.01" min={0} value={targetInput.revpar} onChange={e => setTargetInput(t => ({ ...t, revpar: e.target.value }))} className="h-9" placeholder="800" />
                    </div>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Label className="text-xs">Belaggningsmal (%)</Label>
                      <Input type="number" step="0.1" min={0} max={100} value={targetInput.occupancy} onChange={e => setTargetInput(t => ({ ...t, occupancy: e.target.value }))} className="h-9" placeholder="75" />
                    </div>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="space-y-1.5 flex-1">
                      <Label className="text-xs">ADR-mal (kr)</Label>
                      <Input type="number" step="0.01" min={0} value={targetInput.adr} onChange={e => setTargetInput(t => ({ ...t, adr: e.target.value }))} className="h-9" placeholder="1200" />
                    </div>
                  </div>
                </div>
                <Button size="sm" onClick={handleSaveTargets} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                  Spara malvarden
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera manadsdata' : 'Ny manadsdata'}</DialogTitle>
            <DialogDescription>Ange rum tillgangliga, salda och rumsintakt for att berakna RevPAR.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Manad *</Label>
              <Input type="month" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Rum tillgangliga (rumdagar)</Label>
                <Input type="number" min={0} value={form.roomsAvailable || ''} onChange={e => setForm(f => ({ ...f, roomsAvailable: parseInt(e.target.value) || 0 }))} placeholder="3000" />
              </div>
              <div className="grid gap-2">
                <Label>Rum salda</Label>
                <Input type="number" min={0} value={form.roomsSold || ''} onChange={e => setForm(f => ({ ...f, roomsSold: parseInt(e.target.value) || 0 }))} placeholder="2250" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Rumsintakt (kr)</Label>
              <Input type="number" min={0} step="0.01" value={form.roomRevenue || ''} onChange={e => setForm(f => ({ ...f, roomRevenue: parseFloat(e.target.value) || 0 }))} placeholder="2700000" />
            </div>
            {form.roomsAvailable > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">RevPAR:</span><span className="font-mono font-semibold">{fmtDec(form.roomRevenue / form.roomsAvailable)} kr</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Belaggning:</span><span className="font-mono">{fmtPct(form.roomsAvailable > 0 ? (form.roomsSold / form.roomsAvailable) * 100 : 0)}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">ADR:</span><span className="font-mono">{form.roomsSold > 0 ? fmtDec(form.roomRevenue / form.roomsSold) : '0,00'} kr</span></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.month || form.roomsAvailable <= 0}>{editingEntry ? 'Uppdatera' : 'Spara'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort manadsdata</DialogTitle>
            <DialogDescription>Ar du saker pa att du vill ta bort data for {entryToDelete?.month}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
