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
  FolderKanban,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ProjectStatus = 'Pagaende' | 'Avslutat' | 'Vilande'

interface Project {
  id: string
  name: string
  client: string
  status: ProjectStatus
  budgetRevenue: number
  budgetCost: number
  actualRevenue: number
  actualCost: number
  wipBalance: number
  completionPct: number
  recognitionMethod: 'successiv' | 'vid-leverans'
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  Pagaende: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Avslutat: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  Vilande: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const PROJECT_STATUSES: ProjectStatus[] = ['Pagaende', 'Avslutat', 'Vilande']

const DEFAULT_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'Webbplattform Acme AB',
    client: 'Acme AB',
    status: 'Pagaende',
    budgetRevenue: 500000,
    budgetCost: 350000,
    actualRevenue: 280000,
    actualCost: 210000,
    wipBalance: 70000,
    completionPct: 60,
    recognitionMethod: 'successiv',
  },
  {
    id: '2',
    name: 'App-utveckling Beta Corp',
    client: 'Beta Corp',
    status: 'Pagaende',
    budgetRevenue: 800000,
    budgetCost: 560000,
    actualRevenue: 120000,
    actualCost: 95000,
    wipBalance: 45000,
    completionPct: 15,
    recognitionMethod: 'successiv',
  },
  {
    id: '3',
    name: 'IT-infrastruktur Gamma',
    client: 'Gamma Gruppen',
    status: 'Avslutat',
    budgetRevenue: 250000,
    budgetCost: 180000,
    actualRevenue: 250000,
    actualCost: 175000,
    wipBalance: 0,
    completionPct: 100,
    recognitionMethod: 'vid-leverans',
  },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_PROJECT: Omit<Project, 'id'> = {
  name: '',
  client: '',
  status: 'Pagaende',
  budgetRevenue: 0,
  budgetCost: 0,
  actualRevenue: 0,
  actualCost: 0,
  wipBalance: 0,
  completionPct: 0,
  recognitionMethod: 'successiv',
}

