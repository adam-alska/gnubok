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
import { Textarea } from '@/components/ui/textarea'
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
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ProjectStatus = 'Planering' | 'Pagaende' | 'Granskning' | 'Klart' | 'Parkerat'
type Priority = 'Lag' | 'Medium' | 'Hog' | 'Kritisk'

interface Milestone {
  id: string
  name: string
  dueDate: string
  completed: boolean
}

interface Project {
  id: string
  name: string
  client: string
  status: ProjectStatus
  priority: Priority
  startDate: string
  endDate: string
  budget: number
  spent: number
  description: string
  milestones: Milestone[]
}

const STATUSES: ProjectStatus[] = ['Planering', 'Pagaende', 'Granskning', 'Klart', 'Parkerat']
const PRIORITIES: Priority[] = ['Lag', 'Medium', 'Hog', 'Kritisk']

const STATUS_COLORS: Record<ProjectStatus, string> = {
  Planering: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  Pagaende: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Granskning: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  Klart: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  Parkerat: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const PRIORITY_COLORS: Record<Priority, string> = {
  Lag: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  Medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Hog: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  Kritisk: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const DEFAULT_PROJECTS: Project[] = [
  {
    id: '1', name: 'Webbplattform v2', client: 'Acme AB', status: 'Pagaende', priority: 'Hog',
    startDate: '2024-03-01', endDate: '2024-09-30', budget: 600000, spent: 320000,
    description: 'Ombyggnad av kundplattform med ny teknisk arkitektur.',
    milestones: [
      { id: 'm1', name: 'Design klar', dueDate: '2024-04-15', completed: true },
      { id: 'm2', name: 'Backend MVP', dueDate: '2024-06-30', completed: true },
      { id: 'm3', name: 'Frontend klar', dueDate: '2024-08-15', completed: false },
      { id: 'm4', name: 'Lansering', dueDate: '2024-09-30', completed: false },
    ],
  },
  {
    id: '2', name: 'Mobilapp Beta', client: 'Beta Corp', status: 'Planering', priority: 'Medium',
    startDate: '2024-07-01', endDate: '2024-12-31', budget: 400000, spent: 0,
    description: 'Ny mobilapp for kundportal.',
    milestones: [
      { id: 'm5', name: 'Kravspecifikation', dueDate: '2024-07-31', completed: false },
      { id: 'm6', name: 'Prototyp', dueDate: '2024-09-30', completed: false },
    ],
  },
  {
    id: '3', name: 'IT-drift migration', client: 'Gamma Gruppen', status: 'Klart', priority: 'Kritisk',
    startDate: '2024-01-15', endDate: '2024-04-30', budget: 200000, spent: 185000,
    description: 'Migrering av servermiljo till moln.',
    milestones: [
      { id: 'm7', name: 'Planering klar', dueDate: '2024-02-01', completed: true },
      { id: 'm8', name: 'Migration klar', dueDate: '2024-04-30', completed: true },
    ],
  },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM: Omit<Project, 'id'> = {
  name: '', client: '', status: 'Planering', priority: 'Medium',
  startDate: new Date().toISOString().slice(0, 10), endDate: '',
  budget: 0, spent: 0, description: '', milestones: [],
}

export function ProjekthanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const [milestoneProject, setMilestoneProject] = useState<Project | null>(null)
  const [msForm, setMsForm] = useState({ name: '', dueDate: '' })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Project | null>(null)

  const saveData = useCallback(async (data: Project[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'managed_projects',
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
      .eq('config_key', 'managed_projects')
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
          config_key: 'managed_projects',
          config_value: DEFAULT_PROJECTS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'Klart' && p.status !== 'Parkerat')
    const totalBudget = active.reduce((s, p) => s + p.budget, 0)
    const totalSpent = active.reduce((s, p) => s + p.spent, 0)
    const budgetUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
    const allMilestones = projects.flatMap((p) => p.milestones)
    const completedMs = allMilestones.filter((m) => m.completed).length
    const overdue = allMilestones.filter((m) => !m.completed && new Date(m.dueDate) < new Date()).length
    return { activeCount: active.length, totalBudget, totalSpent, budgetUsed, completedMs, totalMs: allMilestones.length, overdue }
  }, [projects])

  // Board view grouped by status
  const boardColumns = useMemo(() => {
    return STATUSES.map((status) => ({
      status,
      projects: projects.filter((p) => p.status === status),
    }))
  }, [projects])

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(p: Project) {
    setEditing(p)
    setForm({
      name: p.name, client: p.client, status: p.status, priority: p.priority,
      startDate: p.startDate, endDate: p.endDate, budget: p.budget, spent: p.spent,
      description: p.description, milestones: p.milestones,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: Project = {
      id: editing?.id ?? crypto.randomUUID(),
      ...form,
      name: form.name.trim(),
      client: form.client.trim(),
    }
    let updated: Project[]
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

  function openAddMilestone(project: Project) {
    setMilestoneProject(project)
    setMsForm({ name: '', dueDate: '' })
    setMilestoneDialogOpen(true)
  }

  async function handleAddMilestone() {
    if (!milestoneProject) return
    const ms: Milestone = {
      id: crypto.randomUUID(),
      name: msForm.name.trim(),
      dueDate: msForm.dueDate,
      completed: false,
    }
    const updated = projects.map((p) =>
      p.id === milestoneProject.id
        ? { ...p, milestones: [...p.milestones, ms] }
        : p
    )
    setProjects(updated)
    setMilestoneDialogOpen(false)
    await saveData(updated)
  }

  async function toggleMilestone(projectId: string, milestoneId: string) {
    const updated = projects.map((p) =>
      p.id === projectId
        ? {
            ...p,
            milestones: p.milestones.map((m) =>
              m.id === milestoneId ? { ...m, completed: !m.completed } : m
            ),
          }
        : p
    )
    setProjects(updated)
    await saveData(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
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
          <Tabs defaultValue="board" className="space-y-6">
            <TabsList>
              <TabsTrigger value="board">Projektboard</TabsTrigger>
              <TabsTrigger value="milestones">Milstolpar</TabsTrigger>
              <TabsTrigger value="budget">Budgetuppfoljning</TabsTrigger>
            </TabsList>

            <TabsContent value="board" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Aktiva projekt" value={String(kpis.activeCount)} unit="st" />
                <KPICard label="Total budget" value={fmt(kpis.totalBudget)} unit="kr" />
                <KPICard label="Budget anvant" value={fmtPct(kpis.budgetUsed)} unit="%" trend={kpis.budgetUsed > 90 ? 'down' : 'up'} />
                <KPICard label="Forsenade milstolpar" value={String(kpis.overdue)} unit="st" trend={kpis.overdue > 0 ? 'down' : 'up'} />
              </div>

              {/* Board */}
              <div className="grid gap-4 lg:grid-cols-5">
                {boardColumns.map((col) => (
                  <div key={col.status} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className={STATUS_COLORS[col.status]}>{col.status}</Badge>
                      <span className="text-xs text-muted-foreground">{col.projects.length}</span>
                    </div>
                    {col.projects.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        Inga projekt
                      </div>
                    ) : (
                      col.projects.map((p) => (
                        <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEdit(p)}>
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-1">
                              <h4 className="text-sm font-medium leading-tight">{p.name}</h4>
                              <Badge variant="outline" className={cn('text-[10px] shrink-0', PRIORITY_COLORS[p.priority])}>{p.priority}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">{p.client}</p>
                            {p.budget > 0 && (
                              <div className="space-y-1">
                                <div className="w-full bg-muted rounded-full h-1.5">
                                  <div
                                    className={cn('h-1.5 rounded-full', p.spent / p.budget > 0.9 ? 'bg-red-400' : 'bg-emerald-500')}
                                    style={{ width: `${Math.min(100, (p.spent / p.budget) * 100)}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-muted-foreground">{fmt(p.spent)} / {fmt(p.budget)} kr</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="milestones" className="space-y-6">
              {projects.map((p) => (
                <Card key={p.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{p.name}</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => openAddMilestone(p)}>
                        <Plus className="mr-1 h-3 w-3" /> Milstolpe
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {p.milestones.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Inga milstolpar.</p>
                    ) : (
                      <div className="space-y-2">
                        {p.milestones.map((ms) => {
                          const overdue = !ms.completed && new Date(ms.dueDate) < new Date()
                          return (
                            <div
                              key={ms.id}
                              className={cn(
                                'flex items-center gap-3 p-2 rounded-lg border text-sm',
                                ms.completed ? 'bg-muted/30 border-border' : overdue ? 'border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10' : 'border-border'
                              )}
                            >
                              <button
                                onClick={() => toggleMilestone(p.id, ms.id)}
                                className={cn(
                                  'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0',
                                  ms.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-muted-foreground/30'
                                )}
                              >
                                {ms.completed && <span className="text-xs">&#10003;</span>}
                              </button>
                              <span className={cn('flex-1', ms.completed && 'line-through text-muted-foreground')}>{ms.name}</span>
                              <span className={cn('text-xs', overdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                                {ms.dueDate}
                                {overdue && ' (forsenad)'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="budget" className="space-y-4">
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium">Kund</TableHead>
                      <TableHead className="font-medium text-right">Budget</TableHead>
                      <TableHead className="font-medium text-right">Forbrukat</TableHead>
                      <TableHead className="font-medium text-right">Aterstående</TableHead>
                      <TableHead className="font-medium text-right">Anvant %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.filter((p) => p.status !== 'Klart').map((p) => {
                      const remaining = p.budget - p.spent
                      const pct = p.budget > 0 ? (p.spent / p.budget) * 100 : 0
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.client}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.budget)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.spent)}</TableCell>
                          <TableCell className={cn('text-right tabular-nums', remaining < 0 ? 'text-red-500' : '')}>
                            {fmt(remaining)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={pct > 90 ? 'text-red-500 font-medium' : pct > 70 ? 'text-amber-500' : 'text-emerald-600'}>
                              {fmtPct(pct)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell colSpan={2}>Totalt</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(kpis.totalBudget)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(kpis.totalSpent)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(kpis.totalBudget - kpis.totalSpent)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(kpis.budgetUsed)}%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Project Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Redigera projekt' : 'Nytt projekt'}</DialogTitle>
            <DialogDescription>{editing ? 'Uppdatera projektinformation.' : 'Skapa ett nytt projekt.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Projektnamn *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Kund</Label><Input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ProjectStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Prioritet</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Startdatum</Label><Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Slutdatum</Label><Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Budget (kr)</Label><Input type="number" min={0} value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: Number(e.target.value) }))} /></div>
              <div className="grid gap-2"><Label>Forbrukat (kr)</Label><Input type="number" min={0} value={form.spent} onChange={(e) => setForm((f) => ({ ...f, spent: Number(e.target.value) }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Beskrivning</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort projekt</DialogTitle>
            <DialogDescription>Ar du saker pa att du vill ta bort &quot;{toDelete?.name}&quot;?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" /> Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Milestone Dialog */}
      <Dialog open={milestoneDialogOpen} onOpenChange={setMilestoneDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ny milstolpe</DialogTitle>
            <DialogDescription>Lagg till en milstolpe for {milestoneProject?.name}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Namn *</Label><Input value={msForm.name} onChange={(e) => setMsForm((f) => ({ ...f, name: e.target.value }))} placeholder="Design klar" /></div>
            <div className="grid gap-2"><Label>Deadline</Label><Input type="date" value={msForm.dueDate} onChange={(e) => setMsForm((f) => ({ ...f, dueDate: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMilestoneDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleAddMilestone} disabled={!msForm.name.trim()}>Lagg till</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
