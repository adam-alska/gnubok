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
import { Switch } from '@/components/ui/switch'
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
  Upload,
  FileUp,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ImportStatus = 'Importerad' | 'Granskad' | 'Kopplad' | 'Bokförd'

interface UeImportedInvoice {
  id: string
  invoiceNumber: string
  ueCompany: string
  ueOrgNumber: string
  fSkattOk: boolean
  amount: number
  vatAmount: number
  project: string
  date: string
  dueDate: string
  status: ImportStatus
  fileName: string
  importedAt: string
}

const EMPTY_FORM = {
  invoiceNumber: '',
  ueCompany: '',
  ueOrgNumber: '',
  fSkattOk: false,
  amount: 0,
  vatAmount: 0,
  project: '',
  date: new Date().toISOString().slice(0, 10),
  dueDate: '',
  status: 'Importerad' as ImportStatus,
  fileName: '',
}

const STATUS_COLORS: Record<ImportStatus, string> = {
  'Importerad': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Granskad': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Kopplad': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Bokförd': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function UeFakturaimportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoices, setInvoices] = useState<UeImportedInvoice[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<UeImportedInvoice | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<UeImportedInvoice | null>(null)

  const saveInvoices = useCallback(async (items: UeImportedInvoice[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'ue_imports', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'ue_imports')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setInvoices(data.config_value as UeImportedInvoice[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return invoices.sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    const q = searchQuery.toLowerCase()
    return invoices
      .filter((i) => i.invoiceNumber.toLowerCase().includes(q) || i.ueCompany.toLowerCase().includes(q) || i.project.toLowerCase().includes(q))
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
  }, [invoices, searchQuery])

  const stats = useMemo(() => {
    const total = invoices.reduce((s, i) => s + i.amount, 0)
    const imported = invoices.filter(i => i.status === 'Importerad').length
    const booked = invoices.filter(i => i.status === 'Bokförd').length
    const noFSkatt = invoices.filter(i => !i.fSkattOk).length
    return { total, imported, booked, noFSkatt }
  }, [invoices])

  function handleFileSelect(file: File) {
    // Parse CSV/Excel - simplified simulation
    const newInvoice: UeImportedInvoice = {
      id: generateId(),
      invoiceNumber: `IMP-${Date.now().toString().slice(-6)}`,
      ueCompany: 'Importerad UE',
      ueOrgNumber: '',
      fSkattOk: false,
      amount: 0,
      vatAmount: 0,
      project: '',
      date: new Date().toISOString().slice(0, 10),
      dueDate: '',
      status: 'Importerad',
      fileName: file.name,
      importedAt: new Date().toISOString(),
    }
    const updated = [...invoices, newInvoice]
    setInvoices(updated)
    saveInvoices(updated)
    // Open edit dialog for the imported invoice
    setEditingInvoice(newInvoice)
    setForm({
      invoiceNumber: newInvoice.invoiceNumber,
      ueCompany: newInvoice.ueCompany,
      ueOrgNumber: '',
      fSkattOk: false,
      amount: 0,
      vatAmount: 0,
      project: '',
      date: newInvoice.date,
      dueDate: '',
      status: 'Importerad',
      fileName: file.name,
    })
    setDialogOpen(true)
  }

  function openNew() {
    setEditingInvoice(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(inv: UeImportedInvoice) {
    setEditingInvoice(inv)
    setForm({ ...inv })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: UeImportedInvoice = {
      id: editingInvoice?.id ?? generateId(),
      ...form,
      amount: Number(form.amount),
      vatAmount: Number(form.vatAmount),
      importedAt: editingInvoice?.importedAt ?? new Date().toISOString(),
    }
    let updated: UeImportedInvoice[]
    if (editingInvoice) {
      updated = invoices.map((i) => i.id === editingInvoice.id ? item : i)
    } else {
      updated = [...invoices, item]
    }
    setInvoices(updated)
    setDialogOpen(false)
    await saveInvoices(updated)
  }

  async function handleDelete() {
    if (!invoiceToDelete) return
    const updated = invoices.filter((i) => i.id !== invoiceToDelete.id)
    setInvoices(updated)
    setDeleteDialogOpen(false)
    setInvoiceToDelete(null)
    await saveInvoices(updated)
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
            <TabsTrigger value="lista">Importerade fakturor</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="space-y-6">
            <ImportDropzone
              accept=".csv,.xlsx,.xls,.pdf"
              onFileSelect={handleFileSelect}
              label="Dra och släpp UE-fakturor här"
              description="CSV, Excel eller PDF. Fakturor parsas och kopplas till projekt."
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt importerat</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.total)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Att granska</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.imported}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">fakturor</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bokförda</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.booked}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">fakturor</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saknar F-skatt</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.noFSkatt}</span>
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
                    <Input placeholder="Sök faktura, UE, projekt..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                    </div>
                  )}
                </div>

                {filtered.length === 0 ? (
                  <EmptyModuleState icon={FileUp} title="Inga importerade fakturor" description="Importera UE-fakturor via fliken Import eller registrera manuellt." />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Fakturanr</TableHead>
                          <TableHead className="font-medium">UE</TableHead>
                          <TableHead className="font-medium">Projekt</TableHead>
                          <TableHead className="font-medium">F-skatt</TableHead>
                          <TableHead className="font-medium text-right">Belopp</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono font-medium">{inv.invoiceNumber}</TableCell>
                            <TableCell>{inv.ueCompany}</TableCell>
                            <TableCell>{inv.project || '-'}</TableCell>
                            <TableCell>
                              {inv.fSkattOk ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-red-500" />}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(inv.amount)} kr</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={STATUS_COLORS[inv.status]}>{inv.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(inv)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setInvoiceToDelete(inv); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
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
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? 'Redigera importerad faktura' : 'Manuell registrering'}</DialogTitle>
            <DialogDescription>Komplettera fakturainformation, koppla till projekt och verifiera F-skatt.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fakturanummer *</Label>
                <Input value={form.invoiceNumber} onChange={(e) => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>UE-företag *</Label>
                <Input value={form.ueCompany} onChange={(e) => setForm(f => ({ ...f, ueCompany: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Org.nummer</Label>
                <Input value={form.ueOrgNumber} onChange={(e) => setForm(f => ({ ...f, ueOrgNumber: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Projekt</Label>
                <Input value={form.project} onChange={(e) => setForm(f => ({ ...f, project: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>F-skatt verifierad</Label>
              <Switch checked={form.fSkattOk} onCheckedChange={(v) => setForm(f => ({ ...f, fSkattOk: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Belopp (kr) *</Label>
                <Input type="number" value={form.amount || ''} onChange={(e) => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>Moms (kr)</Label>
                <Input type="number" value={form.vatAmount || ''} onChange={(e) => setForm(f => ({ ...f, vatAmount: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fakturadatum</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Förfallodatum</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.invoiceNumber.trim() || !form.ueCompany.trim()}>
              {editingInvoice ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort faktura</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort {invoiceToDelete?.invoiceNumber}?</DialogDescription>
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
