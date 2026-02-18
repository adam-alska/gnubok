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
  Home,
  Download,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface RotCustomer {
  id: string
  personnummer: string
  name: string
  address: string
  laborCost: number
  rotDeduction: number
  maxDeduction: number
  usedDeduction: number
  invoiceRef: string
  date: string
  status: 'Preliminär' | 'Skickad till SKV' | 'Godkänd' | 'Avslagen'
}

const MAX_ROT_PER_PERSON = 50000
const ROT_PERCENTAGE = 0.30

const EMPTY_FORM = {
  personnummer: '',
  name: '',
  address: '',
  laborCost: 0,
  usedDeduction: 0,
  invoiceRef: '',
  date: new Date().toISOString().slice(0, 10),
  status: 'Preliminär' as 'Preliminär' | 'Skickad till SKV' | 'Godkänd' | 'Avslagen',
}

const STATUS_COLORS: Record<string, string> = {
  'Preliminär': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Skickad till SKV': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Godkänd': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Avslagen': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function validatePersonnummer(pnr: string): boolean {
  const clean = pnr.replace(/\D/g, '')
  return clean.length === 10 || clean.length === 12
}

export function RotAvdragWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState<RotCustomer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<RotCustomer | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [pnrError, setPnrError] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<RotCustomer | null>(null)

  const saveCustomers = useCallback(async (items: RotCustomer[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'rot_customers', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'rot_customers')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setCustomers(data.config_value as RotCustomer[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return customers.sort((a, b) => b.date.localeCompare(a.date))
    const q = searchQuery.toLowerCase()
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || c.personnummer.includes(q) || c.invoiceRef.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [customers, searchQuery])

  const stats = useMemo(() => {
    const totalLabor = customers.reduce((s, c) => s + c.laborCost, 0)
    const totalDeduction = customers.reduce((s, c) => s + c.rotDeduction, 0)
    const approved = customers.filter(c => c.status === 'Godkänd').length
    const pending = customers.filter(c => c.status === 'Preliminär' || c.status === 'Skickad till SKV').length
    return { totalLabor, totalDeduction, approved, pending }
  }, [customers])

  function openNew() {
    setEditingCustomer(null)
    setForm({ ...EMPTY_FORM })
    setPnrError('')
    setDialogOpen(true)
  }

  function openEdit(c: RotCustomer) {
    setEditingCustomer(c)
    setForm({
      personnummer: c.personnummer,
      name: c.name,
      address: c.address,
      laborCost: c.laborCost,
      usedDeduction: c.usedDeduction,
      invoiceRef: c.invoiceRef,
      date: c.date,
      status: c.status,
    })
    setPnrError('')
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!validatePersonnummer(form.personnummer)) {
      setPnrError('Ogiltigt personnummer. Ange 10 eller 12 siffror.')
      return
    }
    setPnrError('')

    const laborCost = Number(form.laborCost)
    const calculated = Math.round(laborCost * ROT_PERCENTAGE)
    const remaining = MAX_ROT_PER_PERSON - Number(form.usedDeduction)
    const rotDeduction = Math.min(calculated, Math.max(remaining, 0))

    const item: RotCustomer = {
      id: editingCustomer?.id ?? generateId(),
      personnummer: form.personnummer.trim(),
      name: form.name.trim(),
      address: form.address.trim(),
      laborCost,
      rotDeduction,
      maxDeduction: MAX_ROT_PER_PERSON,
      usedDeduction: Number(form.usedDeduction),
      invoiceRef: form.invoiceRef.trim(),
      date: form.date,
      status: form.status,
    }

    let updated: RotCustomer[]
    if (editingCustomer) {
      updated = customers.map((c) => c.id === editingCustomer.id ? item : c)
    } else {
      updated = [...customers, item]
    }
    setCustomers(updated)
    setDialogOpen(false)
    await saveCustomers(updated)
  }

  async function handleDelete() {
    if (!customerToDelete) return
    const updated = customers.filter((c) => c.id !== customerToDelete.id)
    setCustomers(updated)
    setDeleteDialogOpen(false)
    setCustomerToDelete(null)
    await saveCustomers(updated)
  }

  function exportSkatteverketFormat() {
    const approved = customers.filter(c => c.status !== 'Avslagen')
    const lines = approved.map(c =>
      `${c.personnummer};${c.name};${c.laborCost};${c.rotDeduction};${c.invoiceRef};${c.date}`
    )
    const csv = `Personnummer;Namn;Arbetskostnad;ROT-avdrag;Fakturanr;Datum\n${lines.join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rot-avdrag-skv-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportSkatteverketFormat} disabled={customers.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export SKV
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Ny kund
            </Button>
          </div>
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
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total arbetskostnad</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalLabor)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt ROT-avdrag</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalDeduction)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr (30%)</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Godkända</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.approved}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">ärenden</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Under behandling</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.pending}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">ärenden</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök namn, personnummer, faktura..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <EmptyModuleState
                icon={Home}
                title="Inga ROT-ärenden"
                description="Registrera ROT-avdrag per kund. 30% av arbetskostnaden, max 50 000 kr per person och år."
                actionLabel="Ny kund"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Kund</TableHead>
                      <TableHead className="font-medium">Personnummer</TableHead>
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium text-right">Arbetskostnad</TableHead>
                      <TableHead className="font-medium text-right">ROT-avdrag</TableHead>
                      <TableHead className="font-medium">Kvar av max</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => {
                      const remaining = MAX_ROT_PER_PERSON - c.usedDeduction - c.rotDeduction
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="font-mono text-sm">{c.personnummer}</TableCell>
                          <TableCell>{c.date}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(c.laborCost)} kr</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(c.rotDeduction)} kr</TableCell>
                          <TableCell>
                            {remaining <= 0 ? (
                              <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Max nått</Badge>
                            ) : (
                              <span className="text-sm tabular-nums">{fmt(remaining)} kr</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_COLORS[c.status]}>{c.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setCustomerToDelete(c); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Redigera ROT-ärende' : 'Nytt ROT-ärende'}</DialogTitle>
            <DialogDescription>30% av arbetskostnaden, max 50 000 kr per person och år.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Personnummer *</Label>
                <Input value={form.personnummer} onChange={(e) => setForm(f => ({ ...f, personnummer: e.target.value }))} placeholder="YYYYMMDD-NNNN" />
                {pnrError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{pnrError}</p>}
              </div>
              <div className="grid gap-2">
                <Label>Namn *</Label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Förnamn Efternamn" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Adress (arbetsställe)</Label>
              <Input value={form.address} onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Gatuadress, Postort" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Arbetskostnad (kr) *</Label>
                <Input type="number" value={form.laborCost || ''} onChange={(e) => setForm(f => ({ ...f, laborCost: Number(e.target.value) }))} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label>Redan utnyttjat av max ({fmt(MAX_ROT_PER_PERSON)} kr)</Label>
                <Input type="number" value={form.usedDeduction || ''} onChange={(e) => setForm(f => ({ ...f, usedDeduction: Number(e.target.value) }))} placeholder="0" />
              </div>
            </div>
            {form.laborCost > 0 && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Beräknat ROT-avdrag (30%)</span>
                    <span className="font-semibold tabular-nums">
                      {fmt(Math.min(Math.round(Number(form.laborCost) * ROT_PERCENTAGE), Math.max(MAX_ROT_PER_PERSON - Number(form.usedDeduction), 0)))} kr
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fakturareferens</Label>
                <Input value={form.invoiceRef} onChange={(e) => setForm(f => ({ ...f, invoiceRef: e.target.value }))} placeholder="F-2024-001" />
              </div>
              <div className="grid gap-2">
                <Label>Datum</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.personnummer.trim() || !form.name.trim() || form.laborCost <= 0}>
              {editingCustomer ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort ROT-ärende</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort ärendet för {customerToDelete?.name}?</DialogDescription>
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
