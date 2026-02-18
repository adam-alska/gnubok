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
  Search,
  Calculator,
  Copy,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface CostLine {
  id: string
  category: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
}

interface ProjectEstimate {
  id: string
  projectName: string
  projectNumber: string
  customer: string
  laborCost: number
  materialCost: number
  machineCost: number
  ueCost: number
  overheadPct: number
  marginPct: number
  costLines: CostLine[]
  createdDate: string
  status: 'Utkast' | 'Skickad' | 'Antagen' | 'Förlorad'
}

const EMPTY_FORM = {
  projectName: '',
  projectNumber: '',
  customer: '',
  laborCost: 0,
  materialCost: 0,
  machineCost: 0,
  ueCost: 0,
  overheadPct: 12,
  marginPct: 15,
  createdDate: new Date().toISOString().slice(0, 10),
  status: 'Utkast' as 'Utkast' | 'Skickad' | 'Antagen' | 'Förlorad',
}

const EMPTY_LINE: Omit<CostLine, 'id'> = {
  category: 'Material',
  description: '',
  quantity: 0,
  unit: 'st',
  unitPrice: 0,
  total: 0,
}

const STATUS_COLORS: Record<string, string> = {
  'Utkast': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Skickad': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Antagen': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Förlorad': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
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

export function ProjektkalkylWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [estimates, setEstimates] = useState<ProjectEstimate[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEstimate, setEditingEstimate] = useState<ProjectEstimate | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [costLines, setCostLines] = useState<CostLine[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [estimateToDelete, setEstimateToDelete] = useState<ProjectEstimate | null>(null)

  const saveEstimates = useCallback(async (items: ProjectEstimate[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'estimates', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'estimates')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setEstimates(data.config_value as ProjectEstimate[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return estimates.sort((a, b) => b.createdDate.localeCompare(a.createdDate))
    const q = searchQuery.toLowerCase()
    return estimates
      .filter((e) => e.projectName.toLowerCase().includes(q) || e.customer.toLowerCase().includes(q) || e.projectNumber.toLowerCase().includes(q))
      .sort((a, b) => b.createdDate.localeCompare(a.createdDate))
  }, [estimates, searchQuery])

  function calcTotals(f: typeof EMPTY_FORM) {
    const directCost = Number(f.laborCost) + Number(f.materialCost) + Number(f.machineCost) + Number(f.ueCost)
    const overhead = Math.round(directCost * (Number(f.overheadPct) / 100))
    const totalCost = directCost + overhead
    const margin = Math.round(totalCost * (Number(f.marginPct) / 100))
    const offerPrice = totalCost + margin
    return { directCost, overhead, totalCost, margin, offerPrice }
  }

  function openNew() {
    setEditingEstimate(null)
    setForm({ ...EMPTY_FORM })
    setCostLines([])
    setDialogOpen(true)
  }

  function openEdit(e: ProjectEstimate) {
    setEditingEstimate(e)
    setForm({
      projectName: e.projectName,
      projectNumber: e.projectNumber,
      customer: e.customer,
      laborCost: e.laborCost,
      materialCost: e.materialCost,
      machineCost: e.machineCost,
      ueCost: e.ueCost,
      overheadPct: e.overheadPct,
      marginPct: e.marginPct,
      createdDate: e.createdDate,
      status: e.status,
    })
    setCostLines(e.costLines)
    setDialogOpen(true)
  }

  function duplicateEstimate(e: ProjectEstimate) {
    const newEst: ProjectEstimate = {
      ...e,
      id: generateId(),
      projectName: `${e.projectName} (kopia)`,
      status: 'Utkast',
      createdDate: new Date().toISOString().slice(0, 10),
    }
    const updated = [...estimates, newEst]
    setEstimates(updated)
    saveEstimates(updated)
  }

  async function handleSave() {
    const t = calcTotals(form)
    const item: ProjectEstimate = {
      id: editingEstimate?.id ?? generateId(),
      projectName: form.projectName.trim(),
      projectNumber: form.projectNumber.trim(),
      customer: form.customer.trim(),
      laborCost: Number(form.laborCost),
      materialCost: Number(form.materialCost),
      machineCost: Number(form.machineCost),
      ueCost: Number(form.ueCost),
      overheadPct: Number(form.overheadPct),
      marginPct: Number(form.marginPct),
      costLines,
      createdDate: form.createdDate,
      status: form.status,
    }
    let updated: ProjectEstimate[]
    if (editingEstimate) {
      updated = estimates.map((e) => e.id === editingEstimate.id ? item : e)
    } else {
      updated = [...estimates, item]
    }
    setEstimates(updated)
    setDialogOpen(false)
    await saveEstimates(updated)
  }

  async function handleDelete() {
    if (!estimateToDelete) return
    const updated = estimates.filter((e) => e.id !== estimateToDelete.id)
    setEstimates(updated)
    setDeleteDialogOpen(false)
    setEstimateToDelete(null)
    await saveEstimates(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Bygg & Entreprenad"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny kalkyl
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
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Antal kalkyler</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{estimates.length}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Antagna</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{estimates.filter(e => e.status === 'Antagen').length}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt offertvärde</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">
                    {fmt(estimates.reduce((s, e) => {
                      const t = calcTotals({ ...EMPTY_FORM, laborCost: e.laborCost, materialCost: e.materialCost, machineCost: e.machineCost, ueCost: e.ueCost, overheadPct: e.overheadPct, marginPct: e.marginPct })
                      return s + t.offerPrice
                    }, 0))}
                  </span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hitrate</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">
                    {estimates.filter(e => e.status === 'Antagen' || e.status === 'Förlorad').length > 0
                      ? fmtPct((estimates.filter(e => e.status === 'Antagen').length / estimates.filter(e => e.status === 'Antagen' || e.status === 'Förlorad').length) * 100)
                      : '-'}
                  </span>
                  <span className="text-sm text-muted-foreground ml-1.5">%</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök projekt, kund..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
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
                title="Inga kalkyler"
                description="Skapa detaljerade projektkalkyler med arbetskostnad, material, maskiner, UE och påslag."
                actionLabel="Ny kalkyl"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium">Kund</TableHead>
                      <TableHead className="font-medium text-right">Självkostnad</TableHead>
                      <TableHead className="font-medium text-right">Offertpris</TableHead>
                      <TableHead className="font-medium text-right">Marginal</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e) => {
                      const t = calcTotals({ ...EMPTY_FORM, laborCost: e.laborCost, materialCost: e.materialCost, machineCost: e.machineCost, ueCost: e.ueCost, overheadPct: e.overheadPct, marginPct: e.marginPct })
                      return (
                        <TableRow key={e.id}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{e.projectName}</span>
                              <span className="text-xs text-muted-foreground block">{e.projectNumber}</span>
                            </div>
                          </TableCell>
                          <TableCell>{e.customer}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(t.totalCost)} kr</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(t.offerPrice)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtPct(e.marginPct)}%</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_COLORS[e.status]}>{e.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => duplicateEstimate(e)} title="Kopiera"><Copy className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(e)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEstimateToDelete(e); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEstimate ? 'Redigera kalkyl' : 'Ny projektkalkyl'}</DialogTitle>
            <DialogDescription>Detaljerad kalkyl med arbete, material, maskiner, UE-kostnader och marginalpåslag.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Projektnamn *</Label>
                <Input value={form.projectName} onChange={(e) => setForm(f => ({ ...f, projectName: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Projektnummer</Label>
                <Input value={form.projectNumber} onChange={(e) => setForm(f => ({ ...f, projectNumber: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Kund</Label>
                <Input value={form.customer} onChange={(e) => setForm(f => ({ ...f, customer: e.target.value }))} />
              </div>
            </div>

            <Separator />
            <h4 className="text-sm font-semibold">Direkta kostnader</h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Arbetskostnad (kr)</Label>
                <Input type="number" value={form.laborCost || ''} onChange={(e) => setForm(f => ({ ...f, laborCost: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Materialkostnad (kr)</Label>
                <Input type="number" value={form.materialCost || ''} onChange={(e) => setForm(f => ({ ...f, materialCost: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Maskinkostnad (kr)</Label>
                <Input type="number" value={form.machineCost || ''} onChange={(e) => setForm(f => ({ ...f, machineCost: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>UE-kostnad (kr)</Label>
                <Input type="number" value={form.ueCost || ''} onChange={(e) => setForm(f => ({ ...f, ueCost: Number(e.target.value) }))} />
              </div>
            </div>

            <Separator />
            <h4 className="text-sm font-semibold">Påslag</h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Omkostnadspåslag (%)</Label>
                <Input type="number" step="0.1" value={form.overheadPct} onChange={(e) => setForm(f => ({ ...f, overheadPct: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Marginalpåslag (%)</Label>
                <Input type="number" step="0.1" value={form.marginPct} onChange={(e) => setForm(f => ({ ...f, marginPct: Number(e.target.value) }))} />
              </div>
            </div>

            {(() => {
              const t = calcTotals(form)
              return (
                <Card className="bg-muted/50">
                  <CardContent className="pt-4 pb-3 space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>Direkta kostnader</span>
                      <span className="tabular-nums">{fmt(t.directCost)} kr</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Omkostnader ({form.overheadPct}%)</span>
                      <span className="tabular-nums">{fmt(t.overhead)} kr</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span>Självkostnad</span>
                      <span className="tabular-nums">{fmt(t.totalCost)} kr</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Marginal ({form.marginPct}%)</span>
                      <span className="tabular-nums">{fmt(t.margin)} kr</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>Offertpris</span>
                      <span className="tabular-nums text-lg">{fmt(t.offerPrice)} kr</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })()}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Datum</Label>
                <Input type="date" value={form.createdDate} onChange={(e) => setForm(f => ({ ...f, createdDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Input value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as typeof form.status }))} placeholder="Utkast" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.projectName.trim()}>
              {editingEstimate ? 'Uppdatera' : 'Skapa kalkyl'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort kalkyl</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort kalkylen för {estimateToDelete?.projectName}?</DialogDescription>
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
