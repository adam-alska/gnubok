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
  CreditCard,
  AlertTriangle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type PaymentStatus = 'periodiserad' | 'forutbetald' | 'misslyckad'

interface AutogiroEntry {
  id: string
  member_name: string
  amount: number
  period_from: string
  period_to: string
  payment_date: string
  status: PaymentStatus
  account_debit: string
  account_credit: string
  notes: string
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  periodiserad: 'Periodiserad',
  forutbetald: 'Förutbetald',
  misslyckad: 'Misslyckad',
}

const STATUS_COLORS: Record<PaymentStatus, string> = {
  periodiserad: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  forutbetald: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  misslyckad: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const DEFAULT_ENTRIES: AutogiroEntry[] = [
  { id: '1', member_name: 'Anna Svensson', amount: 499, period_from: '2025-01-01', period_to: '2025-01-31', payment_date: '2025-01-05', status: 'periodiserad', account_debit: '1920', account_credit: '3010', notes: '' },
  { id: '2', member_name: 'Erik Lindgren', amount: 499, period_from: '2025-02-01', period_to: '2025-02-28', payment_date: '2025-01-20', status: 'forutbetald', account_debit: '1920', account_credit: '2970', notes: 'Betalning mottagen i förskott' },
  { id: '3', member_name: 'Maria Holm', amount: 499, period_from: '2025-01-01', period_to: '2025-01-31', payment_date: '2025-01-05', status: 'misslyckad', account_debit: '', account_credit: '', notes: 'Täckning saknas' },
]

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

const EMPTY_FORM = {
  member_name: '',
  amount: '',
  period_from: '',
  period_to: '',
  payment_date: '',
  status: 'periodiserad' as PaymentStatus,
  account_debit: '1920',
  account_credit: '3010',
  notes: '',
}

export function AutogiroPeriodiseringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<AutogiroEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<AutogiroEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<AutogiroEntry | null>(null)
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | 'all'>('all')

  const saveEntries = useCallback(async (newEntries: AutogiroEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'autogiro_entries', config_value: newEntries },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'autogiro_entries').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setEntries(data.config_value as AutogiroEntry[])
    } else {
      setEntries(DEFAULT_ENTRIES)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'autogiro_entries', config_value: DEFAULT_ENTRIES },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    let result = entries
    if (filterStatus !== 'all') result = result.filter((e) => e.status === filterStatus)
    return result.sort((a, b) => b.payment_date.localeCompare(a.payment_date))
  }, [entries, filterStatus])

  const stats = useMemo(() => {
    const total = entries.reduce((s, e) => s + e.amount, 0)
    const periodiserad = entries.filter((e) => e.status === 'periodiserad').reduce((s, e) => s + e.amount, 0)
    const forutbetald = entries.filter((e) => e.status === 'forutbetald').reduce((s, e) => s + e.amount, 0)
    const misslyckad = entries.filter((e) => e.status === 'misslyckad').reduce((s, e) => s + e.amount, 0)
    return { total, periodiserad, forutbetald, misslyckad, failedCount: entries.filter((e) => e.status === 'misslyckad').length }
  }, [entries])

  function openNew() { setEditingEntry(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }

  function openEdit(entry: AutogiroEntry) {
    setEditingEntry(entry)
    setForm({ member_name: entry.member_name, amount: String(entry.amount), period_from: entry.period_from, period_to: entry.period_to, payment_date: entry.payment_date, status: entry.status, account_debit: entry.account_debit, account_credit: entry.account_credit, notes: entry.notes })
    setDialogOpen(true)
  }

  async function handleSave() {
    const newEntry: AutogiroEntry = { id: editingEntry?.id ?? generateId(), member_name: form.member_name.trim(), amount: parseFloat(form.amount) || 0, period_from: form.period_from, period_to: form.period_to, payment_date: form.payment_date, status: form.status, account_debit: form.account_debit, account_credit: form.status === 'forutbetald' ? '2970' : form.account_credit, notes: form.notes }
    const updated = editingEntry ? entries.map((e) => e.id === editingEntry.id ? newEntry : e) : [...entries, newEntry]
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: AutogiroEntry) { setEntryToDelete(entry); setDeleteDialogOpen(true) }

  async function handleDelete() {
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
        sectorName="Fitness & Sport"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Tabs defaultValue="oversikt" className="space-y-6">
            <TabsList>
              <TabsTrigger value="oversikt">Översikt</TabsTrigger>
              <TabsTrigger value="poster">Poster</TabsTrigger>
            </TabsList>

            <TabsContent value="oversikt" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt belopp</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.total)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Periodiserat</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.periodiserad)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Förutbetalt (2970)</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.forutbetald)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Misslyckade</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.misslyckad)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Misslyckade antal</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.failedCount}</span><span className="text-sm text-muted-foreground ml-1">st</span></CardContent></Card>
              </div>
              {stats.failedCount > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div><p className="text-sm font-medium text-amber-800">Misslyckade dragningar</p><p className="text-xs text-amber-700 mt-1">{stats.failedCount} autogiro-dragningar har misslyckats. Kontrollera medlemmarnas bankkonton och gör omförsök.</p></div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="poster" className="space-y-4">
              <div className="flex items-center gap-3">
                <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as PaymentStatus | 'all')}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrera status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla statusar</SelectItem>
                    <SelectItem value="periodiserad">Periodiserad</SelectItem>
                    <SelectItem value="forutbetald">Förutbetald</SelectItem>
                    <SelectItem value="misslyckad">Misslyckad</SelectItem>
                  </SelectContent>
                </Select>
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </div>

              {filteredEntries.length === 0 ? (
                <EmptyModuleState icon={CreditCard} title="Inga poster" description="Lägg till autogiro-poster för att hantera periodisering." actionLabel="Ny post" onAction={openNew} />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Medlem</TableHead>
                        <TableHead className="font-medium text-right">Belopp</TableHead>
                        <TableHead className="font-medium">Period</TableHead>
                        <TableHead className="font-medium">Betaldatum</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium">Kontering</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-medium">{entry.member_name}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(entry.amount)} kr</TableCell>
                          <TableCell className="text-sm">{entry.period_from} - {entry.period_to}</TableCell>
                          <TableCell>{entry.payment_date}</TableCell>
                          <TableCell><Badge variant="secondary" className={STATUS_COLORS[entry.status]}>{STATUS_LABELS[entry.status]}</Badge></TableCell>
                          <TableCell className="font-mono text-sm">{entry.account_debit && entry.account_credit ? `${entry.account_debit} / ${entry.account_credit}` : '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(entry)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(entry)} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingEntry ? 'Redigera post' : 'Ny autogiro-post'}</DialogTitle><DialogDescription>{editingEntry ? 'Uppdatera postens uppgifter.' : 'Fyll i uppgifterna för den nya autogiro-posten.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label htmlFor="ag-name">Medlemsnamn *</Label><Input id="ag-name" value={form.member_name} onChange={(e) => setForm((f) => ({ ...f, member_name: e.target.value }))} placeholder="Anna Svensson" /></div>
              <div className="grid gap-2"><Label htmlFor="ag-amount">Belopp (kr) *</Label><Input id="ag-amount" type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="499" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label htmlFor="ag-from">Period från *</Label><Input id="ag-from" type="date" value={form.period_from} onChange={(e) => setForm((f) => ({ ...f, period_from: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="ag-to">Period till *</Label><Input id="ag-to" type="date" value={form.period_to} onChange={(e) => setForm((f) => ({ ...f, period_to: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="ag-date">Betaldatum *</Label><Input id="ag-date" type="date" value={form.payment_date} onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label htmlFor="ag-status">Status *</Label><Select value={form.status} onValueChange={(val) => setForm((f) => ({ ...f, status: val as PaymentStatus }))}><SelectTrigger id="ag-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="periodiserad">Periodiserad</SelectItem><SelectItem value="forutbetald">Förutbetald</SelectItem><SelectItem value="misslyckad">Misslyckad</SelectItem></SelectContent></Select></div>
              <div className="grid gap-2"><Label htmlFor="ag-debit">Debetkonto</Label><Input id="ag-debit" value={form.account_debit} onChange={(e) => setForm((f) => ({ ...f, account_debit: e.target.value }))} placeholder="1920" /></div>
              <div className="grid gap-2"><Label htmlFor="ag-credit">Kreditkonto</Label><Input id="ag-credit" value={form.status === 'forutbetald' ? '2970' : form.account_credit} onChange={(e) => setForm((f) => ({ ...f, account_credit: e.target.value }))} placeholder="3010" disabled={form.status === 'forutbetald'} /></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="ag-notes">Anteckningar</Label><Input id="ag-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Valfria anteckningar" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.member_name.trim() || !form.amount || !form.period_from || !form.period_to}>{editingEntry ? 'Uppdatera' : 'Skapa post'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort post</DialogTitle><DialogDescription>Är du säker på att du vill ta bort autogiro-posten för <span className="font-semibold">{entryToDelete?.member_name}</span>? Denna åtgärd kan inte ångras.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
