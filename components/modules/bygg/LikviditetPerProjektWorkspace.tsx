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
  Search,
  Wallet,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ProjectCashflow {
  id: string
  projectName: string
  projectNumber: string
  invoicedAmount: number
  paidAmount: number
  totalCost: number
  receivable0to30: number
  receivable31to60: number
  receivable61plus: number
  period: string
}

const EMPTY_FORM = {
  projectName: '',
  projectNumber: '',
  invoicedAmount: 0,
  paidAmount: 0,
  totalCost: 0,
  receivable0to30: 0,
  receivable31to60: 0,
  receivable61plus: 0,
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

export function LikviditetPerProjektWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<ProjectCashflow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectCashflow | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<ProjectCashflow | null>(null)

  const saveProjects = useCallback(async (items: ProjectCashflow[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'cashflow_projects', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'cashflow_projects')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setProjects(data.config_value as ProjectCashflow[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return projects.sort((a, b) => a.projectName.localeCompare(b.projectName))
    const q = searchQuery.toLowerCase()
    return projects.filter((p) => p.projectName.toLowerCase().includes(q) || p.projectNumber.toLowerCase().includes(q))
  }, [projects, searchQuery])

  const totals = useMemo(() => {
    const invoiced = projects.reduce((s, p) => s + p.invoicedAmount, 0)
    const paid = projects.reduce((s, p) => s + p.paidAmount, 0)
    const cost = projects.reduce((s, p) => s + p.totalCost, 0)
    const netCashflow = paid - cost
    const totalReceivable = projects.reduce((s, p) => s + p.receivable0to30 + p.receivable31to60 + p.receivable61plus, 0)
    const overdue = projects.reduce((s, p) => s + p.receivable61plus, 0)
    const collectionRate = invoiced > 0 ? (paid / invoiced) * 100 : 0
    return { invoiced, paid, cost, netCashflow, totalReceivable, overdue, collectionRate }
  }, [projects])

  function openNew() {
    setEditingProject(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(p: ProjectCashflow) {
    setEditingProject(p)
    setForm({ ...p })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: ProjectCashflow = {
      id: editingProject?.id ?? generateId(),
      projectName: form.projectName.trim(),
      projectNumber: form.projectNumber.trim(),
      invoicedAmount: Number(form.invoicedAmount),
      paidAmount: Number(form.paidAmount),
      totalCost: Number(form.totalCost),
      receivable0to30: Number(form.receivable0to30),
      receivable31to60: Number(form.receivable31to60),
      receivable61plus: Number(form.receivable61plus),
      period: form.period,
    }
    let updated: ProjectCashflow[]
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
            <TabsTrigger value="aging">Åldersanalys</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : projects.length === 0 ? (
              <EmptyModuleState
                icon={Wallet}
                title="Ingen likviditetsdata"
                description="Lägg till projekt för att följa kassaflöde: fakturerat vs betalt vs kostnad och förfallostruktur."
                actionLabel="Nytt projekt"
                onAction={openNew}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Netto kassaflöde" value={fmt(totals.netCashflow)} unit="kr" trend={totals.netCashflow >= 0 ? 'up' : 'down'} />
                <KPICard label="Fakturerat" value={fmt(totals.invoiced)} unit="kr" />
                <KPICard label="Betalt" value={fmt(totals.paid)} unit="kr" />
                <KPICard label="Indrivningsgrad" value={fmtPct(totals.collectionRate)} unit="%" />
                <KPICard label="Förfallet 60+ dagar" value={fmt(totals.overdue)} unit="kr" trend={totals.overdue > 0 ? 'down' : 'up'} />
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
                  <EmptyModuleState icon={Wallet} title="Inga projekt" description="Lägg till projekt för likviditetsuppföljning." actionLabel="Nytt projekt" onAction={openNew} />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Projekt</TableHead>
                          <TableHead className="font-medium text-right">Fakturerat</TableHead>
                          <TableHead className="font-medium text-right">Betalt</TableHead>
                          <TableHead className="font-medium text-right">Kostnad</TableHead>
                          <TableHead className="font-medium text-right">Netto</TableHead>
                          <TableHead className="font-medium text-right">Utestående</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((p) => {
                          const net = p.paidAmount - p.totalCost
                          const outstanding = p.invoicedAmount - p.paidAmount
                          return (
                            <TableRow key={p.id}>
                              <TableCell>
                                <div>
                                  <span className="font-medium">{p.projectName}</span>
                                  <span className="text-xs text-muted-foreground block">{p.projectNumber}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(p.invoicedAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(p.paidAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(p.totalCost)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={net < 0 ? 'text-red-600 font-medium' : 'text-emerald-600 font-medium'}>{fmt(net)}</span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(outstanding)}</TableCell>
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

          <TabsContent value="aging" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : projects.length === 0 ? (
              <EmptyModuleState icon={Wallet} title="Ingen data" description="Lägg till projekt med förfallouppgifter." />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium text-right">0-30 dagar</TableHead>
                      <TableHead className="font-medium text-right">31-60 dagar</TableHead>
                      <TableHead className="font-medium text-right">61+ dagar</TableHead>
                      <TableHead className="font-medium text-right">Totalt utestående</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((p) => {
                      const total = p.receivable0to30 + p.receivable31to60 + p.receivable61plus
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.projectName}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.receivable0to30)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={p.receivable31to60 > 0 ? 'text-amber-600' : ''}>{fmt(p.receivable31to60)} kr</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className={p.receivable61plus > 0 ? 'text-red-600 font-medium' : ''}>{fmt(p.receivable61plus)} kr</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(total)} kr</TableCell>
                        </TableRow>
                      )
                    })}
                    <TableRow className="bg-muted/30 font-medium">
                      <TableCell>Totalt</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(projects.reduce((s, p) => s + p.receivable0to30, 0))} kr</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(projects.reduce((s, p) => s + p.receivable31to60, 0))} kr</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(projects.reduce((s, p) => s + p.receivable61plus, 0))} kr</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(totals.totalReceivable)} kr</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Redigera projekt' : 'Nytt projekt'}</DialogTitle>
            <DialogDescription>Kassaflöde per projekt med fakturerat, betalt, kostnad och åldersanalys av fordringar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Projektnamn *</Label>
                <Input value={form.projectName} onChange={(e) => setForm(f => ({ ...f, projectName: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Projektnummer</Label>
                <Input value={form.projectNumber} onChange={(e) => setForm(f => ({ ...f, projectNumber: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Fakturerat (kr)</Label>
                <Input type="number" value={form.invoicedAmount || ''} onChange={(e) => setForm(f => ({ ...f, invoicedAmount: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Betalt (kr)</Label>
                <Input type="number" value={form.paidAmount || ''} onChange={(e) => setForm(f => ({ ...f, paidAmount: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Kostnad (kr)</Label>
                <Input type="number" value={form.totalCost || ''} onChange={(e) => setForm(f => ({ ...f, totalCost: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Fordran 0-30 d</Label>
                <Input type="number" value={form.receivable0to30 || ''} onChange={(e) => setForm(f => ({ ...f, receivable0to30: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Fordran 31-60 d</Label>
                <Input type="number" value={form.receivable31to60 || ''} onChange={(e) => setForm(f => ({ ...f, receivable31to60: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Fordran 61+ d</Label>
                <Input type="number" value={form.receivable61plus || ''} onChange={(e) => setForm(f => ({ ...f, receivable61plus: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Period</Label>
              <Input type="month" value={form.period} onChange={(e) => setForm(f => ({ ...f, period: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.projectName.trim()}>
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
