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
  AlarmClock,
  AlertTriangle,
  CheckCircle,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type DeadlineType = 'Preskription' | 'Överklagande' | 'Yttrande' | 'Avtal' | 'Domstol' | 'Myndighet' | 'Övrigt'
type EscalationLevel = 'Normal' | 'Hög' | 'Kritisk'
type DeadlineStatus = 'Aktiv' | 'Hanterad' | 'Försenad'

interface DeadlineEntry {
  id: string
  title: string
  caseRef: string
  clientName: string
  deadlineType: DeadlineType
  deadlineDate: string
  reminderDays: number
  escalationLevel: EscalationLevel
  status: DeadlineStatus
  responsibleLawyer: string
  note: string
}

const DEADLINE_TYPES: DeadlineType[] = ['Preskription', 'Överklagande', 'Yttrande', 'Avtal', 'Domstol', 'Myndighet', 'Övrigt']
const ESCALATION_LEVELS: EscalationLevel[] = ['Normal', 'Hög', 'Kritisk']
const DEADLINE_STATUSES: DeadlineStatus[] = ['Aktiv', 'Hanterad', 'Försenad']

const STATUS_COLORS: Record<DeadlineStatus, string> = {
  'Aktiv': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Hanterad': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Försenad': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const ESCALATION_COLORS: Record<EscalationLevel, string> = {
  'Normal': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  'Hög': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Kritisk': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const EMPTY_FORM = {
  title: '',
  caseRef: '',
  clientName: '',
  deadlineType: 'Övrigt' as DeadlineType,
  deadlineDate: '',
  reminderDays: 14,
  escalationLevel: 'Normal' as EscalationLevel,
  status: 'Aktiv' as DeadlineStatus,
  responsibleLawyer: '',
  note: '',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function daysUntil(dateStr: string): number {
  if (!dateStr) return Infinity
  return Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
}

export function DeadlinebevakningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deadlines, setDeadlines] = useState<DeadlineEntry[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<DeadlineType | 'all'>('all')
  const [filterEscalation, setFilterEscalation] = useState<EscalationLevel | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDeadline, setEditingDeadline] = useState<DeadlineEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deadlineToDelete, setDeadlineToDelete] = useState<DeadlineEntry | null>(null)

  const saveDeadlines = useCallback(async (newDeadlines: DeadlineEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'deadlines',
        config_value: newDeadlines,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchDeadlines = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'deadlines')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      // Auto-update overdue status
      const updated = (data.config_value as DeadlineEntry[]).map((d) => {
        if (d.status === 'Aktiv' && daysUntil(d.deadlineDate) < 0) {
          return { ...d, status: 'Försenad' as DeadlineStatus }
        }
        return d
      })
      setDeadlines(updated)
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchDeadlines() }, [fetchDeadlines])

  const filteredDeadlines = useMemo(() => {
    let result = deadlines
    if (filterType !== 'all') {
      result = result.filter((d) => d.deadlineType === filterType)
    }
    if (filterEscalation !== 'all') {
      result = result.filter((d) => d.escalationLevel === filterEscalation)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.caseRef.toLowerCase().includes(q) ||
          d.clientName.toLowerCase().includes(q) ||
          d.responsibleLawyer.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate))
  }, [deadlines, filterType, filterEscalation, searchQuery])

  const summary = useMemo(() => {
    const active = deadlines.filter((d) => d.status === 'Aktiv')
    const overdue = deadlines.filter((d) => d.status === 'Försenad').length
    const critical = deadlines.filter((d) => d.escalationLevel === 'Kritisk' && d.status !== 'Hanterad').length
    const within7 = active.filter((d) => daysUntil(d.deadlineDate) <= 7 && daysUntil(d.deadlineDate) >= 0).length
    const within30 = active.filter((d) => daysUntil(d.deadlineDate) <= 30 && daysUntil(d.deadlineDate) >= 0).length
    return { active: active.length, overdue, critical, within7, within30, total: deadlines.length }
  }, [deadlines])

  function openNewDeadline() {
    setEditingDeadline(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditDeadline(dl: DeadlineEntry) {
    setEditingDeadline(dl)
    setForm({
      title: dl.title,
      caseRef: dl.caseRef,
      clientName: dl.clientName,
      deadlineType: dl.deadlineType,
      deadlineDate: dl.deadlineDate,
      reminderDays: dl.reminderDays,
      escalationLevel: dl.escalationLevel,
      status: dl.status,
      responsibleLawyer: dl.responsibleLawyer,
      note: dl.note,
    })
    setDialogOpen(true)
  }

  async function handleSaveDeadline() {
    let updated: DeadlineEntry[]
    if (editingDeadline) {
      updated = deadlines.map((d) =>
        d.id === editingDeadline.id
          ? { ...d, ...form, title: form.title.trim(), caseRef: form.caseRef.trim(), clientName: form.clientName.trim(), responsibleLawyer: form.responsibleLawyer.trim(), note: form.note.trim() }
          : d
      )
    } else {
      updated = [...deadlines, { id: generateId(), ...form, title: form.title.trim(), caseRef: form.caseRef.trim(), clientName: form.clientName.trim(), responsibleLawyer: form.responsibleLawyer.trim(), note: form.note.trim() }]
    }
    setDeadlines(updated)
    setDialogOpen(false)
    await saveDeadlines(updated)
  }

  async function handleMarkHandled(dl: DeadlineEntry) {
    const updated = deadlines.map((d) =>
      d.id === dl.id ? { ...d, status: 'Hanterad' as DeadlineStatus } : d
    )
    setDeadlines(updated)
    await saveDeadlines(updated)
  }

  function openDeleteConfirmation(dl: DeadlineEntry) {
    setDeadlineToDelete(dl)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteDeadline() {
    if (!deadlineToDelete) return
    const updated = deadlines.filter((d) => d.id !== deadlineToDelete.id)
    setDeadlines(updated)
    setDeleteDialogOpen(false)
    setDeadlineToDelete(null)
    await saveDeadlines(updated)
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
          <Button onClick={openNewDeadline}>
            <Plus className="mr-2 h-4 w-4" />
            Ny deadline
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
            <TabsTrigger value="kommande">Kommande</TabsTrigger>
            <TabsTrigger value="alla">Alla deadlines</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : deadlines.length === 0 ? (
              <EmptyModuleState
                icon={AlarmClock}
                title="Inga deadlines"
                description="Lagg till deadlines for preskriptionstider, overklaganden och mer."
                actionLabel="Ny deadline"
                onAction={openNewDeadline}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Aktiva" value={String(summary.active)} />
                <KPICard
                  label="Forfallna"
                  value={String(summary.overdue)}
                  trend={summary.overdue > 0 ? 'down' : 'up'}
                  trendLabel={summary.overdue > 0 ? 'Akut' : 'OK'}
                />
                <KPICard
                  label="Kritiska"
                  value={String(summary.critical)}
                  trend={summary.critical > 0 ? 'down' : 'up'}
                />
                <KPICard label="Inom 7 dagar" value={String(summary.within7)} />
                <KPICard label="Inom 30 dagar" value={String(summary.within30)} />
              </div>
            )}
          </TabsContent>

          {/* Upcoming */}
          <TabsContent value="kommande" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {(() => {
                  const upcoming = deadlines
                    .filter((d) => d.status !== 'Hanterad')
                    .sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate))

                  if (upcoming.length === 0) {
                    return (
                      <EmptyModuleState
                        icon={CheckCircle}
                        title="Inga kommande deadlines"
                        description="Alla deadlines ar hanterade."
                      />
                    )
                  }

                  return (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">Deadline</TableHead>
                            <TableHead className="font-medium">Titel</TableHead>
                            <TableHead className="font-medium">Arende</TableHead>
                            <TableHead className="font-medium">Typ</TableHead>
                            <TableHead className="font-medium">Eskalering</TableHead>
                            <TableHead className="font-medium">Status</TableHead>
                            <TableHead className="font-medium">Ansvarig</TableHead>
                            <TableHead className="font-medium text-right">Atgard</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {upcoming.map((dl) => {
                            const days = daysUntil(dl.deadlineDate)
                            const isOverdue = days < 0
                            const isUrgent = days >= 0 && days <= 7
                            const needsReminder = days >= 0 && days <= dl.reminderDays

                            return (
                              <TableRow key={dl.id} className={cn(isOverdue && 'bg-red-50 dark:bg-red-950/10', isUrgent && !isOverdue && 'bg-amber-50 dark:bg-amber-950/10')}>
                                <TableCell className={cn('font-medium', isOverdue ? 'text-red-600' : isUrgent ? 'text-amber-600' : '')}>
                                  {dl.deadlineDate}
                                  <span className="text-xs ml-2">
                                    {isOverdue ? `(${Math.abs(days)}d forsenad)` : `(${days}d kvar)`}
                                  </span>
                                  {needsReminder && <Bell className="inline ml-1 h-3.5 w-3.5 text-amber-500" />}
                                </TableCell>
                                <TableCell className="font-medium">{dl.title}</TableCell>
                                <TableCell className="font-mono text-sm">{dl.caseRef}</TableCell>
                                <TableCell><Badge variant="outline">{dl.deadlineType}</Badge></TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className={ESCALATION_COLORS[dl.escalationLevel]}>
                                    {dl.escalationLevel}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className={STATUS_COLORS[dl.status]}>{dl.status}</Badge>
                                </TableCell>
                                <TableCell>{dl.responsibleLawyer}</TableCell>
                                <TableCell className="text-right">
                                  <Button variant="outline" size="sm" onClick={() => handleMarkHandled(dl)}>
                                    <CheckCircle className="mr-1 h-3.5 w-3.5" />
                                    Hanterad
                                  </Button>
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

          {/* All deadlines */}
          <TabsContent value="alla" className="space-y-4">
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
                      placeholder="Sok deadline..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterType} onValueChange={(val) => setFilterType(val as DeadlineType | 'all')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Typ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla typer</SelectItem>
                      {DEADLINE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterEscalation} onValueChange={(val) => setFilterEscalation(val as EscalationLevel | 'all')}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Eskalering" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla nivaer</SelectItem>
                      {ESCALATION_LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
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

                {filteredDeadlines.length === 0 ? (
                  <EmptyModuleState
                    icon={AlarmClock}
                    title="Inga deadlines hittades"
                    description="Inga deadlines matchar filtret."
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Deadline</TableHead>
                          <TableHead className="font-medium">Titel</TableHead>
                          <TableHead className="font-medium">Arende</TableHead>
                          <TableHead className="font-medium">Typ</TableHead>
                          <TableHead className="font-medium">Eskalering</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium text-right">Atgarder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDeadlines.map((dl) => (
                          <TableRow key={dl.id}>
                            <TableCell className="font-medium">{dl.deadlineDate}</TableCell>
                            <TableCell>{dl.title}</TableCell>
                            <TableCell className="font-mono text-sm">{dl.caseRef}</TableCell>
                            <TableCell><Badge variant="outline">{dl.deadlineType}</Badge></TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={ESCALATION_COLORS[dl.escalationLevel]}>
                                {dl.escalationLevel}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={STATUS_COLORS[dl.status]}>{dl.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditDeadline(dl)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(dl)} title="Ta bort">
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
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDeadline ? 'Redigera deadline' : 'Ny deadline'}</DialogTitle>
            <DialogDescription>
              {editingDeadline ? 'Uppdatera deadlineuppgifter.' : 'Lagg till en ny deadline med bevakning.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="dl-title">Titel *</Label>
              <Input id="dl-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Overklagandefrist tingsratten" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dl-case">Arende</Label>
                <Input id="dl-case" value={form.caseRef} onChange={(e) => setForm((f) => ({ ...f, caseRef: e.target.value }))} placeholder="2024-001" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dl-client">Klient</Label>
                <Input id="dl-client" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Klient AB" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dl-date">Deadline *</Label>
                <Input id="dl-date" type="date" value={form.deadlineDate} onChange={(e) => setForm((f) => ({ ...f, deadlineDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dl-type">Typ</Label>
                <Select value={form.deadlineType} onValueChange={(val) => setForm((f) => ({ ...f, deadlineType: val as DeadlineType }))}>
                  <SelectTrigger id="dl-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEADLINE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dl-esc">Eskalering</Label>
                <Select value={form.escalationLevel} onValueChange={(val) => setForm((f) => ({ ...f, escalationLevel: val as EscalationLevel }))}>
                  <SelectTrigger id="dl-esc"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESCALATION_LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dl-reminder">Paminnelse (dagar fore)</Label>
                <Input id="dl-reminder" type="number" min={1} max={90} value={form.reminderDays} onChange={(e) => setForm((f) => ({ ...f, reminderDays: parseInt(e.target.value) || 14 }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dl-lawyer">Ansvarig jurist</Label>
                <Input id="dl-lawyer" value={form.responsibleLawyer} onChange={(e) => setForm((f) => ({ ...f, responsibleLawyer: e.target.value }))} placeholder="Namn" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dl-note">Anteckning</Label>
              <Input id="dl-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Frivillig anteckning..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveDeadline} disabled={!form.title.trim() || !form.deadlineDate}>
              {editingDeadline ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort deadline</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort deadlinen{' '}
              <span className="font-semibold">{deadlineToDelete?.title}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteDeadline}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
