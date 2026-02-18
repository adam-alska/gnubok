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
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ProjectEntry {
  id: string
  name: string
  client: string
  budgetRevenue: number
  budgetCost: number
  actualRevenue: number
  actualCost: number
  hoursEstimated: number
  hoursActual: number
  hourlyRateBudget: number
  hourlyRateActual: number
}

const DEFAULT_PROJECTS: ProjectEntry[] = [
  {
    id: '1', name: 'Webbplattform Acme', client: 'Acme AB',
    budgetRevenue: 500000, budgetCost: 350000,
    actualRevenue: 450000, actualCost: 320000,
    hoursEstimated: 500, hoursActual: 460,
    hourlyRateBudget: 1000, hourlyRateActual: 978,
  },
  {
    id: '2', name: 'Mobilapp Beta', client: 'Beta Corp',
    budgetRevenue: 800000, budgetCost: 560000,
    actualRevenue: 700000, actualCost: 620000,
    hoursEstimated: 800, hoursActual: 850,
    hourlyRateBudget: 1000, hourlyRateActual: 824,
  },
  {
    id: '3', name: 'IT-drift Gamma', client: 'Gamma Gruppen',
    budgetRevenue: 200000, budgetCost: 140000,
    actualRevenue: 200000, actualCost: 130000,
    hoursEstimated: 200, hoursActual: 180,
    hourlyRateBudget: 1000, hourlyRateActual: 1111,
  },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM: Omit<ProjectEntry, 'id'> = {
  name: '',
  client: '',
  budgetRevenue: 0,
  budgetCost: 0,
  actualRevenue: 0,
  actualCost: 0,
  hoursEstimated: 0,
  hoursActual: 0,
  hourlyRateBudget: 0,
  hourlyRateActual: 0,
}

export function ProjektlonsamhetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<ProjectEntry[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<ProjectEntry | null>(null)

  const saveData = useCallback(async (data: ProjectEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'profitability_projects',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'profitability_projects')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setProjects(data.config_value as ProjectEntry[])
    } else {
      setProjects(DEFAULT_PROJECTS)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'profitability_projects',
          config_value: DEFAULT_PROJECTS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = useMemo(() => {
    const totalBudgetRevenue = projects.reduce((s, p) => s + p.budgetRevenue, 0)
    const totalBudgetCost = projects.reduce((s, p) => s + p.budgetCost, 0)
    const totalActualRevenue = projects.reduce((s, p) => s + p.actualRevenue, 0)
    const totalActualCost = projects.reduce((s, p) => s + p.actualCost, 0)
    const budgetMargin = totalBudgetRevenue > 0 ? ((totalBudgetRevenue - totalBudgetCost) / totalBudgetRevenue) * 100 : 0
    const actualMargin = totalActualRevenue > 0 ? ((totalActualRevenue - totalActualCost) / totalActualRevenue) * 100 : 0
    const totalProfit = totalActualRevenue - totalActualCost
    const budgetProfit = totalBudgetRevenue - totalBudgetCost
    return { totalBudgetRevenue, totalActualRevenue, totalActualCost, budgetMargin, actualMargin, totalProfit, budgetProfit }
  }, [projects])

  const projectCalcs = useMemo(() => {
    return projects.map((p) => {
      const budgetMargin = p.budgetRevenue > 0 ? ((p.budgetRevenue - p.budgetCost) / p.budgetRevenue) * 100 : 0
      const actualMargin = p.actualRevenue > 0 ? ((p.actualRevenue - p.actualCost) / p.actualRevenue) * 100 : 0
      const profit = p.actualRevenue - p.actualCost
      const budgetVariance = profit - (p.budgetRevenue - p.budgetCost)
      const hourVariance = p.hoursActual - p.hoursEstimated
      return { ...p, budgetMargin, actualMargin, profit, budgetVariance, hourVariance }
    })
  }, [projects])

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(p: ProjectEntry) {
    setEditing(p)
    setForm({
      name: p.name, client: p.client,
      budgetRevenue: p.budgetRevenue, budgetCost: p.budgetCost,
      actualRevenue: p.actualRevenue, actualCost: p.actualCost,
      hoursEstimated: p.hoursEstimated, hoursActual: p.hoursActual,
      hourlyRateBudget: p.hourlyRateBudget, hourlyRateActual: p.hourlyRateActual,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: ProjectEntry = {
      id: editing?.id ?? crypto.randomUUID(),
      ...form,
      name: form.name.trim(),
      client: form.client.trim(),
    }
    let updated: ProjectEntry[]
    if (editing) {
      updated = projects.map((p) => (p.id === editing.id ? item : p))
    } else {
      updated = [...projects, item]
    }
    setProjects(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = projects.filter((p) => p.id !== toDelete.id)
    setProjects(updated)
    setDeleteDialogOpen(false)
    setToDelete(null)
    await saveData(updated)
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
            Nytt projekt
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
              <TabsTrigger value="projekt">Per projekt</TabsTrigger>
              <TabsTrigger value="timmar">Timanalys</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Antal projekt" value={String(projects.length)} unit="st" />
                <KPICard label="Faktisk intakt" value={fmt(kpis.totalActualRevenue)} unit="kr" />
                <KPICard label="Faktisk kostnad" value={fmt(kpis.totalActualCost)} unit="kr" />
                <KPICard
                  label="Faktisk marginal"
                  value={fmtPct(kpis.actualMargin)}
                  unit="%"
                  target={Math.round(kpis.budgetMargin)}
                  trend={kpis.actualMargin >= kpis.budgetMargin ? 'up' : 'down'}
                  trendLabel={`Budget: ${fmtPct(kpis.budgetMargin)}%`}
                />
                <KPICard
                  label="Total vinst"
                  value={fmt(kpis.totalProfit)}
                  unit="kr"
                  trend={kpis.totalProfit >= kpis.budgetProfit ? 'up' : 'down'}
                />
              </div>
            </TabsContent>

            <TabsContent value="projekt" className="space-y-4">
              {projects.length === 0 ? (
                <EmptyModuleState
                  icon={TrendingUp}
                  title="Inga projekt"
                  description="Lagg till projekt for att analysera lonsamhet."
                  actionLabel="Nytt projekt"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Projekt</TableHead>
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium text-right">Intakt</TableHead>
                        <TableHead className="font-medium text-right">Kostnad</TableHead>
                        <TableHead className="font-medium text-right">Vinst</TableHead>
                        <TableHead className="font-medium text-right">Marginal</TableHead>
                        <TableHead className="font-medium text-right">vs Budget</TableHead>
                        <TableHead className="font-medium text-right">Atgarder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectCalcs.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.client}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.actualRevenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.actualCost)}</TableCell>
                          <TableCell className={cn('text-right tabular-nums font-medium', p.profit >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {fmt(p.profit)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={p.actualMargin >= p.budgetMargin ? 'text-emerald-600' : 'text-red-500'}>
                              {fmtPct(p.actualMargin)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={p.budgetVariance >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                              {p.budgetVariance >= 0 ? '+' : ''}{fmt(p.budgetVariance)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(p); setDeleteDialogOpen(true) }} title="Ta bort">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell colSpan={2}>Totalt</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(kpis.totalActualRevenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(kpis.totalActualCost)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(kpis.totalProfit)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(kpis.actualMargin)}%</TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
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

            <TabsContent value="timmar" className="space-y-4">
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga projekt att analysera.</p>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Projekt</TableHead>
                        <TableHead className="font-medium text-right">Budget tim</TableHead>
                        <TableHead className="font-medium text-right">Faktiska tim</TableHead>
                        <TableHead className="font-medium text-right">Avvikelse</TableHead>
                        <TableHead className="font-medium text-right">Budget kr/tim</TableHead>
                        <TableHead className="font-medium text-right">Faktiskt kr/tim</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectCalcs.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.hoursEstimated)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.hoursActual)}</TableCell>
                          <TableCell className={cn('text-right tabular-nums', p.hourVariance <= 0 ? 'text-emerald-600' : 'text-red-500')}>
                            {p.hourVariance >= 0 ? '+' : ''}{fmt(p.hourVariance)} tim
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.hourlyRateBudget)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.hourlyRateActual)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Redigera projekt' : 'Nytt projekt'}</DialogTitle>
            <DialogDescription>{editing ? 'Uppdatera projektets uppgifter.' : 'Fyll i uppgifter for att analysera projektlonsamhet.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Projektnamn *</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Webbplattform" />
              </div>
              <div className="grid gap-2">
                <Label>Kund *</Label>
                <Input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} placeholder="Acme AB" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Budget intakt (kr)</Label>
                <Input type="number" min={0} value={form.budgetRevenue} onChange={(e) => setForm((f) => ({ ...f, budgetRevenue: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Budget kostnad (kr)</Label>
                <Input type="number" min={0} value={form.budgetCost} onChange={(e) => setForm((f) => ({ ...f, budgetCost: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Faktisk intakt (kr)</Label>
                <Input type="number" min={0} value={form.actualRevenue} onChange={(e) => setForm((f) => ({ ...f, actualRevenue: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Faktisk kostnad (kr)</Label>
                <Input type="number" min={0} value={form.actualCost} onChange={(e) => setForm((f) => ({ ...f, actualCost: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Budget timmar</Label>
                <Input type="number" min={0} value={form.hoursEstimated} onChange={(e) => setForm((f) => ({ ...f, hoursEstimated: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Faktiska timmar</Label>
                <Input type="number" min={0} value={form.hoursActual} onChange={(e) => setForm((f) => ({ ...f, hoursActual: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Budget kr/timme</Label>
                <Input type="number" min={0} value={form.hourlyRateBudget} onChange={(e) => setForm((f) => ({ ...f, hourlyRateBudget: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Faktiskt kr/timme</Label>
                <Input type="number" min={0} value={form.hourlyRateActual} onChange={(e) => setForm((f) => ({ ...f, hourlyRateActual: Number(e.target.value) }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.client.trim()}>
              {editing ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort projekt</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort &quot;{toDelete?.name}&quot;? Denna atgard kan inte angras.
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
