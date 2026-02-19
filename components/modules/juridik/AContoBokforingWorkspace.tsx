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
  Receipt,
  CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type AContoStatus = 'Obetald' | 'Betald' | 'Slutavraknad'

interface AContoEntry {
  id: string
  clientName: string
  caseRef: string
  invoiceNumber: string
  amount: number
  paidAmount: number
  status: AContoStatus
  invoiceDate: string
  dueDate: string
  finalSettlementDate: string
  note: string
}

const ACONTO_STATUSES: AContoStatus[] = ['Obetald', 'Betald', 'Slutavraknad']

const STATUS_COLORS: Record<AContoStatus, string> = {
  'Obetald': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Betald': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Slutavraknad': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
}

const EMPTY_FORM = {
  clientName: '',
  caseRef: '',
  invoiceNumber: '',
  amount: 0,
  paidAmount: 0,
  status: 'Obetald' as AContoStatus,
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  finalSettlementDate: '',
  note: '',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function AContoBokforingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<AContoEntry[]>([])

  const [filterStatus, setFilterStatus] = useState<AContoStatus | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<AContoEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<AContoEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: AContoEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'aconto_entries',
        config_value: newEntries,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'aconto_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as AContoEntry[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    if (filterStatus === 'all') return entries
    return entries.filter((e) => e.status === filterStatus)
  }, [entries, filterStatus])

  const summary = useMemo(() => {
    const totalInvoiced = entries.reduce((s, e) => s + e.amount, 0)
    const totalPaid = entries.reduce((s, e) => s + e.paidAmount, 0)
    const totalOutstanding = totalInvoiced - totalPaid
    const settled = entries.filter((e) => e.status === 'Slutavraknad').length
    const overdue = entries.filter((e) => {
      if (e.status !== 'Obetald') return false
      return new Date(e.dueDate) < new Date()
    }).length
    return { totalInvoiced, totalPaid, totalOutstanding, settled, overdue, count: entries.length }
  }, [entries])

  function openNewEntry() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditEntry(entry: AContoEntry) {
    setEditingEntry(entry)
    setForm({
      clientName: entry.clientName,
      caseRef: entry.caseRef,
      invoiceNumber: entry.invoiceNumber,
      amount: entry.amount,
      paidAmount: entry.paidAmount,
      status: entry.status,
      invoiceDate: entry.invoiceDate,
      dueDate: entry.dueDate,
      finalSettlementDate: entry.finalSettlementDate,
      note: entry.note,
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    let updated: AContoEntry[]
    if (editingEntry) {
      updated = entries.map((e) =>
        e.id === editingEntry.id
          ? { ...e, ...form, clientName: form.clientName.trim(), caseRef: form.caseRef.trim(), invoiceNumber: form.invoiceNumber.trim(), note: form.note.trim() }
          : e
      )
    } else {
      updated = [
        ...entries,
        { id: generateId(), ...form, clientName: form.clientName.trim(), caseRef: form.caseRef.trim(), invoiceNumber: form.invoiceNumber.trim(), note: form.note.trim() },
      ]
    }

    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  async function handleSettlement(entry: AContoEntry) {
    const today = new Date().toISOString().slice(0, 10)
    const updated = entries.map((e) =>
      e.id === entry.id ? { ...e, status: 'Slutavraknad' as AContoStatus, finalSettlementDate: today, paidAmount: e.amount } : e
    )
    setEntries(updated)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: AContoEntry) {
    setEntryToDelete(entry)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteEntry() {
    if (!entryToDelete) return
    const updated = entries.filter((e) => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Juridik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewEntry}>
            <Plus className="mr-2 h-4 w-4" />
            Ny a conto-faktura
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="fakturor">Fakturor</TabsTrigger>
            <TabsTrigger value="slutavrakning">Slutavrakning</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={Receipt}
                title="Inga a conto-fakturor"
                description="Skapa a conto-fakturor för förskottsbetalning på konto 2420."
                actionLabel="Ny a conto-faktura"
                onAction={openNewEntry}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Totalt fakturerat" value={fmt(summary.totalInvoiced)} unit="kr" />
                <KPICard label="Totalt betalt" value={fmt(summary.totalPaid)} unit="kr" />
                <KPICard
                  label="Utestående (2420)"
                  value={fmt(summary.totalOutstanding)}
                  unit="kr"
                  trend={summary.totalOutstanding > 0 ? 'neutral' : 'up'}
                />
                <KPICard label="Slutavraknade" value={String(summary.settled)} />
                <KPICard
                  label="Förfallna"
                  value={String(summary.overdue)}
                  trend={summary.overdue > 0 ? 'down' : 'up'}
                  trendLabel={summary.overdue > 0 ? 'Kräver åtgärd' : 'OK'}
                />
              </div>
            )}
          </TabsContent>

          {/* Invoices list */}
          <TabsContent value="fakturor" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as AContoStatus | 'all')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrera status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      {ACONTO_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredEntries.length === 0 ? (
                  <EmptyModuleState
                    icon={Receipt}
                    title="Inga fakturor"
                    description="Inga a conto-fakturor matchar filtret."
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Fakturanr</TableHead>
                          <TableHead className="font-medium">Klient</TableHead>
                          <TableHead className="font-medium">Ärende</TableHead>
                          <TableHead className="font-medium text-right">Belopp (kr)</TableHead>
                          <TableHead className="font-medium text-right">Betalt (kr)</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium">Förfall</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntries.map((entry) => {
                          const overdue = entry.status === 'Obetald' && new Date(entry.dueDate) < new Date()
                          return (
                            <TableRow key={entry.id} className={cn(overdue && 'bg-red-50 dark:bg-red-950/10')}>
                              <TableCell className="font-mono font-medium">{entry.invoiceNumber}</TableCell>
                              <TableCell>{entry.clientName}</TableCell>
                              <TableCell className="font-mono text-sm">{entry.caseRef}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(entry.amount)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(entry.paidAmount)}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className={STATUS_COLORS[entry.status]}>
                                  {entry.status}
                                </Badge>
                              </TableCell>
                              <TableCell className={cn('text-sm', overdue && 'text-red-600 font-medium')}>
                                {entry.dueDate}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditEntry(entry)} title="Redigera">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(entry)} title="Ta bort">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
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

          {/* Final settlement */}
          <TabsContent value="slutavrakning" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Markera betalda a conto-fakturor som slutavräknade för att stänga förskottet mot konto 2420.
                </p>
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fakturanr</TableHead>
                        <TableHead className="font-medium">Klient</TableHead>
                        <TableHead className="font-medium text-right">Belopp (kr)</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärd</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.filter((e) => e.status !== 'Slutavraknad').map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono font-medium">{entry.invoiceNumber}</TableCell>
                          <TableCell>{entry.clientName}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(entry.amount)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_COLORS[entry.status]}>
                              {entry.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {entry.status === 'Betald' && (
                              <Button variant="outline" size="sm" onClick={() => handleSettlement(entry)}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Slutavräkna
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera a conto-faktura' : 'Ny a conto-faktura'}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? 'Uppdatera fakturauppgifterna nedan.'
                : 'Skapa en ny förskottsfaktura som bokförs på konto 2420.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ac-inv">Fakturanr *</Label>
                <Input id="ac-inv" value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} placeholder="F-2024-001" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ac-client">Klient *</Label>
                <Input id="ac-client" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Klient AB" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ac-case">Ärende</Label>
                <Input id="ac-case" value={form.caseRef} onChange={(e) => setForm((f) => ({ ...f, caseRef: e.target.value }))} placeholder="2024-001" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ac-amount">Belopp (kr) *</Label>
                <Input id="ac-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ac-paid">Betalt (kr)</Label>
                <Input id="ac-paid" type="number" min={0} value={form.paidAmount} onChange={(e) => setForm((f) => ({ ...f, paidAmount: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ac-status">Status</Label>
                <Select value={form.status} onValueChange={(val) => setForm((f) => ({ ...f, status: val as AContoStatus }))}>
                  <SelectTrigger id="ac-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACONTO_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ac-invdate">Fakturadatum</Label>
                <Input id="ac-invdate" type="date" value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ac-due">Förfallodatum</Label>
                <Input id="ac-due" type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ac-note">Anteckning</Label>
              <Input id="ac-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Frivillig anteckning..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveEntry} disabled={!form.invoiceNumber.trim() || !form.clientName.trim() || form.amount <= 0}>
              {editingEntry ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort a conto-faktura</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort faktura{' '}
              <span className="font-mono font-semibold">{entryToDelete?.invoiceNumber}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteEntry}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
