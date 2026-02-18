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
  Search,
  BarChart3,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ProjectMargin {
  id: string
  projectName: string
  projectNumber: string
  budgetRevenue: number
  budgetCost: number
  actualRevenue: number
  actualCost: number
  ataRevenue: number
  ataCost: number
  ueBudget: number
  ueActual: number
  period: string
}

const EMPTY_FORM = {
  projectName: '',
  projectNumber: '',
  budgetRevenue: 0,
  budgetCost: 0,
  actualRevenue: 0,
  actualCost: 0,
  ataRevenue: 0,
  ataCost: 0,
  ueBudget: 0,
  ueActual: 0,
  period: new Date().toISOString().slice(0, 7),
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

export function ProjektmarginalWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<ProjectMargin[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectMargin | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<ProjectMargin | null>(null)

  const saveProjects = useCallback(async (items: ProjectMargin[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'project_margins', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug).eq('config_key', 'project_margins')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setProjects(data.config_value as ProjectMargin[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return projects.sort((a, b) => a.projectName.localeCompare(b.projectName))
    const q = searchQuery.toLowerCase()
    return projects
      .filter((p) => p.projectName.toLowerCase().includes(q) || p.projectNumber.toLowerCase().includes(q))
      .sort((a, b) => a.projectName.localeCompare(b.projectName))
  }, [projects, searchQuery])

  const totals = useMemo(() => {
    const budgetRev = projects.reduce((s, p) => s + p.budgetRevenue, 0)
    const budgetCost = projects.reduce((s, p) => s + p.budgetCost, 0)
    const actualRev = projects.reduce((s, p) => s + p.actualRevenue + p.ataRevenue, 0)
    const actualCost = projects.reduce((s, p) => s + p.actualCost + p.ataCost, 0)
    const budgetMargin = budgetRev > 0 ? ((budgetRev - budgetCost) / budgetRev) * 100 : 0
    const actualMargin = actualRev > 0 ? ((actualRev - actualCost) / actualRev) * 100 : 0
    const ueVariance = projects.reduce((s, p) => s + (p.ueActual - p.ueBudget), 0)
    return { budgetRev, budgetCost, actualRev, actualCost, budgetMargin, actualMargin, ueVariance }
  }, [projects])

  function openNew() {
    setEditingProject(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(p: ProjectMargin) {
    setEditingProject(p)
    setForm({ ...p })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: ProjectMargin = {
      id: editingProject?.id ?? generateId(),
      projectName: form.projectName.trim(),
      projectNumber: form.projectNumber.trim(),
      budgetRevenue: Number(form.budgetRevenue),
      budgetCost: Number(form.budgetCost),
      actualRevenue: Number(form.actualRevenue),
      actualCost: Number(form.actualCost),
      ataRevenue: Number(form.ataRevenue),
      ataCost: Number(form.ataCost),
      ueBudget: Number(form.ueBudget),
      ueActual: Number(form.ueActual),
      period: form.period,
    }
    let updated: ProjectMargin[]
    if (editingProject) {
      updated = projects.map((p) => p.id === editingProject.id ? item : p)
    } else {
      updated = [...projects, item]
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
        category="rapport"
        sectorName="Bygg & Entreprenad"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt projekt
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="projekt">Per projekt</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : projects.length === 0 ? (
              <EmptyModuleState
                icon={BarChart3}
                title="Inga projekt"
                description="Lägg till projekt för att se budget vs utfall, ÄTA-påverkan och UE-kostnad mot plan."
                actionLabel="Nytt projekt"
                onAction={openNew}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Budget-marginal" value={fmtPct(totals.budgetMargin)} unit="%" />
                <KPICard
                  label="Faktisk marginal"
                  value={fmtPct(totals.actualMargin)}
                  unit="%"
                  trend={totals.actualMargin >= totals.budgetMargin ? 'up' : 'down'}
                  trendLabel={`${totals.actualMargin >= totals.budgetMargin ? '+' : ''}${fmtPct(totals.actualMargin - totals.budgetMargin)} pp`}
                />
                <KPICard label="Total intäkt (inkl ÄTA)" value={fmt(totals.actualRev)} unit="kr" />
                <KPICard label="Total kostnad (inkl ÄTA)" value={fmt(totals.actualCost)} unit="kr" />
                <KPICard
                  label="UE-avvikelse"
                  value={fmt(totals.ueVariance)}
                  unit="kr"
                  trend={totals.ueVariance <= 0 ? 'up' : 'down'}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="projekt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Sök projekt..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                    </div>
                  )}
                </div>

                {filtered.length === 0 ? (
                  <EmptyModuleState
                    icon={BarChart3}
                    title="Inga projekt hittades"
                    description="Lägg till projekt för marginaluppföljning."
                    actionLabel="Nytt projekt"
                    onAction={openNew}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Projekt</TableHead>
                          <TableHead className="font-medium text-right">Budget int.</TableHead>
                          <TableHead className="font-medium text-right">Utfall int.</TableHead>
                          <TableHead className="font-medium text-right">Budget kost.</TableHead>
                          <TableHead className="font-medium text-right">Utfall kost.</TableHead>
                          <TableHead className="font-medium text-right">ÄTA netto</TableHead>
                          <TableHead className="font-medium text-right">Marginal</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((p) => {
                          const totalRev = p.actualRevenue + p.ataRevenue
                          const totalCost = p.actualCost + p.ataCost
                          const margin = totalRev > 0 ? ((totalRev - totalCost) / totalRev) * 100 : 0
                          const budgetMargin = p.budgetRevenue > 0 ? ((p.budgetRevenue - p.budgetCost) / p.budgetRevenue) * 100 : 0
                          return (
                            <TableRow key={p.id}>
                              <TableCell>
                                <div>
                                  <span className="font-medium">{p.projectName}</span>
                                  <span className="text-xs text-muted-foreground block">{p.projectNumber}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(p.budgetRevenue)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(totalRev)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(p.budgetCost)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(totalCost)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={(p.ataRevenue - p.ataCost) < 0 ? 'text-red-600' : 'text-emerald-600'}>
                                  {fmt(p.ataRevenue - p.ataCost)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary" className={
                                  margin >= budgetMargin ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                }>
                                  {fmtPct(margin)}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setProjectToDelete(p); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Redigera projekt' : 'Nytt projekt'}</DialogTitle>
            <DialogDescription>Budget vs utfall med ÄTA-påverkan och UE-kostnader.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Projektnamn *</Label>
                <Input value={form.projectName} onChange={(e) => setForm(f => ({ ...f, projectName: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Projektnummer *</Label>
                <Input value={form.projectNumber} onChange={(e) => setForm(f => ({ ...f, projectNumber: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Budget intäkt (kr)</Label>
                <Input type="number" value={form.budgetRevenue || ''} onChange={(e) => setForm(f => ({ ...f, budgetRevenue: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Budget kostnad (kr)</Label>
                <Input type="number" value={form.budgetCost || ''} onChange={(e) => setForm(f => ({ ...f, budgetCost: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Utfall intäkt (kr)</Label>
                <Input type="number" value={form.actualRevenue || ''} onChange={(e) => setForm(f => ({ ...f, actualRevenue: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Utfall kostnad (kr)</Label>
                <Input type="number" value={form.actualCost || ''} onChange={(e) => setForm(f => ({ ...f, actualCost: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>ÄTA-intäkt (kr)</Label>
                <Input type="number" value={form.ataRevenue || ''} onChange={(e) => setForm(f => ({ ...f, ataRevenue: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>ÄTA-kostnad (kr)</Label>
                <Input type="number" value={form.ataCost || ''} onChange={(e) => setForm(f => ({ ...f, ataCost: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>UE-budget (kr)</Label>
                <Input type="number" value={form.ueBudget || ''} onChange={(e) => setForm(f => ({ ...f, ueBudget: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>UE-utfall (kr)</Label>
                <Input type="number" value={form.ueActual || ''} onChange={(e) => setForm(f => ({ ...f, ueActual: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Period</Label>
              <Input type="month" value={form.period} onChange={(e) => setForm(f => ({ ...f, period: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.projectName.trim() || !form.projectNumber.trim()}>
              {editingProject ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort projekt</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort {projectToDelete?.projectName}?</DialogDescription>
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
