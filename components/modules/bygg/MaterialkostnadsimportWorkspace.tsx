'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
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
  Search,
  Package,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface MaterialImport {
  id: string
  supplier: string
  invoiceNumber: string
  project: string
  material: string
  quantity: number
  unit: string
  unitPrice: number
  totalAmount: number
  date: string
  status: 'Importerad' | 'Kopplad' | 'Bokförd'
  fileName: string
}

const EMPTY_FORM = {
  supplier: '',
  invoiceNumber: '',
  project: '',
  material: '',
  quantity: 0,
  unit: 'st',
  unitPrice: 0,
  date: new Date().toISOString().slice(0, 10),
  status: 'Importerad' as 'Importerad' | 'Kopplad' | 'Bokförd',
  fileName: '',
}

const STATUS_COLORS: Record<string, string> = {
  'Importerad': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Kopplad': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Bokförd': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
}

const UNITS = ['st', 'kg', 'm', 'm2', 'm3', 'liter', 'ton', 'pall', 'paket']

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function MaterialkostnadsimportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [imports, setImports] = useState<MaterialImport[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterProject, setFilterProject] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingImport, setEditingImport] = useState<MaterialImport | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [importToDelete, setImportToDelete] = useState<MaterialImport | null>(null)

  const saveImports = useCallback(async (items: MaterialImport[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'material_imports', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'material_imports')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setImports(data.config_value as MaterialImport[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const projectList = useMemo(() => {
    return [...new Set(imports.map(i => i.project).filter(Boolean))]
  }, [imports])

  const filtered = useMemo(() => {
    let result = imports
    if (filterProject !== 'all') result = result.filter((i) => i.project === filterProject)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((i) =>
        i.supplier.toLowerCase().includes(q) ||
        i.material.toLowerCase().includes(q) ||
        i.invoiceNumber.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [imports, filterProject, searchQuery])

  const stats = useMemo(() => {
    const total = imports.reduce((s, i) => s + i.totalAmount, 0)
    const byProject: Record<string, number> = {}
    imports.forEach(i => {
      const key = i.project || 'Ej kopplat'
      byProject[key] = (byProject[key] ?? 0) + i.totalAmount
    })
    const suppliers = new Set(imports.map(i => i.supplier)).size
    const unbooked = imports.filter(i => i.status !== 'Bokförd').length
    return { total, byProject, suppliers, unbooked }
  }, [imports])

  function handleFileSelect(file: File) {
    const newImport: MaterialImport = {
      id: generateId(),
      supplier: '',
      invoiceNumber: `IMP-${Date.now().toString().slice(-6)}`,
      project: '',
      material: '',
      quantity: 0,
      unit: 'st',
      unitPrice: 0,
      totalAmount: 0,
      date: new Date().toISOString().slice(0, 10),
      status: 'Importerad',
      fileName: file.name,
    }
    const updated = [...imports, newImport]
    setImports(updated)
    saveImports(updated)
    setEditingImport(newImport)
    setForm({ ...EMPTY_FORM, fileName: file.name })
    setDialogOpen(true)
  }

  function openNew() {
    setEditingImport(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(imp: MaterialImport) {
    setEditingImport(imp)
    setForm({
      supplier: imp.supplier,
      invoiceNumber: imp.invoiceNumber,
      project: imp.project,
      material: imp.material,
      quantity: imp.quantity,
      unit: imp.unit,
      unitPrice: imp.unitPrice,
      date: imp.date,
      status: imp.status,
      fileName: imp.fileName,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const qty = Number(form.quantity)
    const price = Number(form.unitPrice)
    const item: MaterialImport = {
      id: editingImport?.id ?? generateId(),
      supplier: form.supplier.trim(),
      invoiceNumber: form.invoiceNumber.trim(),
      project: form.project.trim(),
      material: form.material.trim(),
      quantity: qty,
      unit: form.unit,
      unitPrice: price,
      totalAmount: Math.round(qty * price),
      date: form.date,
      status: form.status,
      fileName: form.fileName,
    }
    let updated: MaterialImport[]
    if (editingImport) {
      updated = imports.map((i) => i.id === editingImport.id ? item : i)
    } else {
      updated = [...imports, item]
    }
    setImports(updated)
    setDialogOpen(false)
    await saveImports(updated)
  }

  async function handleDelete() {
    if (!importToDelete) return
    const updated = imports.filter((i) => i.id !== importToDelete.id)
    setImports(updated)
    setDeleteDialogOpen(false)
    setImportToDelete(null)
    await saveImports(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="import"
        sectorName="Bygg & Entreprenad"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Manuell registrering
          </Button>
        }
      >
        <Tabs defaultValue="import" className="space-y-6">
          <TabsList>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="lista">Materialinköp</TabsTrigger>
            <TabsTrigger value="per-projekt">Per projekt</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-6">
            <ImportDropzone
              accept=".csv,.xlsx,.xls"
              onFileSelect={handleFileSelect}
              label="Dra och släpp leverantörsfil här"
              description="CSV eller Excel. Stöd för vanliga leverantörsformat (Beijer, Ahlsell, etc.)"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt material</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.total)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Leverantörer</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.suppliers}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rader</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{imports.length}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ej bokförda</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.unbooked}</span>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="lista" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Sök leverantör, material..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={filterProject} onValueChange={setFilterProject}>
                    <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrera projekt" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla projekt</SelectItem>
                      {projectList.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                    </div>
                  )}
                </div>

                {filtered.length === 0 ? (
                  <EmptyModuleState icon={Package} title="Inga materialinköp" description="Importera eller registrera materialinköp per projekt." actionLabel="Ny registrering" onAction={openNew} />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Leverantör</TableHead>
                          <TableHead className="font-medium">Material</TableHead>
                          <TableHead className="font-medium">Projekt</TableHead>
                          <TableHead className="font-medium text-right">Antal</TableHead>
                          <TableHead className="font-medium text-right">Á-pris</TableHead>
                          <TableHead className="font-medium text-right">Belopp</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((imp) => (
                          <TableRow key={imp.id}>
                            <TableCell className="font-medium">{imp.supplier || '-'}</TableCell>
                            <TableCell>{imp.material || '-'}</TableCell>
                            <TableCell>{imp.project || '-'}</TableCell>
                            <TableCell className="text-right tabular-nums">{imp.quantity} {imp.unit}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(imp.unitPrice)} kr</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(imp.totalAmount)} kr</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={STATUS_COLORS[imp.status]}>{imp.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(imp)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setImportToDelete(imp); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="per-projekt" className="space-y-6">
            {Object.entries(stats.byProject).length === 0 ? (
              <EmptyModuleState icon={Package} title="Ingen projektdata" description="Koppla materialinköp till projekt." />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium text-right">Total materialkostnad</TableHead>
                      <TableHead className="font-medium text-right">Andel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(stats.byProject).sort((a, b) => b[1] - a[1]).map(([project, amount]) => (
                      <TableRow key={project}>
                        <TableCell className="font-medium">{project}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(amount)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{stats.total > 0 ? ((amount / stats.total) * 100).toFixed(1) : '0.0'}%</TableCell>
                      </TableRow>
                    ))}
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
            <DialogTitle>{editingImport ? 'Redigera materialinköp' : 'Nytt materialinköp'}</DialogTitle>
            <DialogDescription>Registrera materialinköp med projektkoppling. Stöd för import från leverantörer som Beijer, Ahlsell m.fl.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Leverantör *</Label>
                <Input value={form.supplier} onChange={(e) => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="t.ex. Beijer" />
              </div>
              <div className="grid gap-2">
                <Label>Fakturanummer</Label>
                <Input value={form.invoiceNumber} onChange={(e) => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Projekt *</Label>
                <Input value={form.project} onChange={(e) => setForm(f => ({ ...f, project: e.target.value }))} placeholder="Projektnamn" />
              </div>
              <div className="grid gap-2">
                <Label>Material *</Label>
                <Input value={form.material} onChange={(e) => setForm(f => ({ ...f, material: e.target.value }))} placeholder="t.ex. Gipsskivor" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Antal</Label>
                <Input type="number" value={form.quantity || ''} onChange={(e) => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Enhet</Label>
                <Select value={form.unit} onValueChange={(v) => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Á-pris (kr)</Label>
                <Input type="number" value={form.unitPrice || ''} onChange={(e) => setForm(f => ({ ...f, unitPrice: Number(e.target.value) }))} />
              </div>
            </div>
            {Number(form.quantity) > 0 && Number(form.unitPrice) > 0 && (
              <div className="text-sm text-muted-foreground">
                Totalt: <span className="font-semibold text-foreground">{fmt(Math.round(Number(form.quantity) * Number(form.unitPrice)))} kr</span>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Datum</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.supplier.trim()}>
              {editingImport ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort materialinköp</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort detta materialinköp?</DialogDescription>
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