export function ProjektredovisningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [form, setForm] = useState(EMPTY_PROJECT)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)

  const saveProjects = useCallback(async (data: Project[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'projects',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'projects')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setProjects(data.config_value as Project[])
    } else {
      setProjects(DEFAULT_PROJECTS)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'projects',
          config_value: DEFAULT_PROJECTS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  // KPI calculations
  const totals = useMemo(() => {
    const active = projects.filter((p) => p.status === 'Pagaende')
    const totalBudgetRevenue = active.reduce((s, p) => s + p.budgetRevenue, 0)
    const totalBudgetCost = active.reduce((s, p) => s + p.budgetCost, 0)
    const totalActualRevenue = active.reduce((s, p) => s + p.actualRevenue, 0)
    const totalActualCost = active.reduce((s, p) => s + p.actualCost, 0)
    const totalWip = active.reduce((s, p) => s + p.wipBalance, 0)
    const projectedMargin = totalBudgetRevenue > 0
      ? ((totalBudgetRevenue - totalBudgetCost) / totalBudgetRevenue) * 100
      : 0
    const actualMargin = totalActualRevenue > 0
      ? ((totalActualRevenue - totalActualCost) / totalActualRevenue) * 100
      : 0
    return {
      activeCount: active.length,
      totalBudgetRevenue,
      totalActualRevenue,
      totalActualCost,
      totalWip,
      projectedMargin,
      actualMargin,
    }
  }, [projects])

  // Successive profit recognition
  const wipCalculation = useMemo(() => {
    return projects
      .filter((p) => p.status === 'Pagaende' && p.recognitionMethod === 'successiv')
      .map((p) => {
        const projectedProfit = p.budgetRevenue - p.budgetCost
        const recognizedRevenue = p.budgetRevenue * (p.completionPct / 100)
        const recognizedCost = p.budgetCost * (p.completionPct / 100)
        const recognizedProfit = recognizedRevenue - recognizedCost
        const wipValue = recognizedRevenue - p.actualRevenue
        return {
          ...p,
          projectedProfit,
          recognizedRevenue,
          recognizedCost,
          recognizedProfit,
          wipValue,
        }
      })
  }, [projects])

  function openNewProject() {
    setEditingProject(null)
    setForm({ ...EMPTY_PROJECT })
    setDialogOpen(true)
  }

  function openEditProject(project: Project) {
    setEditingProject(project)
    setForm({
      name: project.name,
      client: project.client,
      status: project.status,
      budgetRevenue: project.budgetRevenue,
      budgetCost: project.budgetCost,
      actualRevenue: project.actualRevenue,
      actualCost: project.actualCost,
      wipBalance: project.wipBalance,
      completionPct: project.completionPct,
      recognitionMethod: project.recognitionMethod,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const proj: Project = {
      id: editingProject?.id ?? crypto.randomUUID(),
      ...form,
    }

    let updated: Project[]
    if (editingProject) {
      updated = projects.map((p) => (p.id === editingProject.id ? proj : p))
    } else {
      updated = [...projects, proj]
    }

    setProjects(updated)
    setDialogOpen(false)
    await saveProjects(updated)
  }

  async function handleDelete() {
    if (!projectToDelete) return
    const updated = projects.filter((p) => p.id !== projectToDelete.id)
    setProjects(updated)
    setDeleteDialogOpen(false)
    setProjectToDelete(null)
    await saveProjects(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Tech & IT"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewProject}>
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
              <TabsTrigger value="projekt">Projekt</TabsTrigger>
              <TabsTrigger value="wip">WIP-berakning</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Aktiva projekt" value={String(totals.activeCount)} unit="st" />
                <KPICard label="Budget intakter" value={fmt(totals.totalBudgetRevenue)} unit="kr" />
                <KPICard label="Faktisk intakt" value={fmt(totals.totalActualRevenue)} unit="kr" />
                <KPICard
                  label="Faktisk marginal"
                  value={fmtPct(totals.actualMargin)}
                  unit="%"
                  trend={totals.actualMargin >= totals.projectedMargin ? 'up' : 'down'}
                  trendLabel={`Budget: ${fmtPct(totals.projectedMargin)}%`}
                />
                <KPICard label="WIP konto 1470" value={fmt(totals.totalWip)} unit="kr" />
              </div>
            </TabsContent>

            <TabsContent value="projekt" className="space-y-4">
              {projects.length === 0 ? (
                <EmptyModuleState
                  icon={FolderKanban}
                  title="Inga projekt"
                  description="Lagg till projekt for att borja med projektredovisning."
                  actionLabel="Nytt projekt"
                  onAction={openNewProject}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Projekt</TableHead>
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Budget intakt</TableHead>
                        <TableHead className="font-medium text-right">Faktisk intakt</TableHead>
                        <TableHead className="font-medium text-right">Faktisk kostnad</TableHead>
                        <TableHead className="font-medium text-right">Fardigt %</TableHead>
                        <TableHead className="font-medium text-right">Atgarder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projects.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.client}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_COLORS[p.status]}>
                              {p.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.budgetRevenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.actualRevenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.actualCost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.completionPct}%</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditProject(p)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => { setProjectToDelete(p); setDeleteDialogOpen(true) }}
                                title="Ta bort"
                              >
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
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="wip" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Successiv vinstavrakning (konto 1470)</CardTitle>
                </CardHeader>
                <CardContent>
                  {wipCalculation.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Inga pagaende projekt med successiv vinstavrakning.</p>
                  ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">Projekt</TableHead>
                            <TableHead className="font-medium text-right">Fardigt %</TableHead>
                            <TableHead className="font-medium text-right">Beraknad intakt</TableHead>
                            <TableHead className="font-medium text-right">Beraknad kostnad</TableHead>
                            <TableHead className="font-medium text-right">Beraknad vinst</TableHead>
                            <TableHead className="font-medium text-right">WIP-varde</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {wipCalculation.map((w) => (
                            <TableRow key={w.id}>
                              <TableCell className="font-medium">{w.name}</TableCell>
                              <TableCell className="text-right tabular-nums">{w.completionPct}%</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(w.recognizedRevenue)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(w.recognizedCost)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(w.recognizedProfit)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{fmt(w.wipValue)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell colSpan={5} className="text-right">Totalt WIP</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmt(wipCalculation.reduce((s, w) => s + w.wipValue, 0))}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Project Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Redigera projekt' : 'Nytt projekt'}</DialogTitle>
            <DialogDescription>
              {editingProject ? 'Uppdatera projektuppgifter.' : 'Fyll i uppgifter for det nya projektet.'}
            </DialogDescription>
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
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ProjectStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Metod</Label>
                <Select value={form.recognitionMethod} onValueChange={(v) => setForm((f) => ({ ...f, recognitionMethod: v as 'successiv' | 'vid-leverans' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="successiv">Successiv</SelectItem>
                    <SelectItem value="vid-leverans">Vid leverans</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Fardigt %</Label>
                <Input type="number" min={0} max={100} value={form.completionPct} onChange={(e) => setForm((f) => ({ ...f, completionPct: Number(e.target.value) }))} />
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
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Faktisk intakt (kr)</Label>
                <Input type="number" min={0} value={form.actualRevenue} onChange={(e) => setForm((f) => ({ ...f, actualRevenue: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Faktisk kostnad (kr)</Label>
                <Input type="number" min={0} value={form.actualCost} onChange={(e) => setForm((f) => ({ ...f, actualCost: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>WIP-saldo (kr)</Label>
                <Input type="number" min={0} value={form.wipBalance} onChange={(e) => setForm((f) => ({ ...f, wipBalance: Number(e.target.value) }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.client.trim()}>
              {editingProject ? 'Uppdatera' : 'Skapa projekt'}
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
              Ar du saker pa att du vill ta bort projektet &quot;{projectToDelete?.name}&quot;? Denna atgard kan inte angras.
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
