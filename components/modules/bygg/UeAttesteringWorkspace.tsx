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
import { Switch } from '@/components/ui/switch'
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
  Search,
  FileCheck2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ApprovalStatus = 'Mottagen' | 'Granskas' | 'Godkänd' | 'Delgodkänd' | 'Avslagen'

interface UeInvoice {
  id: string
  invoiceNumber: string
  ueCompany: string
  ueOrgNumber: string
  fSkattVerified: boolean
  project: string
  amount: number
  approvedAmount: number
  date: string
  dueDate: string
  status: ApprovalStatus
  approver: string
  approvalDate: string
  notes: string
}

const STATUS_CONFIG: Record<ApprovalStatus, { color: string; icon: typeof CheckCircle2 }> = {
  'Mottagen': { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock },
  'Granskas': { color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock },
  'Godkänd': { color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
  'Delgodkänd': { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: AlertTriangle },
  'Avslagen': { color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
}

const EMPTY_FORM = {
  invoiceNumber: '',
  ueCompany: '',
  ueOrgNumber: '',
  fSkattVerified: false,
  project: '',
  amount: 0,
  approvedAmount: 0,
  date: new Date().toISOString().slice(0, 10),
  dueDate: '',
  status: 'Mottagen' as ApprovalStatus,
  approver: '',
  approvalDate: '',
  notes: '',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function UeAttesteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoices, setInvoices] = useState<UeInvoice[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<ApprovalStatus | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<UeInvoice | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<UeInvoice | null>(null)

  const saveInvoices = useCallback(async (items: UeInvoice[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'ue_invoices', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'ue_invoices')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setInvoices(data.config_value as UeInvoice[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    let result = invoices
    if (filterStatus !== 'all') result = result.filter((i) => i.status === filterStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((i) =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        i.ueCompany.toLowerCase().includes(q) ||
        i.project.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [invoices, filterStatus, searchQuery])

  const stats = useMemo(() => {
    const totalAmount = invoices.reduce((s, i) => s + i.amount, 0)
    const approvedAmount = invoices.filter(i => i.status === 'Godkänd' || i.status === 'Delgodkänd').reduce((s, i) => s + i.approvedAmount, 0)
    const pendingCount = invoices.filter(i => i.status === 'Mottagen' || i.status === 'Granskas').length
    const noFSkatt = invoices.filter(i => !i.fSkattVerified).length
    return { totalAmount, approvedAmount, pendingCount, noFSkatt }
  }, [invoices])

  function openNew() {
    setEditingInvoice(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(inv: UeInvoice) {
    setEditingInvoice(inv)
    setForm({ ...inv })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: UeInvoice = {
      id: editingInvoice?.id ?? generateId(),
      ...form,
      amount: Number(form.amount),
      approvedAmount: Number(form.approvedAmount),
    }
    let updated: UeInvoice[]
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
        category="bokforing"
        sectorName="Bygg & Entreprenad"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny UE-faktura
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
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt fakturerat</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalAmount)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Godkänt belopp</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.approvedAmount)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Väntar attestering</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.pendingCount}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">fakturor</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {stats.noFSkatt > 0 ? (
                      <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" />Saknar F-skatt</span>
                    ) : 'F-skatt OK'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.noFSkatt}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">UE</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök faktura, UE, projekt..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as ApprovalStatus | 'all')}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  <SelectItem value="Mottagen">Mottagen</SelectItem>
                  <SelectItem value="Granskas">Granskas</SelectItem>
                  <SelectItem value="Godkänd">Godkänd</SelectItem>
                  <SelectItem value="Delgodkänd">Delgodkänd</SelectItem>
                  <SelectItem value="Avslagen">Avslagen</SelectItem>
                </SelectContent>
              </Select>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <EmptyModuleState
                icon={FileCheck2}
                title="Inga UE-fakturor"
                description="Registrera underentreprenörsfakturor för attestering, F-skatt-kontroll och delrekonciliering."
                actionLabel="Ny UE-faktura"
                onAction={openNew}
              />
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
                      <TableHead className="font-medium text-right">Godkänt</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono font-medium">{inv.invoiceNumber}</TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{inv.ueCompany}</span>
                            <span className="text-xs text-muted-foreground block">{inv.ueOrgNumber}</span>
                          </div>
                        </TableCell>
                        <TableCell>{inv.project}</TableCell>
                        <TableCell>
                          {inv.fSkattVerified
                            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            : <AlertTriangle className="h-4 w-4 text-red-500" />}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(inv.amount)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(inv.approvedAmount)} kr</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_CONFIG[inv.status].color}>{inv.status}</Badge>
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
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? 'Redigera UE-faktura' : 'Ny UE-faktura'}</DialogTitle>
            <DialogDescription>Registrera och attestera underentreprenörsfaktura. Kontrollera F-skatt innan godkännande.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fakturanummer *</Label>
                <Input value={form.invoiceNumber} onChange={(e) => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="UE-2024-001" />
              </div>
              <div className="grid gap-2">
                <Label>Projekt *</Label>
                <Input value={form.project} onChange={(e) => setForm(f => ({ ...f, project: e.target.value }))} placeholder="Projektnamn" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>UE-företag *</Label>
                <Input value={form.ueCompany} onChange={(e) => setForm(f => ({ ...f, ueCompany: e.target.value }))} placeholder="Företagsnamn" />
              </div>
              <div className="grid gap-2">
                <Label>Org.nummer</Label>
                <Input value={form.ueOrgNumber} onChange={(e) => setForm(f => ({ ...f, ueOrgNumber: e.target.value }))} placeholder="556xxx-xxxx" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>F-skatt verifierad</Label>
              <Switch checked={form.fSkattVerified} onCheckedChange={(v) => setForm(f => ({ ...f, fSkattVerified: v }))} />
            </div>
            {!form.fSkattVerified && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Varning: Kontrollera F-skatt hos Skatteverket innan betalning. Utan F-skatt ansvarar köparen för skatteavdrag.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fakturabelopp (kr) *</Label>
                <Input type="number" value={form.amount || ''} onChange={(e) => setForm(f => ({ ...f, amount: Number(e.target.value) }))} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label>Godkänt belopp (kr)</Label>
                <Input type="number" value={form.approvedAmount || ''} onChange={(e) => setForm(f => ({ ...f, approvedAmount: Number(e.target.value) }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Fakturadatum</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Förfallodatum</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Status *</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as ApprovalStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mottagen">Mottagen</SelectItem>
                    <SelectItem value="Granskas">Granskas</SelectItem>
                    <SelectItem value="Godkänd">Godkänd</SelectItem>
                    <SelectItem value="Delgodkänd">Delgodkänd</SelectItem>
                    <SelectItem value="Avslagen">Avslagen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Attesterad av</Label>
                <Input value={form.approver} onChange={(e) => setForm(f => ({ ...f, approver: e.target.value }))} placeholder="Namn" />
              </div>
              <div className="grid gap-2">
                <Label>Attesteringsdatum</Label>
                <Input type="date" value={form.approvalDate} onChange={(e) => setForm(f => ({ ...f, approvalDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Avvikelser, delrekonciliering etc." rows={2} />
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
            <DialogTitle>Ta bort UE-faktura</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort faktura {invoiceToDelete?.invoiceNumber}?</DialogDescription>
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
