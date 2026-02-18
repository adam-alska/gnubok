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
  Search,
  Briefcase,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type CaseStatus = 'Nytt' | 'Pågående' | 'Vilande' | 'Avslutat' | 'Arkiverat'
type CaseType = 'Affärsjuridik' | 'Tvistemål' | 'Familjerätt' | 'Fastighetsrätt' | 'Arbetsrätt' | 'Straffrätt' | 'Övrigt'

interface CaseEntry {
  id: string
  caseRef: string
  title: string
  caseType: CaseType
  status: CaseStatus
  clientName: string
  responsibleLawyer: string
  startDate: string
  deadline: string
  note: string
}

const CASE_STATUSES: CaseStatus[] = ['Nytt', 'Pågående', 'Vilande', 'Avslutat', 'Arkiverat']
const CASE_TYPES: CaseType[] = ['Affärsjuridik', 'Tvistemål', 'Familjerätt', 'Fastighetsrätt', 'Arbetsrätt', 'Straffrätt', 'Övrigt']

const STATUS_COLORS: Record<CaseStatus, string> = {
  'Nytt': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Pågående': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Vilande': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Avslutat': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  'Arkiverat': 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500',
}

const EMPTY_FORM = {
  caseRef: '',
  title: '',
  caseType: 'Affärsjuridik' as CaseType,
  status: 'Nytt' as CaseStatus,
  clientName: '',
  responsibleLawyer: '',
  startDate: new Date().toISOString().slice(0, 10),
  deadline: '',
  note: '',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function ArendehanteringJuridikWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cases, setCases] = useState<CaseEntry[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<CaseStatus | 'all'>('all')
  const [filterType, setFilterType] = useState<CaseType | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCase, setEditingCase] = useState<CaseEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [caseToDelete, setCaseToDelete] = useState<CaseEntry | null>(null)

  const saveCases = useCallback(async (newCases: CaseEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'cases',
        config_value: newCases,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchCases = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'cases')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setCases(data.config_value as CaseEntry[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchCases() }, [fetchCases])

  const filteredCases = useMemo(() => {
    let result = cases
    if (filterStatus !== 'all') {
      result = result.filter((c) => c.status === filterStatus)
    }
    if (filterType !== 'all') {
      result = result.filter((c) => c.caseType === filterType)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.caseRef.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.clientName.toLowerCase().includes(q) ||
          c.responsibleLawyer.toLowerCase().includes(q)
      )
    }
    return result
  }, [cases, filterStatus, filterType, searchQuery])

  const summary = useMemo(() => {
    const active = cases.filter((c) => c.status === 'Pågående').length
    const newCases = cases.filter((c) => c.status === 'Nytt').length
    const overdue = cases.filter((c) => {
      if (!c.deadline || c.status === 'Avslutat' || c.status === 'Arkiverat') return false
      return new Date(c.deadline) < new Date()
    }).length
    const total = cases.length
    return { active, newCases, overdue, total }
  }, [cases])

  function openNewCase() {
    setEditingCase(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditCase(c: CaseEntry) {
    setEditingCase(c)
    setForm({
      caseRef: c.caseRef,
      title: c.title,
      caseType: c.caseType,
      status: c.status,
      clientName: c.clientName,
      responsibleLawyer: c.responsibleLawyer,
      startDate: c.startDate,
      deadline: c.deadline,
      note: c.note,
    })
    setDialogOpen(true)
  }

  async function handleSaveCase() {
    let updated: CaseEntry[]
    if (editingCase) {
      updated = cases.map((c) =>
        c.id === editingCase.id
          ? { ...c, ...form, caseRef: form.caseRef.trim(), title: form.title.trim(), clientName: form.clientName.trim(), responsibleLawyer: form.responsibleLawyer.trim(), note: form.note.trim() }
          : c
      )
    } else {
      updated = [...cases, { id: generateId(), ...form, caseRef: form.caseRef.trim(), title: form.title.trim(), clientName: form.clientName.trim(), responsibleLawyer: form.responsibleLawyer.trim(), note: form.note.trim() }]
    }
    setCases(updated)
    setDialogOpen(false)
    await saveCases(updated)
  }

  function openDeleteConfirmation(c: CaseEntry) {
    setCaseToDelete(c)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteCase() {
    if (!caseToDelete) return
    const updated = cases.filter((c) => c.id !== caseToDelete.id)
    setCases(updated)
    setDeleteDialogOpen(false)
    setCaseToDelete(null)
    await saveCases(updated)
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
          <Button onClick={openNewCase}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt arende
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
            <TabsTrigger value="arenden">Arenden</TabsTrigger>
            <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : cases.length === 0 ? (
              <EmptyModuleState
                icon={Briefcase}
                title="Inga arenden"
                description="Skapa arenden for att borja hantera dina juridiska uppdrag."
                actionLabel="Nytt arende"
                onAction={openNewCase}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Totalt arenden" value={String(summary.total)} />
                <KPICard label="Pagaende" value={String(summary.active)} />
                <KPICard label="Nya" value={String(summary.newCases)} />
                <KPICard
                  label="Forfallna deadlines"
                  value={String(summary.overdue)}
                  trend={summary.overdue > 0 ? 'down' : 'up'}
                  trendLabel={summary.overdue > 0 ? 'Krav atgard' : 'OK'}
                />
              </div>
            )}
          </TabsContent>

          {/* Cases list */}
          <TabsContent value="arenden" className="space-y-4">
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
                      placeholder="Sok arende, klient, jurist..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as CaseStatus | 'all')}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      {CASE_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterType} onValueChange={(val) => setFilterType(val as CaseType | 'all')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Arendetyp" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla typer</SelectItem>
                      {CASE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
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

                {filteredCases.length === 0 ? (
                  <EmptyModuleState
                    icon={Briefcase}
                    title="Inga arenden hittades"
                    description="Inga arenden matchar filtret."
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Ref</TableHead>
                          <TableHead className="font-medium">Titel</TableHead>
                          <TableHead className="font-medium">Klient</TableHead>
                          <TableHead className="font-medium">Typ</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium">Ansvarig</TableHead>
                          <TableHead className="font-medium">Deadline</TableHead>
                          <TableHead className="font-medium text-right">Atgarder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCases.map((c) => {
                          const overdue = c.deadline && c.status !== 'Avslutat' && c.status !== 'Arkiverat' && new Date(c.deadline) < new Date()
                          return (
                            <TableRow key={c.id} className={cn(overdue && 'bg-red-50 dark:bg-red-950/10')}>
                              <TableCell className="font-mono font-medium">{c.caseRef}</TableCell>
                              <TableCell className="font-medium">{c.title}</TableCell>
                              <TableCell>{c.clientName}</TableCell>
                              <TableCell><Badge variant="outline">{c.caseType}</Badge></TableCell>
                              <TableCell>
                                <Badge variant="secondary" className={STATUS_COLORS[c.status]}>{c.status}</Badge>
                              </TableCell>
                              <TableCell>{c.responsibleLawyer}</TableCell>
                              <TableCell className={cn('text-sm', overdue && 'text-red-600 font-medium')}>
                                {c.deadline || '-'}
                                {overdue && <AlertTriangle className="inline ml-1 h-3.5 w-3.5" />}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditCase(c)} title="Redigera">
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(c)} title="Ta bort">
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

          {/* Deadlines */}
          <TabsContent value="deadlines" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {(() => {
                  const withDeadline = cases
                    .filter((c) => c.deadline && c.status !== 'Avslutat' && c.status !== 'Arkiverat')
                    .sort((a, b) => a.deadline.localeCompare(b.deadline))

                  if (withDeadline.length === 0) {
                    return (
                      <EmptyModuleState
                        icon={AlertTriangle}
                        title="Inga deadlines"
                        description="Inga aktiva arenden har deadlines satta."
                      />
                    )
                  }

                  return (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">Deadline</TableHead>
                            <TableHead className="font-medium">Ref</TableHead>
                            <TableHead className="font-medium">Titel</TableHead>
                            <TableHead className="font-medium">Klient</TableHead>
                            <TableHead className="font-medium">Ansvarig</TableHead>
                            <TableHead className="font-medium">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {withDeadline.map((c) => {
                            const overdue = new Date(c.deadline) < new Date()
                            const daysLeft = Math.ceil((new Date(c.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                            return (
                              <TableRow key={c.id} className={cn(overdue && 'bg-red-50 dark:bg-red-950/10')}>
                                <TableCell className={cn('font-medium', overdue ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-600' : '')}>
                                  {c.deadline}
                                  <span className="text-xs ml-2">
                                    {overdue ? `(${Math.abs(daysLeft)}d forsenad)` : `(${daysLeft}d kvar)`}
                                  </span>
                                </TableCell>
                                <TableCell className="font-mono">{c.caseRef}</TableCell>
                                <TableCell>{c.title}</TableCell>
                                <TableCell>{c.clientName}</TableCell>
                                <TableCell>{c.responsibleLawyer}</TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className={STATUS_COLORS[c.status]}>{c.status}</Badge>
                                </TableCell>
                              </TableRow>
                            )
                          })}
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
            <DialogTitle>{editingCase ? 'Redigera arende' : 'Nytt arende'}</DialogTitle>
            <DialogDescription>
              {editingCase ? 'Uppdatera arendeuppgifter.' : 'Skapa ett nytt juridiskt arende.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="case-ref">Arenderef *</Label>
                <Input id="case-ref" value={form.caseRef} onChange={(e) => setForm((f) => ({ ...f, caseRef: e.target.value }))} placeholder="2024-001" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="case-title">Titel *</Label>
                <Input id="case-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Kontraktsforhandling" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="case-client">Klient *</Label>
                <Input id="case-client" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Klient AB" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="case-lawyer">Ansvarig jurist</Label>
                <Input id="case-lawyer" value={form.responsibleLawyer} onChange={(e) => setForm((f) => ({ ...f, responsibleLawyer: e.target.value }))} placeholder="Namn" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="case-type">Arendetyp</Label>
                <Select value={form.caseType} onValueChange={(val) => setForm((f) => ({ ...f, caseType: val as CaseType }))}>
                  <SelectTrigger id="case-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CASE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="case-status">Status</Label>
                <Select value={form.status} onValueChange={(val) => setForm((f) => ({ ...f, status: val as CaseStatus }))}>
                  <SelectTrigger id="case-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CASE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="case-start">Startdatum</Label>
                <Input id="case-start" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="case-deadline">Deadline</Label>
                <Input id="case-deadline" type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="case-note">Anteckning</Label>
              <Input id="case-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Frivillig anteckning..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveCase} disabled={!form.caseRef.trim() || !form.title.trim() || !form.clientName.trim()}>
              {editingCase ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort arende</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort arende{' '}
              <span className="font-mono font-semibold">{caseToDelete?.caseRef}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteCase}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
