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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Receipt,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type PartyRole = 'Köpare' | 'Säljare'

interface ReverseChargeInvoice {
  id: string
  invoiceNumber: string
  date: string
  counterparty: string
  counterpartyOrg: string
  role: PartyRole
  amount: number
  vatAmount: number
  description: string
  markedOnInvoice: boolean
  reportedRow24: boolean
}

const EMPTY_FORM: Omit<ReverseChargeInvoice, 'id'> = {
  invoiceNumber: '',
  date: new Date().toISOString().slice(0, 10),
  counterparty: '',
  counterpartyOrg: '',
  role: 'Köpare',
  amount: 0,
  vatAmount: 0,
  description: '',
  markedOnInvoice: false,
  reportedRow24: false,
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function OmvandSkattskyldighetByggWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoices, setInvoices] = useState<ReverseChargeInvoice[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState<PartyRole | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<ReverseChargeInvoice | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<ReverseChargeInvoice | null>(null)

  const saveInvoices = useCallback(async (items: ReverseChargeInvoice[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'invoices', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'invoices')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setInvoices(data.config_value as ReverseChargeInvoice[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    let result = invoices
    if (filterRole !== 'all') result = result.filter((i) => i.role === filterRole)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((i) =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        i.counterparty.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [invoices, filterRole, searchQuery])

  const stats = useMemo(() => {
    const buyerTotal = invoices.filter(i => i.role === 'Köpare').reduce((s, i) => s + i.amount, 0)
    const sellerTotal = invoices.filter(i => i.role === 'Säljare').reduce((s, i) => s + i.amount, 0)
    const unmarked = invoices.filter(i => !i.markedOnInvoice).length
    const unreported = invoices.filter(i => !i.reportedRow24).length
    return { buyerTotal, sellerTotal, unmarked, unreported }
  }, [invoices])

  function openNew() {
    setEditingInvoice(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(inv: ReverseChargeInvoice) {
    setEditingInvoice(inv)
    setForm({ ...inv })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: ReverseChargeInvoice = {
      id: editingInvoice?.id ?? generateId(),
      ...form,
      amount: Number(form.amount),
      vatAmount: Number(form.vatAmount),
    }
    let updated: ReverseChargeInvoice[]
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
            Ny faktura
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="lista" className="space-y-6">
            <TabsList>
              <TabsTrigger value="lista">Fakturalista</TabsTrigger>
              <TabsTrigger value="kontroll">Kontrollpanel</TabsTrigger>
            </TabsList>

            <TabsContent value="lista" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Köpare (belopp)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">{fmt(stats.buyerTotal)}</span>
                    <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Säljare (belopp)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">{fmt(stats.sellerTotal)}</span>
                    <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ej markerade</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">{stats.unmarked}</span>
                    <span className="text-sm text-muted-foreground ml-1.5">fakturor</span>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ej rapporterade rad 24</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">{stats.unreported}</span>
                    <span className="text-sm text-muted-foreground ml-1.5">fakturor</span>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Sök fakturanr, motpart..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
                <Select value={filterRole} onValueChange={(v) => setFilterRole(v as PartyRole | 'all')}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera roll" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla roller</SelectItem>
                    <SelectItem value="Köpare">Köpare</SelectItem>
                    <SelectItem value="Säljare">Säljare</SelectItem>
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
                  icon={Receipt}
                  title="Inga fakturor"
                  description="Registrera fakturor med omvänd skattskyldighet för att följa upp korrekt momshantering."
                  actionLabel="Ny faktura"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fakturanr</TableHead>
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Motpart</TableHead>
                        <TableHead className="font-medium">Roll</TableHead>
                        <TableHead className="font-medium text-right">Belopp</TableHead>
                        <TableHead className="font-medium">Markerad</TableHead>
                        <TableHead className="font-medium">Rad 24</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono font-medium">{inv.invoiceNumber}</TableCell>
                          <TableCell>{inv.date}</TableCell>
                          <TableCell>{inv.counterparty}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={inv.role === 'Köpare' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'}>
                              {inv.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(inv.amount)} kr</TableCell>
                          <TableCell>
                            {inv.markedOnInvoice ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                          </TableCell>
                          <TableCell>
                            {inv.reportedRow24 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
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
            </TabsContent>

            <TabsContent value="kontroll" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Checklista omvänd skattskyldighet</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">Köpare: Säkerställ att säljaren är registrerad för F-skatt</p>
                        <p className="text-muted-foreground">Kontrollera på Skatteverkets hemsida innan betalning.</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">Säljare: Fakturan ska märkas &quot;Omvänd skattskyldighet&quot;</p>
                        <p className="text-muted-foreground">Ingen moms ska debiteras. Ange köparens VAT-nummer.</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">Köpare: Redovisa utgående och ingående moms</p>
                        <p className="text-muted-foreground">Beräkna 25% moms på beloppet. Rapportera i momsdeklarationen rad 24.</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">Gäller byggtjänster (SNI 41-43)</p>
                        <p className="text-muted-foreground">Omvänd skattskyldighet gäller när båda parter är verksamma inom byggsektorn.</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingInvoice ? 'Redigera faktura' : 'Ny faktura med omvänd skattskyldighet'}</DialogTitle>
            <DialogDescription>Registrera faktura för omvänd skattskyldighet inom byggsektorn.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fakturanummer *</Label>
                <Input value={form.invoiceNumber} onChange={(e) => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="F-2024-001" />
              </div>
              <div className="grid gap-2">
                <Label>Datum *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Motpart *</Label>
                <Input value={form.counterparty} onChange={(e) => setForm(f => ({ ...f, counterparty: e.target.value }))} placeholder="Företagsnamn" />
              </div>
              <div className="grid gap-2">
                <Label>Org.nummer</Label>
                <Input value={form.counterpartyOrg} onChange={(e) => setForm(f => ({ ...f, counterpartyOrg: e.target.value }))} placeholder="556xxx-xxxx" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Roll *</Label>
                <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v as PartyRole }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Köpare">Köpare</SelectItem>
                    <SelectItem value="Säljare">Säljare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Belopp (exkl. moms) *</Label>
                <Input type="number" value={form.amount || ''} onChange={(e) => setForm(f => ({ ...f, amount: Number(e.target.value), vatAmount: Number(e.target.value) * 0.25 }))} placeholder="0" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Beräknad moms (25%)</Label>
              <Input type="number" value={form.vatAmount || ''} readOnly className="bg-muted" />
            </div>
            <div className="grid gap-2">
              <Label>Beskrivning</Label>
              <Input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Typ av byggtjänst" />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Markerad på faktura &quot;Omvänd skattskyldighet&quot;</Label>
              <Switch checked={form.markedOnInvoice} onCheckedChange={(v) => setForm(f => ({ ...f, markedOnInvoice: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Rapporterad i momsdeklaration rad 24</Label>
              <Switch checked={form.reportedRow24} onCheckedChange={(v) => setForm(f => ({ ...f, reportedRow24: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.invoiceNumber.trim() || !form.counterparty.trim()}>
              {editingInvoice ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort faktura</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort faktura {invoiceToDelete?.invoiceNumber}? Denna åtgärd kan inte ångras.
            </DialogDescription>
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
