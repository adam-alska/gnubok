'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  TrendingUp,
  Calculator,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ProjectRecognition {
  id: string
  projectName: string
  projectNumber: string
  contractAmount: number
  estimatedTotalCost: number
  incurredCost: number
  completionPct: number
  recognizedRevenue: number
  invoicedAmount: number
  wipBalance: number
  period: string
  notes: string
}

const EMPTY_FORM = {
  projectName: '',
  projectNumber: '',
  contractAmount: 0,
  estimatedTotalCost: 0,
  incurredCost: 0,
  invoicedAmount: 0,
  period: new Date().toISOString().slice(0, 7),
  notes: '',
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

export function SuccessivVinstavrakningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<ProjectRecognition[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<ProjectRecognition | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<ProjectRecognition | null>(null)

  const saveProjects = useCallback(async (items: ProjectRecognition[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'projects', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'projects')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setProjects(data.config_value as ProjectRecognition[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return projects.sort((a, b) => b.period.localeCompare(a.period))
    const q = searchQuery.toLowerCase()
    return projects
      .filter((p) => p.projectName.toLowerCase().includes(q) || p.projectNumber.toLowerCase().includes(q))
      .sort((a, b) => b.period.localeCompare(a.period))
  }, [projects, searchQuery])

  const stats = useMemo(() => {
    const totalContract = projects.reduce((s, p) => s + p.contractAmount, 0)
    const totalRecognized = projects.reduce((s, p) => s + p.recognizedRevenue, 0)
    const totalWip = projects.reduce((s, p) => s + p.wipBalance, 0)
    const avgCompletion = projects.length > 0 ? projects.reduce((s, p) => s + p.completionPct, 0) / projects.length : 0
    return { totalContract, totalRecognized, totalWip, avgCompletion }
  }, [projects])

  function openNew() {
    setEditingProject(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(p: ProjectRecognition) {
    setEditingProject(p)
    setForm({
      projectName: p.projectName,
      projectNumber: p.projectNumber,
      contractAmount: p.contractAmount,
      estimatedTotalCost: p.estimatedTotalCost,
      incurredCost: p.incurredCost,
      invoicedAmount: p.invoicedAmount,
      period: p.period,
      notes: p.notes,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const contractAmount = Number(form.contractAmount)
    const estimatedTotalCost = Number(form.estimatedTotalCost)
    const incurredCost = Number(form.incurredCost)
    const invoicedAmount = Number(form.invoicedAmount)

    const completionPct = estimatedTotalCost > 0 ? (incurredCost / estimatedTotalCost) * 100 : 0
    const recognizedRevenue = Math.round(contractAmount * (completionPct / 100))
    const wipBalance = recognizedRevenue - invoicedAmount

    const item: ProjectRecognition = {
      id: editingProject?.id ?? generateId(),
      projectName: form.projectName.trim(),
      projectNumber: form.projectNumber.trim(),
      contractAmount,
      estimatedTotalCost,
      incurredCost,
      completionPct: Math.round(completionPct * 10) / 10,
      recognizedRevenue,
      invoicedAmount,
      wipBalance,
      period: form.period,
      notes: form.notes.trim(),
    }

    let updated: ProjectRecognition[]
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
        category="bokforing"
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
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt kontraktsvärde</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalContract)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Redovisad intäkt</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalRecognized)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">PIA-saldo (konto 1470)</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalWip)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Snittfärdigställandegrad</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmtPct(stats.avgCompletion)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">%</span>
                </CardContent>
              </Card>
            </div>

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
                icon={Calculator}
                title="Inga projekt"
                description="Lägg till projekt för successiv vinstavräkning. Färdigställandegraden beräknas automatiskt."
                actionLabel="Nytt projekt"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium">Period</TableHead>
                      <TableHead className="font-medium text-right">Kontrakt</TableHead>
                      <TableHead className="font-medium text-right">Nedlagd kostnad</TableHead>
                      <TableHead className="font-medium text-right">Färdigställande</TableHead>
                      <TableHead className="font-medium text-right">Redovisad intäkt</TableHead>
                      <TableHead className="font-medium text-right">PIA (1470)</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{p.projectName}</span>
                            <span className="text-xs text-muted-foreground block">{p.projectNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>{p.period}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(p.contractAmount)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(p.incurredCost)} kr</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className={
                            p.completionPct >= 90 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            p.completionPct >= 50 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                            'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                          }>
                            {fmtPct(p.completionPct)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(p.recognizedRevenue)} kr</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          <span className={p.wipBalance < 0 ? 'text-red-600' : ''}>{fmt(p.wipBalance)} kr</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setProjectToDelete(p); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'Redigera projekt' : 'Nytt projekt - Successiv vinstavräkning'}</DialogTitle>
            <DialogDescription>Färdigställandegrad = Nedlagd kostnad / Beräknad totalkostnad. Intäkt periodiseras till konto 1470 (PIA).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Projektnamn *</Label>
                <Input value={form.projectName} onChange={(e) => setForm(f => ({ ...f, projectName: e.target.value }))} placeholder="Kv. Björken" />
              </div>
              <div className="grid gap-2">
                <Label>Projektnummer *</Label>
                <Input value={form.projectNumber} onChange={(e) => setForm(f => ({ ...f, projectNumber: e.target.value }))} placeholder="P-2024-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kontraktsvärde (kr) *</Label>
                <Input type="number" value={form.contractAmount || ''} onChange={(e) => setForm(f => ({ ...f, contractAmount: Number(e.target.value) }))} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label>Beräknad totalkostnad (kr) *</Label>
                <Input type="number" value={form.estimatedTotalCost || ''} onChange={(e) => setForm(f => ({ ...f, estimatedTotalCost: Number(e.target.value) }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Nedlagd kostnad (kr) *</Label>
                <Input type="number" value={form.incurredCost || ''} onChange={(e) => setForm(f => ({ ...f, incurredCost: Number(e.target.value) }))} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label>Fakturerat belopp (kr)</Label>
                <Input type="number" value={form.invoicedAmount || ''} onChange={(e) => setForm(f => ({ ...f, invoicedAmount: Number(e.target.value) }))} placeholder="0" />
              </div>
            </div>
            {Number(form.estimatedTotalCost) > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4 pb-3 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>Färdigställandegrad</span>
                    <span className="font-semibold tabular-nums">{fmtPct((Number(form.incurredCost) / Number(form.estimatedTotalCost)) * 100)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Redovisad intäkt</span>
                    <span className="font-semibold tabular-nums">{fmt(Math.round(Number(form.contractAmount) * (Number(form.incurredCost) / Number(form.estimatedTotalCost))))} kr</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>PIA-saldo (1470)</span>
                    <span className="font-semibold tabular-nums">{fmt(Math.round(Number(form.contractAmount) * (Number(form.incurredCost) / Number(form.estimatedTotalCost))) - Number(form.invoicedAmount))} kr</span>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Period</Label>
                <Input type="month" value={form.period} onChange={(e) => setForm(f => ({ ...f, period: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Anteckningar</Label>
                <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Valfria anteckningar" />
              </div>
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
