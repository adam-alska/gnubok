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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  BarChart3,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Consultant {
  id: string
  name: string
  team: string
  totalHours: number
  billableHours: number
}

interface MonthlyEntry {
  month: string
  consultants: Consultant[]
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

const DEFAULT_CONSULTANTS: Consultant[] = [
  { id: '1', name: 'Anna Svensson', team: 'Frontend', totalHours: 168, billableHours: 140 },
  { id: '2', name: 'Erik Lindberg', team: 'Backend', totalHours: 168, billableHours: 130 },
  { id: '3', name: 'Maria Karlsson', team: 'Frontend', totalHours: 168, billableHours: 150 },
  { id: '4', name: 'Johan Nilsson', team: 'DevOps', totalHours: 168, billableHours: 100 },
  { id: '5', name: 'Sara Johansson', team: 'Backend', totalHours: 168, billableHours: 120 },
]

const EMPTY_CONSULTANT = {
  name: '',
  team: '',
  totalHours: 168,
  billableHours: 0,
}

export function DebiteringsgradWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [target, setTarget] = useState(75)
  const [targetInput, setTargetInput] = useState('75')

  // Monthly trend data
  const [monthlyData, setMonthlyData] = useState<MonthlyEntry[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Consultant | null>(null)
  const [form, setForm] = useState(EMPTY_CONSULTANT)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Consultant | null>(null)

  const saveData = useCallback(async (data: Consultant[], tgt?: number) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'consultants',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )

    if (tgt !== undefined) {
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'utilization_target',
          config_value: tgt,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveMonthlyData = useCallback(async (data: MonthlyEntry[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'monthly_utilization',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: consultantData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'consultants')
      .maybeSingle()

    if (consultantData?.config_value && Array.isArray(consultantData.config_value) && consultantData.config_value.length > 0) {
      setConsultants(consultantData.config_value as Consultant[])
    } else {
      setConsultants(DEFAULT_CONSULTANTS)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'consultants',
          config_value: DEFAULT_CONSULTANTS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: targetData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'utilization_target')
      .maybeSingle()

    if (targetData?.config_value != null) {
      const val = Number(targetData.config_value)
      setTarget(val)
      setTargetInput(String(val))
    }

    const { data: monthData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'monthly_utilization')
      .maybeSingle()

    if (monthData?.config_value && Array.isArray(monthData.config_value)) {
      setMonthlyData(monthData.config_value as MonthlyEntry[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  // KPIs
  const kpis = useMemo(() => {
    const totalHours = consultants.reduce((s, c) => s + c.totalHours, 0)
    const billableHours = consultants.reduce((s, c) => s + c.billableHours, 0)
    const utilization = totalHours > 0 ? (billableHours / totalHours) * 100 : 0
    const variance = utilization - target

    // Team breakdown
    const teams: Record<string, { totalHours: number; billableHours: number; count: number }> = {}
    for (const c of consultants) {
      if (!teams[c.team]) teams[c.team] = { totalHours: 0, billableHours: 0, count: 0 }
      teams[c.team].totalHours += c.totalHours
      teams[c.team].billableHours += c.billableHours
      teams[c.team].count++
    }
    const teamStats = Object.entries(teams).map(([team, data]) => ({
      team,
      ...data,
      utilization: data.totalHours > 0 ? (data.billableHours / data.totalHours) * 100 : 0,
    }))

    return { totalHours, billableHours, utilization, variance, teamStats }
  }, [consultants, target])

  // Monthly trend
  const trendData = useMemo(() => {
    return monthlyData.map((m) => {
      const totalH = m.consultants.reduce((s, c) => s + c.totalHours, 0)
      const billH = m.consultants.reduce((s, c) => s + c.billableHours, 0)
      return {
        month: m.month,
        utilization: totalH > 0 ? (billH / totalH) * 100 : 0,
        totalHours: totalH,
        billableHours: billH,
      }
    }).sort((a, b) => a.month.localeCompare(b.month))
  }, [monthlyData])

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_CONSULTANT })
    setDialogOpen(true)
  }

  function openEdit(c: Consultant) {
    setEditing(c)
    setForm({
      name: c.name,
      team: c.team,
      totalHours: c.totalHours,
      billableHours: c.billableHours,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: Consultant = {
      id: editing?.id ?? crypto.randomUUID(),
      name: form.name.trim(),
      team: form.team.trim(),
      totalHours: form.totalHours,
      billableHours: form.billableHours,
    }

    let updated: Consultant[]
    if (editing) {
      updated = consultants.map((c) => (c.id === editing.id ? item : c))
    } else {
      updated = [...consultants, item]
    }

    setConsultants(updated)
    setDialogOpen(false)
    await saveData(updated)

    // Save to monthly trend
    const month = currentMonth()
    const existingIdx = monthlyData.findIndex((m) => m.month === month)
    let newMonthly: MonthlyEntry[]
    if (existingIdx >= 0) {
      newMonthly = [...monthlyData]
      newMonthly[existingIdx] = { month, consultants: updated }
    } else {
      newMonthly = [...monthlyData, { month, consultants: updated }]
    }
    setMonthlyData(newMonthly)
    await saveMonthlyData(newMonthly)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = consultants.filter((c) => c.id !== toDelete.id)
    setConsultants(updated)
    setDeleteDialogOpen(false)
    setToDelete(null)
    await saveData(updated)
  }

  async function handleSaveTarget() {
    const val = parseFloat(targetInput)
    if (isNaN(val)) return
    setTarget(val)
    await saveData(consultants, val)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="rapport"
        sectorName="Tech & IT"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Lagg till konsult
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
              <TabsTrigger value="konsulter">Per konsult</TabsTrigger>
              <TabsTrigger value="team">Per team</TabsTrigger>
              <TabsTrigger value="trend">Trend</TabsTrigger>
              <TabsTrigger value="installningar">Installningar</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard
                  label="Debiteringsgrad"
                  value={fmtPct(kpis.utilization)}
                  unit="%"
                  target={target}
                  trend={kpis.variance >= 0 ? 'up' : 'down'}
                  trendLabel={`${kpis.variance >= 0 ? '+' : ''}${fmtPct(kpis.variance)} pp`}
                />
                <KPICard label="Malvarde" value={fmtPct(target)} unit="%" />
                <KPICard label="Debiterbara timmar" value={fmt(kpis.billableHours)} unit="tim" />
                <KPICard label="Totala timmar" value={fmt(kpis.totalHours)} unit="tim" />
                <KPICard label="Antal konsulter" value={String(consultants.length)} unit="st" />
              </div>
            </TabsContent>

            <TabsContent value="konsulter" className="space-y-4">
              {consultants.length === 0 ? (
                <EmptyModuleState
                  icon={BarChart3}
                  title="Inga konsulter"
                  description="Lagg till konsulter for att berakna debiteringsgrad."
                  actionLabel="Lagg till konsult"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Namn</TableHead>
                        <TableHead className="font-medium">Team</TableHead>
                        <TableHead className="font-medium text-right">Tot timmar</TableHead>
                        <TableHead className="font-medium text-right">Debiterbara</TableHead>
                        <TableHead className="font-medium text-right">Debiteringsgrad</TableHead>
                        <TableHead className="font-medium text-right">vs Mal</TableHead>
                        <TableHead className="font-medium text-right">Atgarder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consultants.map((c) => {
                        const util = c.totalHours > 0 ? (c.billableHours / c.totalHours) * 100 : 0
                        const diff = util - target
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.name}</TableCell>
                            <TableCell><Badge variant="outline">{c.team}</Badge></TableCell>
                            <TableCell className="text-right tabular-nums">{c.totalHours}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.billableHours}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              <span className={util >= target ? 'text-emerald-600' : 'text-red-500'}>
                                {fmtPct(util)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className={diff >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                                {diff >= 0 ? '+' : ''}{fmtPct(diff)} pp
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(c); setDeleteDialogOpen(true) }} title="Ta bort">
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

            <TabsContent value="team" className="space-y-4">
              {kpis.teamStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga team att visa.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {kpis.teamStats.map((t) => (
                    <Card key={t.team}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span>{t.team}</span>
                          <Badge variant="outline">{t.count} konsulter</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-2xl font-semibold ${t.utilization >= target ? 'text-emerald-600' : 'text-red-500'}`}>
                            {fmtPct(t.utilization)}%
                          </span>
                          <span className="text-sm text-muted-foreground">debiteringsgrad</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${t.utilization >= target ? 'bg-emerald-500' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(100, t.utilization)}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {fmt(t.billableHours)} / {fmt(t.totalHours)} timmar
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="trend" className="space-y-4">
              {trendData.length === 0 ? (
                <EmptyModuleState
                  icon={BarChart3}
                  title="Ingen trenddata"
                  description="Spara konsultdata for att borja bygga upp en manadstrend."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Manad</TableHead>
                        <TableHead className="font-medium text-right">Tot timmar</TableHead>
                        <TableHead className="font-medium text-right">Debiterbara</TableHead>
                        <TableHead className="font-medium text-right">Debiteringsgrad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trendData.map((m) => (
                        <TableRow key={m.month}>
                          <TableCell className="font-medium">{m.month}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(m.totalHours)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(m.billableHours)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            <span className={m.utilization >= target ? 'text-emerald-600' : 'text-red-500'}>
                              {fmtPct(m.utilization)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="installningar" className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
                <h3 className="text-sm font-semibold">Malvarde debiteringsgrad</h3>
                <p className="text-xs text-muted-foreground">
                  Ange ditt malvarde for debiteringsgrad i procent. Typiskt 70-85% for konsultbolag.
                </p>
                <div className="flex items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Mal (%)</Label>
                    <Input
                      type="number"
                      step="0.1"
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
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Redigera konsult' : 'Ny konsult'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Uppdatera konsultens tidsdata.' : 'Lagg till en ny konsult och dess timmar.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Namn *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Anna Svensson" />
              </div>
              <div className="grid gap-2">
                <Label>Team *</Label>
                <Input value={form.team} onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))} placeholder="Frontend" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Totala timmar</Label>
                <Input type="number" min={0} value={form.totalHours} onChange={(e) => setForm((f) => ({ ...f, totalHours: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Debiterbara timmar</Label>
                <Input type="number" min={0} value={form.billableHours} onChange={(e) => setForm((f) => ({ ...f, billableHours: Number(e.target.value) }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.team.trim()}>
              {editing ? 'Uppdatera' : 'Lagg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort konsult</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort {toDelete?.name}? Denna atgard kan inte angras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
