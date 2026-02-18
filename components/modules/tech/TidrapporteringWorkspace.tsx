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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  Play,
  Square,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ApprovalStatus = 'Utkast' | 'Inskickad' | 'Godkand' | 'Avslagen'

interface TimeEntry {
  id: string
  date: string
  project: string
  client: string
  hours: number
  description: string
  billable: boolean
  status: ApprovalStatus
}

const STATUSES: ApprovalStatus[] = ['Utkast', 'Inskickad', 'Godkand', 'Avslagen']

const STATUS_COLORS: Record<ApprovalStatus, string> = {
  Utkast: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  Inskickad: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Godkand: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  Avslagen: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const DEFAULT_ENTRIES: TimeEntry[] = [
  { id: '1', date: '2024-06-17', project: 'Webbplattform v2', client: 'Acme AB', hours: 7.5, description: 'Frontend-utveckling av dashboarden', billable: true, status: 'Godkand' },
  { id: '2', date: '2024-06-17', project: 'Intern utbildning', client: 'Intern', hours: 0.5, description: 'Teammeeting', billable: false, status: 'Godkand' },
  { id: '3', date: '2024-06-18', project: 'Webbplattform v2', client: 'Acme AB', hours: 6, description: 'API-integration betalningsgateway', billable: true, status: 'Inskickad' },
  { id: '4', date: '2024-06-18', project: 'Mobilapp Beta', client: 'Beta Corp', hours: 2, description: 'Kravanalys och prototyp', billable: true, status: 'Inskickad' },
  { id: '5', date: '2024-06-19', project: 'Webbplattform v2', client: 'Acme AB', hours: 8, description: 'Testning och buggfix', billable: true, status: 'Utkast' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const EMPTY_FORM = {
  date: todayStr(),
  project: '',
  client: '',
  hours: 0,
  description: '',
  billable: true,
  status: 'Utkast' as ApprovalStatus,
}

export function TidrapporteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<TimeEntry[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<TimeEntry | null>(null)

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerProject, setTimerProject] = useState('')
  const [timerClient, setTimerClient] = useState('')

  // Timer tick
  useEffect(() => {
    if (!timerRunning) return
    const interval = setInterval(() => {
      setTimerSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [timerRunning])

  const saveData = useCallback(async (data: TimeEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'time_entries',
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
      .eq('config_key', 'time_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setEntries(data.config_value as TimeEntry[])
    } else {
      setEntries(DEFAULT_ENTRIES)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'time_entries',
          config_value: DEFAULT_ENTRIES,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = useMemo(() => {
    const totalHours = entries.reduce((s, e) => s + e.hours, 0)
    const billableHours = entries.filter((e) => e.billable).reduce((s, e) => s + e.hours, 0)
    const utilization = totalHours > 0 ? (billableHours / totalHours) * 100 : 0
    const todayHours = entries.filter((e) => e.date === todayStr()).reduce((s, e) => s + e.hours, 0)
    const pendingApproval = entries.filter((e) => e.status === 'Inskickad').length
    return { totalHours, billableHours, utilization, todayHours, pendingApproval }
  }, [entries])

  // Group by project
  const projectSummary = useMemo(() => {
    const map: Record<string, { project: string; client: string; hours: number; billableHours: number }> = {}
    for (const e of entries) {
      if (!map[e.project]) {
        map[e.project] = { project: e.project, client: e.client, hours: 0, billableHours: 0 }
      }
      map[e.project].hours += e.hours
      if (e.billable) map[e.project].billableHours += e.hours
    }
    return Object.values(map).sort((a, b) => b.hours - a.hours)
  }, [entries])

  function startTimer() {
    setTimerRunning(true)
    setTimerSeconds(0)
  }

  async function stopTimer() {
    setTimerRunning(false)
    const hours = Math.round((timerSeconds / 3600) * 100) / 100
    if (hours <= 0) return

    const entry: TimeEntry = {
      id: crypto.randomUUID(),
      date: todayStr(),
      project: timerProject || 'Ej angivet',
      client: timerClient || '',
      hours,
      description: 'Tidtagning',
      billable: true,
      status: 'Utkast',
    }
    const updated = [entry, ...entries]
    setEntries(updated)
    setTimerSeconds(0)
    await saveData(updated)
  }

  function openNew() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(e: TimeEntry) {
    setEditing(e)
    setForm({
      date: e.date,
      project: e.project,
      client: e.client,
      hours: e.hours,
      description: e.description,
      billable: e.billable,
      status: e.status,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: TimeEntry = {
      id: editing?.id ?? crypto.randomUUID(),
      ...form,
      project: form.project.trim(),
      client: form.client.trim(),
      description: form.description.trim(),
    }
    let updated: TimeEntry[]
    if (editing) {
      updated = entries.map((e) => (e.id === editing.id ? item : e))
    } else {
      updated = [item, ...entries]
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveData(updated)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = entries.filter((e) => e.id !== toDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setToDelete(null)
    await saveData(updated)
  }

  async function submitForApproval() {
    const updated = entries.map((e) =>
      e.status === 'Utkast' ? { ...e, status: 'Inskickad' as ApprovalStatus } : e
    )
    setEntries(updated)
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={submitForApproval}>
              Skicka in utkast
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Ny tidsrad
            </Button>
          </div>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="timer" className="space-y-6">
            <TabsList>
              <TabsTrigger value="timer">Tidtagning</TabsTrigger>
              <TabsTrigger value="registreringar">Registreringar</TabsTrigger>
              <TabsTrigger value="per-projekt">Per projekt</TabsTrigger>
            </TabsList>

            <TabsContent value="timer" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Idag" value={fmt(kpis.todayHours)} unit="tim" />
                <KPICard label="Totalt" value={fmt(kpis.totalHours)} unit="tim" />
                <KPICard label="Debiterbara" value={fmt(kpis.billableHours)} unit="tim" />
                <KPICard label="Debiteringsgrad" value={fmtPct(kpis.utilization)} unit="%" />
                <KPICard label="Vantar godkannande" value={String(kpis.pendingApproval)} unit="st" />
              </div>

              {/* Timer */}
              <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Tidtagare
                </h3>
                <div className="text-4xl font-mono font-semibold tracking-wider text-center py-4">
                  {formatTimer(timerSeconds)}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Projekt</Label>
                    <Input value={timerProject} onChange={(e) => setTimerProject(e.target.value)} placeholder="Webbplattform v2" className="h-8" disabled={timerRunning} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Kund</Label>
                    <Input value={timerClient} onChange={(e) => setTimerClient(e.target.value)} placeholder="Acme AB" className="h-8" disabled={timerRunning} />
                  </div>
                </div>
                <div className="flex justify-center">
                  {timerRunning ? (
                    <Button variant="destructive" size="lg" onClick={stopTimer}>
                      <Square className="mr-2 h-4 w-4" /> Stoppa
                    </Button>
                  ) : (
                    <Button size="lg" onClick={startTimer}>
                      <Play className="mr-2 h-4 w-4" /> Starta
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="registreringar" className="space-y-4">
              {entries.length === 0 ? (
                <EmptyModuleState
                  icon={Clock}
                  title="Inga tidsregistreringar"
                  description="Borja registrera tid med tidtagaren eller lagg till manuellt."
                  actionLabel="Ny tidsrad"
                  onAction={openNew}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Projekt</TableHead>
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium text-right">Timmar</TableHead>
                        <TableHead className="font-medium">Debit.</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium">Beskrivning</TableHead>
                        <TableHead className="font-medium text-right">Atgarder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.date}</TableCell>
                          <TableCell className="font-medium">{e.project}</TableCell>
                          <TableCell>{e.client}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(e.hours)}</TableCell>
                          <TableCell>
                            {e.billable ? (
                              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Ja</Badge>
                            ) : (
                              <Badge variant="outline">Nej</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={STATUS_COLORS[e.status]}>{e.status}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{e.description}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(e)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="per-projekt" className="space-y-4">
              {projectSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground">Inga projekt att visa.</p>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Projekt</TableHead>
                        <TableHead className="font-medium">Kund</TableHead>
                        <TableHead className="font-medium text-right">Totalt</TableHead>
                        <TableHead className="font-medium text-right">Debiterbara</TableHead>
                        <TableHead className="font-medium text-right">Andel</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectSummary.map((p) => (
                        <TableRow key={p.project}>
                          <TableCell className="font-medium">{p.project}</TableCell>
                          <TableCell>{p.client}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.hours)} tim</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.billableHours)} tim</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtPct(p.hours > 0 ? (p.billableHours / p.hours) * 100 : 0)}%
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell colSpan={2}>Totalt</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(kpis.totalHours)} tim</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(kpis.billableHours)} tim</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(kpis.utilization)}%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Redigera tidsrad' : 'Ny tidsrad'}</DialogTitle>
            <DialogDescription>{editing ? 'Uppdatera tidsregistreringen.' : 'Registrera tid manuellt.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Datum</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Timmar *</Label><Input type="number" step="0.25" min={0} value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: Number(e.target.value) }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Projekt *</Label><Input value={form.project} onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))} placeholder="Webbplattform v2" /></div>
              <div className="grid gap-2"><Label>Kund</Label><Input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} placeholder="Acme AB" /></div>
            </div>
            <div className="grid gap-2"><Label>Beskrivning</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={form.billable} onCheckedChange={(v) => setForm((f) => ({ ...f, billable: v }))} />
              <Label>Debiterbar</Label>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ApprovalStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.project.trim() || form.hours <= 0}>{editing ? 'Uppdatera' : 'Registrera'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort tidsrad</DialogTitle>
            <DialogDescription>Ar du saker pa att du vill ta bort denna tidsregistrering?</DialogDescription>
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
