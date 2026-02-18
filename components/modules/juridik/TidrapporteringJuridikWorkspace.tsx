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
import { Checkbox } from '@/components/ui/checkbox'
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
  Clock,
  CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ApprovalStatus = 'Utkast' | 'Inskickad' | 'Godkänd' | 'Avvisad'

interface TimeEntry {
  id: string
  date: string
  lawyerName: string
  caseRef: string
  clientName: string
  hours: number
  description: string
  billable: boolean
  approvalStatus: ApprovalStatus
  hourlyRate: number
}

const APPROVAL_STATUSES: ApprovalStatus[] = ['Utkast', 'Inskickad', 'Godkänd', 'Avvisad']

const APPROVAL_COLORS: Record<ApprovalStatus, string> = {
  'Utkast': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  'Inskickad': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Godkänd': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Avvisad': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  lawyerName: '',
  caseRef: '',
  clientName: '',
  hours: 0,
  description: '',
  billable: true,
  approvalStatus: 'Utkast' as ApprovalStatus,
  hourlyRate: 0,
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDec(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function TidrapporteringJuridikWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<TimeEntry[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterApproval, setFilterApproval] = useState<ApprovalStatus | 'all'>('all')
  const [filterBillable, setFilterBillable] = useState<'all' | 'billable' | 'internal'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<TimeEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: TimeEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'time_entries',
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
      .eq('config_key', 'time_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as TimeEntry[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    let result = entries
    if (filterApproval !== 'all') {
      result = result.filter((e) => e.approvalStatus === filterApproval)
    }
    if (filterBillable === 'billable') {
      result = result.filter((e) => e.billable)
    } else if (filterBillable === 'internal') {
      result = result.filter((e) => !e.billable)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (e) =>
          e.lawyerName.toLowerCase().includes(q) ||
          e.caseRef.toLowerCase().includes(q) ||
          e.clientName.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, filterApproval, filterBillable, searchQuery])

  const summary = useMemo(() => {
    const totalHours = entries.reduce((s, e) => s + e.hours, 0)
    const billableHours = entries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0)
    const internalHours = totalHours - billableHours
    const billableValue = entries.filter((e) => e.billable).reduce((s, e) => s + e.hours * e.hourlyRate, 0)
    const pendingApproval = entries.filter((e) => e.approvalStatus === 'Inskickad').length
    return { totalHours, billableHours, internalHours, billableValue, pendingApproval }
  }, [entries])

  function openNewEntry() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditEntry(entry: TimeEntry) {
    setEditingEntry(entry)
    setForm({
      date: entry.date,
      lawyerName: entry.lawyerName,
      caseRef: entry.caseRef,
      clientName: entry.clientName,
      hours: entry.hours,
      description: entry.description,
      billable: entry.billable,
      approvalStatus: entry.approvalStatus,
      hourlyRate: entry.hourlyRate,
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    let updated: TimeEntry[]
    if (editingEntry) {
      updated = entries.map((e) =>
        e.id === editingEntry.id
          ? { ...e, ...form, lawyerName: form.lawyerName.trim(), caseRef: form.caseRef.trim(), clientName: form.clientName.trim(), description: form.description.trim() }
          : e
      )
    } else {
      updated = [...entries, { id: generateId(), ...form, lawyerName: form.lawyerName.trim(), caseRef: form.caseRef.trim(), clientName: form.clientName.trim(), description: form.description.trim() }]
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  async function handleApprove(entry: TimeEntry) {
    const updated = entries.map((e) =>
      e.id === entry.id ? { ...e, approvalStatus: 'Godkänd' as ApprovalStatus } : e
    )
    setEntries(updated)
    await saveEntries(updated)
  }

  async function handleSubmit(entry: TimeEntry) {
    const updated = entries.map((e) =>
      e.id === entry.id ? { ...e, approvalStatus: 'Inskickad' as ApprovalStatus } : e
    )
    setEntries(updated)
    await saveEntries(updated)
  }

  function openDeleteConfirmation(entry: TimeEntry) {
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
        category="operativ"
        sectorName="Juridik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewEntry}>
            <Plus className="mr-2 h-4 w-4" />
            Ny tidspost
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
            <TabsTrigger value="tidsposter">Tidsposter</TabsTrigger>
            <TabsTrigger value="godkannande">Godkannande</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : entries.length === 0 ? (
              <EmptyModuleState
                icon={Clock}
                title="Inga tidsposter"
                description="Registrera tid per arende for att spara debiterbara timmar."
                actionLabel="Ny tidspost"
                onAction={openNewEntry}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Totalt timmar" value={fmtDec(summary.totalHours)} unit="h" />
                <KPICard label="Debiterbara" value={fmtDec(summary.billableHours)} unit="h" />
                <KPICard label="Interna" value={fmtDec(summary.internalHours)} unit="h" />
                <KPICard label="Debiterbart varde" value={fmt(summary.billableValue)} unit="kr" />
                <KPICard
                  label="Vantar godkannande"
                  value={String(summary.pendingApproval)}
                  trend={summary.pendingApproval > 0 ? 'neutral' : 'up'}
                />
              </div>
            )}
          </TabsContent>

          {/* Time entries */}
          <TabsContent value="tidsposter" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sok jurist, arende, klient..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterBillable} onValueChange={(val) => setFilterBillable(val as 'all' | 'billable' | 'internal')}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla</SelectItem>
                      <SelectItem value="billable">Debiterbara</SelectItem>
                      <SelectItem value="internal">Interna</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterApproval} onValueChange={(val) => setFilterApproval(val as ApprovalStatus | 'all')}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      {APPROVAL_STATUSES.map((s) => (
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
                    icon={Clock}
                    title="Inga tidsposter"
                    description="Inga tidsposter matchar filtret."
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Jurist</TableHead>
                          <TableHead className="font-medium">Arende</TableHead>
                          <TableHead className="font-medium">Klient</TableHead>
                          <TableHead className="font-medium text-right">Timmar</TableHead>
                          <TableHead className="font-medium">Typ</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium text-right">Atgarder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{entry.date}</TableCell>
                            <TableCell className="font-medium">{entry.lawyerName}</TableCell>
                            <TableCell className="font-mono text-sm">{entry.caseRef}</TableCell>
                            <TableCell>{entry.clientName}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtDec(entry.hours)}</TableCell>
                            <TableCell>
                              <Badge variant={entry.billable ? 'secondary' : 'outline'}>
                                {entry.billable ? 'Debiterbar' : 'Intern'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={APPROVAL_COLORS[entry.approvalStatus]}>
                                {entry.approvalStatus}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {entry.approvalStatus === 'Utkast' && (
                                  <Button variant="ghost" size="sm" onClick={() => handleSubmit(entry)} title="Skicka in">
                                    Skicka in
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => openEditEntry(entry)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(entry)} title="Ta bort">
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
              </>
            )}
          </TabsContent>

          {/* Approval */}
          <TabsContent value="godkannande" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {(() => {
                  const pending = entries.filter((e) => e.approvalStatus === 'Inskickad')
                  if (pending.length === 0) {
                    return (
                      <EmptyModuleState
                        icon={CheckCircle}
                        title="Inga att godkanna"
                        description="Alla inskickade tidsposter har hanterats."
                      />
                    )
                  }
                  return (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">Datum</TableHead>
                            <TableHead className="font-medium">Jurist</TableHead>
                            <TableHead className="font-medium">Arende</TableHead>
                            <TableHead className="font-medium text-right">Timmar</TableHead>
                            <TableHead className="font-medium">Beskrivning</TableHead>
                            <TableHead className="font-medium text-right">Atgard</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pending.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell>{entry.date}</TableCell>
                              <TableCell className="font-medium">{entry.lawyerName}</TableCell>
                              <TableCell className="font-mono text-sm">{entry.caseRef}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtDec(entry.hours)}</TableCell>
                              <TableCell className="text-sm max-w-[200px] truncate">{entry.description}</TableCell>
                              <TableCell className="text-right">
                                <Button variant="outline" size="sm" onClick={() => handleApprove(entry)}>
                                  <CheckCircle className="mr-1 h-3.5 w-3.5" />
                                  Godkann
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                })()}
              </>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera tidspost' : 'Ny tidspost'}</DialogTitle>
            <DialogDescription>
              {editingEntry ? 'Uppdatera tidsposten.' : 'Registrera tid per arende.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="time-date">Datum *</Label>
                <Input id="time-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="time-lawyer">Jurist *</Label>
                <Input id="time-lawyer" value={form.lawyerName} onChange={(e) => setForm((f) => ({ ...f, lawyerName: e.target.value }))} placeholder="Namn" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="time-case">Arende *</Label>
                <Input id="time-case" value={form.caseRef} onChange={(e) => setForm((f) => ({ ...f, caseRef: e.target.value }))} placeholder="2024-001" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="time-client">Klient</Label>
                <Input id="time-client" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Klient AB" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="time-desc">Beskrivning</Label>
                <Input id="time-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Kontraktsgranskning" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="time-hours">Timmar *</Label>
                <Input id="time-hours" type="number" min={0} step="0.25" value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="time-rate">Timpris (kr)</Label>
                <Input id="time-rate" type="number" min={0} value={form.hourlyRate} onChange={(e) => setForm((f) => ({ ...f, hourlyRate: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="flex items-end pb-2 gap-2">
                <Checkbox
                  id="time-billable"
                  checked={form.billable}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, billable: !!checked }))}
                />
                <Label htmlFor="time-billable" className="text-sm cursor-pointer">Debiterbar</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveEntry} disabled={!form.lawyerName.trim() || !form.caseRef.trim() || form.hours <= 0}>
              {editingEntry ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort tidspost</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort tidsposten for{' '}
              <span className="font-semibold">{entryToDelete?.lawyerName}</span> ({entryToDelete?.date})?
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
