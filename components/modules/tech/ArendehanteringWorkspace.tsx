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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  TicketCheck,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type TicketStatus = 'Nytt' | 'Pagaende' | 'Vantar' | 'Lost' | 'Stangt'
type TicketPriority = 'Lag' | 'Medium' | 'Hog' | 'Kritisk'
type SlaLevel = 'Standard' | 'Premium' | 'Enterprise'

interface Ticket {
  id: string
  ticketNumber: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  sla: SlaLevel
  assignedTo: string
  client: string
  createdDate: string
  dueDate: string
  resolvedDate: string
}

const TICKET_STATUSES: TicketStatus[] = ['Nytt', 'Pagaende', 'Vantar', 'Lost', 'Stangt']
const TICKET_PRIORITIES: TicketPriority[] = ['Lag', 'Medium', 'Hog', 'Kritisk']
const SLA_LEVELS: SlaLevel[] = ['Standard', 'Premium', 'Enterprise']

const STATUS_COLORS: Record<TicketStatus, string> = {
  Nytt: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Pagaende: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  Vantar: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  Lost: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  Stangt: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  Lag: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  Medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Hog: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  Kritisk: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

// SLA response time targets in hours
const SLA_TARGETS: Record<SlaLevel, Record<TicketPriority, number>> = {
  Standard: { Lag: 48, Medium: 24, Hog: 8, Kritisk: 4 },
  Premium: { Lag: 24, Medium: 8, Hog: 4, Kritisk: 2 },
  Enterprise: { Lag: 8, Medium: 4, Hog: 2, Kritisk: 1 },
}

const DEFAULT_TICKETS: Ticket[] = [
  {
    id: '1', ticketNumber: 'TKT-001', title: 'Inloggningsproblem produktionsmiljo',
    description: 'Anvandare kan inte logga in sedan senaste deploy.',
    status: 'Pagaende', priority: 'Kritisk', sla: 'Enterprise', assignedTo: 'Erik Lindberg',
    client: 'Acme AB', createdDate: '2024-06-17T08:30:00', dueDate: '2024-06-17T09:30:00', resolvedDate: '',
  },
  {
    id: '2', ticketNumber: 'TKT-002', title: 'Rapport exporterar fel data',
    description: 'Manadsrapporten visar forsta manadens data nar man valjer andra.',
    status: 'Nytt', priority: 'Hog', sla: 'Premium', assignedTo: '',
    client: 'Beta Corp', createdDate: '2024-06-17T10:15:00', dueDate: '2024-06-17T14:15:00', resolvedDate: '',
  },
  {
    id: '3', ticketNumber: 'TKT-003', title: 'Onskemal: Dark mode',
    description: 'Kunden vill ha stod for morkt tema.',
    status: 'Vantar', priority: 'Lag', sla: 'Standard', assignedTo: 'Maria Karlsson',
    client: 'Gamma Gruppen', createdDate: '2024-06-15T14:00:00', dueDate: '2024-06-17T14:00:00', resolvedDate: '',
  },
  {
    id: '4', ticketNumber: 'TKT-004', title: 'API-integration timeout',
    description: 'Betalningsgateway ger timeout vid stora order.',
    status: 'Lost', priority: 'Hog', sla: 'Enterprise', assignedTo: 'Erik Lindberg',
    client: 'Acme AB', createdDate: '2024-06-14T09:00:00', dueDate: '2024-06-14T11:00:00', resolvedDate: '2024-06-14T10:45:00',
  },
  {
    id: '5', ticketNumber: 'TKT-005', title: 'Anvandare raderade av misstag',
    description: 'Aterhamta anvandarkonto som raderades.',
    status: 'Stangt', priority: 'Medium', sla: 'Premium', assignedTo: 'Anna Svensson',
    client: 'Beta Corp', createdDate: '2024-06-12T11:30:00', dueDate: '2024-06-12T19:30:00', resolvedDate: '2024-06-12T15:00:00',
  },
]

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

const EMPTY_FORM: Omit<Ticket, 'id'> = {
  ticketNumber: '',
  title: '',
  description: '',
  status: 'Nytt',
  priority: 'Medium',
  sla: 'Standard',
  assignedTo: '',
  client: '',
  createdDate: new Date().toISOString(),
  dueDate: '',
  resolvedDate: '',
}

function generateTicketNumber(tickets: Ticket[]): string {
  const maxNum = tickets.reduce((max, t) => {
    const num = parseInt(t.ticketNumber.replace('TKT-', ''), 10)
    return isNaN(num) ? max : Math.max(max, num)
  }, 0)
  return `TKT-${String(maxNum + 1).padStart(3, '0')}`
}

export function ArendehanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<TicketStatus | 'all'>('all')
  const [filterPriority, setFilterPriority] = useState<TicketPriority | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Ticket | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Ticket | null>(null)

  const saveData = useCallback(async (data: Ticket[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'tickets',
        config_value: data,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'tickets')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setTickets(data.config_value as Ticket[])
    } else {
      setTickets(DEFAULT_TICKETS)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'tickets',
          config_value: DEFAULT_TICKETS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = useMemo(() => {
    const open = tickets.filter((t) => !['Lost', 'Stangt'].includes(t.status))
    const resolved = tickets.filter((t) => t.status === 'Lost' || t.status === 'Stangt')
    const criticalOpen = open.filter((t) => t.priority === 'Kritisk').length
    const avgResolutionHours = resolved.length > 0
      ? resolved.reduce((s, t) => {
          if (!t.resolvedDate || !t.createdDate) return s
          const diff = (new Date(t.resolvedDate).getTime() - new Date(t.createdDate).getTime()) / (1000 * 60 * 60)
          return s + diff
        }, 0) / resolved.length
      : 0
    const slaBreached = resolved.filter((t) => {
      if (!t.resolvedDate || !t.createdDate) return false
      const diffHours = (new Date(t.resolvedDate).getTime() - new Date(t.createdDate).getTime()) / (1000 * 60 * 60)
      return diffHours > SLA_TARGETS[t.sla][t.priority]
    }).length
    const slaCompliance = resolved.length > 0 ? ((resolved.length - slaBreached) / resolved.length) * 100 : 100
    return { openCount: open.length, resolvedCount: resolved.length, criticalOpen, avgResolutionHours, slaCompliance }
  }, [tickets])

  const filteredTickets = useMemo(() => {
    let result = tickets
    if (filterStatus !== 'all') result = result.filter((t) => t.status === filterStatus)
    if (filterPriority !== 'all') result = result.filter((t) => t.priority === filterPriority)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((t) =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.client.toLowerCase().includes(q) ||
        t.assignedTo.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => {
      const statusOrder = { Kritisk: 0, Hog: 1, Medium: 2, Lag: 3 }
      return (statusOrder[a.priority] ?? 4) - (statusOrder[b.priority] ?? 4)
    })
  }, [tickets, filterStatus, filterPriority, searchQuery])

  // Status flow board
  const statusBoard = useMemo(() => {
    return TICKET_STATUSES.map((status) => ({
      status,
      tickets: tickets.filter((t) => t.status === status),
    }))
  }, [tickets])

  function openNew() {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      ticketNumber: generateTicketNumber(tickets),
      createdDate: new Date().toISOString(),
    })
    setDialogOpen(true)
  }

  function openEdit(t: Ticket) {
    setEditing(t)
    setForm({
      ticketNumber: t.ticketNumber,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      sla: t.sla,
      assignedTo: t.assignedTo,
      client: t.client,
      createdDate: t.createdDate,
      dueDate: t.dueDate,
      resolvedDate: t.resolvedDate,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: Ticket = {
      id: editing?.id ?? crypto.randomUUID(),
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      resolvedDate: (form.status === 'Lost' || form.status === 'Stangt') && !form.resolvedDate
        ? new Date().toISOString()
        : form.resolvedDate,
    }
    let updated: Ticket[]
    if (editing) {
      updated = tickets.map((t) => (t.id === editing.id ? item : t))
    } else {
      updated = [item, ...tickets]
    }
    setTickets(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = tickets.filter((t) => t.id !== toDelete.id)
    setTickets(updated)
    setDeleteDialogOpen(false)
    setToDelete(null)
    await saveData(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Tech & IT"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt arende
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="ko" className="space-y-6">
            <TabsList>
              <TabsTrigger value="ko">Arendeko</TabsTrigger>
              <TabsTrigger value="board">Statusboard</TabsTrigger>
              <TabsTrigger value="sla">SLA-uppfoljning</TabsTrigger>
            </TabsList>

            <TabsContent value="ko" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Oppna arenden" value={String(kpis.openCount)} unit="st" />
                <KPICard label="Losta arenden" value={String(kpis.resolvedCount)} unit="st" />
                <KPICard label="Kritiska oppna" value={String(kpis.criticalOpen)} unit="st" trend={kpis.criticalOpen > 0 ? 'down' : 'up'} />
                <KPICard label="Snitttid losning" value={kpis.avgResolutionHours.toFixed(1)} unit="tim" />
                <KPICard label="SLA-uppfyllnad" value={fmtPct(kpis.slaCompliance)} unit="%" trend={kpis.slaCompliance >= 90 ? 'up' : 'down'} />
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Sok arende..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as TicketStatus | 'all')}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla statusar</SelectItem>
                    {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as TicketPriority | 'all')}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Prioritet" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla prioriteter</SelectItem>
                    {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Ticket list */}
              {filteredTickets.length === 0 ? (
                <EmptyModuleState
                  icon={TicketCheck}
                  title="Inga arenden"
                  description="Skapa arenden for att borja hantera support och incidenter."
                  actionLabel="Nytt arende"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Nr</TableHead>
                        <TableHead className="font-medium">Titel</TableHead>
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium">Prioritet</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium">SLA</TableHead>
                        <TableHead className="font-medium">Tilldelad</TableHead>
                        <TableHead className="font-medium text-right">Atgarder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTickets.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono font-medium">{t.ticketNumber}</TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">{t.title}</TableCell>
                          <TableCell>{t.client}</TableCell>
                          <TableCell><Badge variant="secondary" className={PRIORITY_COLORS[t.priority]}>{t.priority}</Badge></TableCell>
                          <TableCell><Badge variant="secondary" className={STATUS_COLORS[t.status]}>{t.status}</Badge></TableCell>
                          <TableCell><Badge variant="outline">{t.sla}</Badge></TableCell>
                          <TableCell>{t.assignedTo || <span className="text-muted-foreground">-</span>}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(t)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(t); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sparar...</div>
              )}
            </TabsContent>

            <TabsContent value="board" className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-5">
                {statusBoard.map((col) => (
                  <div key={col.status} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className={STATUS_COLORS[col.status]}>{col.status}</Badge>
                      <span className="text-xs text-muted-foreground">{col.tickets.length}</span>
                    </div>
                    {col.tickets.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Inga arenden</div>
                    ) : (
                      col.tickets.map((t) => (
                        <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEdit(t)}>
                          <CardContent className="p-3 space-y-1.5">
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-mono text-xs text-muted-foreground">{t.ticketNumber}</span>
                              <Badge variant="outline" className={cn('text-[10px] shrink-0', PRIORITY_COLORS[t.priority])}>{t.priority}</Badge>
                            </div>
                            <h4 className="text-sm font-medium leading-tight">{t.title}</h4>
                            <p className="text-xs text-muted-foreground">{t.client}</p>
                            {t.assignedTo && <p className="text-xs text-muted-foreground">Tilldelad: {t.assignedTo}</p>}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="sla" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">SLA-malsvar (timmar)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Niva</TableHead>
                          <TableHead className="font-medium text-right">Lag</TableHead>
                          <TableHead className="font-medium text-right">Medium</TableHead>
                          <TableHead className="font-medium text-right">Hog</TableHead>
                          <TableHead className="font-medium text-right">Kritisk</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {SLA_LEVELS.map((level) => (
                          <TableRow key={level}>
                            <TableCell className="font-medium">{level}</TableCell>
                            <TableCell className="text-right tabular-nums">{SLA_TARGETS[level].Lag}h</TableCell>
                            <TableCell className="text-right tabular-nums">{SLA_TARGETS[level].Medium}h</TableCell>
                            <TableCell className="text-right tabular-nums">{SLA_TARGETS[level].Hog}h</TableCell>
                            <TableCell className="text-right tabular-nums">{SLA_TARGETS[level].Kritisk}h</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Losta arenden - SLA-resultat</CardTitle>
                </CardHeader>
                <CardContent>
                  {tickets.filter((t) => t.resolvedDate).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Inga losta arenden att analysera.</p>
                  ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">Nr</TableHead>
                            <TableHead className="font-medium">Titel</TableHead>
                            <TableHead className="font-medium">SLA</TableHead>
                            <TableHead className="font-medium">Prioritet</TableHead>
                            <TableHead className="font-medium text-right">Mal (tim)</TableHead>
                            <TableHead className="font-medium text-right">Faktisk (tim)</TableHead>
                            <TableHead className="font-medium">Resultat</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tickets.filter((t) => t.resolvedDate).map((t) => {
                            const diffHours = (new Date(t.resolvedDate).getTime() - new Date(t.createdDate).getTime()) / (1000 * 60 * 60)
                            const target = SLA_TARGETS[t.sla][t.priority]
                            const met = diffHours <= target
                            return (
                              <TableRow key={t.id}>
                                <TableCell className="font-mono">{t.ticketNumber}</TableCell>
                                <TableCell className="max-w-[200px] truncate">{t.title}</TableCell>
                                <TableCell><Badge variant="outline">{t.sla}</Badge></TableCell>
                                <TableCell><Badge variant="secondary" className={PRIORITY_COLORS[t.priority]}>{t.priority}</Badge></TableCell>
                                <TableCell className="text-right tabular-nums">{target}</TableCell>
                                <TableCell className="text-right tabular-nums">{diffHours.toFixed(1)}</TableCell>
                                <TableCell>
                                  {met ? (
                                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Uppfylld</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Bruten</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Redigera arende' : 'Nytt arende'}</DialogTitle>
            <DialogDescription>{editing ? 'Uppdatera arendets uppgifter.' : 'Skapa ett nytt supportarende.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Arendenummer</Label><Input value={form.ticketNumber} disabled className="bg-muted" /></div>
              <div className="grid gap-2"><Label>Kund *</Label><Input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} placeholder="Acme AB" /></div>
            </div>
            <div className="grid gap-2"><Label>Titel *</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Beskriv problemet kort..." /></div>
            <div className="grid gap-2"><Label>Beskrivning</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as TicketStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Prioritet</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as TicketPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>SLA-niva</Label>
                <Select value={form.sla} onValueChange={(v) => setForm((f) => ({ ...f, sla: v as SlaLevel }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SLA_LEVELS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2 max-w-xs"><Label>Tilldelad till</Label><Input value={form.assignedTo} onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))} placeholder="Erik Lindberg" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.title.trim() || !form.client.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort arende</DialogTitle>
            <DialogDescription>Ar du saker pa att du vill ta bort {toDelete?.ticketNumber}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" /> Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
