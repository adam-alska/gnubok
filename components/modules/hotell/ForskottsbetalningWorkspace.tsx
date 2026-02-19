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
import { Textarea } from '@/components/ui/textarea'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Wallet,
  CheckCircle,
  XCircle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type DepositStatus = 'registrerad' | 'intaktford' | 'avbokad' | 'aterbetald'

interface Deposit {
  id: string
  guestName: string
  bookingRef: string
  amount: number
  depositDate: string
  checkinDate: string
  status: DepositStatus
  account: string
  note: string
}

const STATUS_MAP: Record<DepositStatus, { label: string; color: string }> = {
  registrerad: { label: 'Registrerad', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  intaktford: { label: 'Intäktförd', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  avbokad: { label: 'Avbokad', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  aterbetald: { label: 'Återbetald', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_FORM = {
  guestName: '',
  bookingRef: '',
  amount: 0,
  depositDate: todayStr(),
  checkinDate: '',
  status: 'registrerad' as DepositStatus,
  account: '2420',
  note: '',
}

export function ForskottsbetalningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<DepositStatus | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [depositToDelete, setDepositToDelete] = useState<Deposit | null>(null)

  const saveDeposits = useCallback(async (newDeposits: Deposit[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'deposits', config_value: newDeposits },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchDeposits = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'deposits')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setDeposits(data.config_value as Deposit[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchDeposits() }, [fetchDeposits])

  const filteredDeposits = useMemo(() => {
    let result = deposits
    if (filterStatus !== 'all') {
      result = result.filter(d => d.status === filterStatus)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(d =>
        d.guestName.toLowerCase().includes(q) ||
        d.bookingRef.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.depositDate.localeCompare(a.depositDate))
  }, [deposits, filterStatus, searchQuery])

  const summary = useMemo(() => {
    const total = deposits.filter(d => d.status === 'registrerad').reduce((s, d) => s + d.amount, 0)
    const recognized = deposits.filter(d => d.status === 'intaktford').reduce((s, d) => s + d.amount, 0)
    const cancelled = deposits.filter(d => d.status === 'avbokad' || d.status === 'aterbetald').reduce((s, d) => s + d.amount, 0)
    return { total, recognized, cancelled, count: deposits.length }
  }, [deposits])

  function openNew() {
    setEditingDeposit(null)
    setForm({ ...EMPTY_FORM, depositDate: todayStr() })
    setDialogOpen(true)
  }

  function openEdit(deposit: Deposit) {
    setEditingDeposit(deposit)
    setForm({
      guestName: deposit.guestName,
      bookingRef: deposit.bookingRef,
      amount: deposit.amount,
      depositDate: deposit.depositDate,
      checkinDate: deposit.checkinDate,
      status: deposit.status,
      account: deposit.account,
      note: deposit.note,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: Deposit = {
      id: editingDeposit?.id ?? generateId(),
      guestName: form.guestName.trim(),
      bookingRef: form.bookingRef.trim(),
      amount: form.amount,
      depositDate: form.depositDate,
      checkinDate: form.checkinDate,
      status: form.status,
      account: form.account,
      note: form.note.trim(),
    }
    let updated: Deposit[]
    if (editingDeposit) {
      updated = deposits.map(d => d.id === editingDeposit.id ? item : d)
    } else {
      updated = [...deposits, item]
    }
    setDeposits(updated)
    setDialogOpen(false)
    await saveDeposits(updated)
  }

  async function handleStatusChange(id: string, newStatus: DepositStatus) {
    const updated = deposits.map(d => d.id === id ? { ...d, status: newStatus } : d)
    setDeposits(updated)
    await saveDeposits(updated)
  }

  async function handleDelete() {
    if (!depositToDelete) return
    const updated = deposits.filter(d => d.id !== depositToDelete.id)
    setDeposits(updated)
    setDeleteDialogOpen(false)
    setDepositToDelete(null)
    await saveDeposits(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny förskottsbetalning
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Öppna förskott (konto 2420)</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(summary.total)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Intäktförda</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(summary.recognized)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avbokade / Återbetalda</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(summary.cancelled)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt antal</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{summary.count}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">st</span>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök gäst eller bokningsref..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterStatus} onValueChange={val => setFilterStatus(val as DepositStatus | 'all')}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  {(Object.keys(STATUS_MAP) as DepositStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_MAP[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                </div>
              )}
            </div>

            {/* Table */}
            {filteredDeposits.length === 0 ? (
              <EmptyModuleState
                icon={Wallet}
                title="Inga förskottsbetalningar"
                description="Registrera första förskottsbetalningen för att börja spåra."
                actionLabel="Ny förskottsbetalning"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Gäst</TableHead>
                      <TableHead className="font-medium">Bokningsref</TableHead>
                      <TableHead className="font-medium text-right">Belopp</TableHead>
                      <TableHead className="font-medium">Inbetalad</TableHead>
                      <TableHead className="font-medium">Incheckning</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeposits.map(dep => (
                      <TableRow key={dep.id}>
                        <TableCell className="font-medium">{dep.guestName}</TableCell>
                        <TableCell className="font-mono text-sm">{dep.bookingRef}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(dep.amount)} kr</TableCell>
                        <TableCell>{dep.depositDate}</TableCell>
                        <TableCell>{dep.checkinDate || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_MAP[dep.status].color}>
                            {STATUS_MAP[dep.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {dep.status === 'registrerad' && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => handleStatusChange(dep.id, 'intaktford')} title="Intäktför vid incheckning">
                                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleStatusChange(dep.id, 'avbokad')} title="Markera avbokad">
                                  <XCircle className="h-4 w-4 text-amber-600" />
                                </Button>
                              </>
                            )}
                            {dep.status === 'avbokad' && (
                              <Button variant="ghost" size="icon" onClick={() => handleStatusChange(dep.id, 'aterbetald')} title="Markera återbetald">
                                <Wallet className="h-4 w-4 text-red-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEdit(dep)} title="Redigera">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setDepositToDelete(dep); setDeleteDialogOpen(true) }} title="Ta bort">
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDeposit ? 'Redigera förskottsbetalning' : 'Ny förskottsbetalning'}</DialogTitle>
            <DialogDescription>Registrera en förskottsbetalning på konto 2420.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Gästnamn *</Label>
                <Input value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} placeholder="Anna Andersson" />
              </div>
              <div className="grid gap-2">
                <Label>Bokningsreferens</Label>
                <Input value={form.bookingRef} onChange={e => setForm(f => ({ ...f, bookingRef: e.target.value }))} placeholder="BK-2024-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Belopp (kr) *</Label>
                <Input type="number" min={0} step="0.01" value={form.amount || ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Konto</Label>
                <Input value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} placeholder="2420" maxLength={6} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Inbetalningsdatum</Label>
                <Input type="date" value={form.depositDate} onChange={e => setForm(f => ({ ...f, depositDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Incheckningsdatum</Label>
                <Input type="date" value={form.checkinDate} onChange={e => setForm(f => ({ ...f, checkinDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as DepositStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_MAP) as DepositStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_MAP[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Anteckning</Label>
              <Textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder="Valfri notering..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.guestName.trim() || form.amount <= 0}>
              {editingDeposit ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort förskottsbetalning</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort förskottsbetalningen för {depositToDelete?.guestName}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
