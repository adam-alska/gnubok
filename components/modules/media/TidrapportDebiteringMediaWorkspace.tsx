'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Clock, Play, Square, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type EntryStatus = 'Ej fakturerad' | 'Fakturerad' | 'Ej debiterbar'
interface TimeEntry { id: string; date: string; client: string; project: string; description: string; hours: number; hourlyRate: number; amount: number; status: EntryStatus; worker: string }

const ENTRY_STATUSES: EntryStatus[] = ['Ej fakturerad', 'Fakturerad', 'Ej debiterbar']
const STATUS_V: Record<EntryStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { 'Ej fakturerad': 'warning', 'Fakturerad': 'success', 'Ej debiterbar': 'neutral' }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtH(n: number): string { return n.toFixed(1) }
const EMPTY_FORM = { date: '', client: '', project: '', description: '', hours: 0, hourlyRate: 0, status: 'Ej fakturerad' as EntryStatus, worker: '' }

export function TidrapportDebiteringMediaWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerClient, setTimerClient] = useState('')
  const [timerProject, setTimerProject] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const saveData = useCallback(async (items: TimeEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'time_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'time_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as TimeEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  // Timer logic
  function startTimer() { setTimerRunning(true); setTimerSeconds(0); timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000) }
  function stopTimer() { setTimerRunning(false); if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }; const hours = Math.round(timerSeconds / 36) / 100; setForm(f => ({ ...f, hours, date: new Date().toISOString().split('T')[0], client: timerClient, project: timerProject })); setEditing(null); setDialogOpen(true) }
  useEffect(() => { return () => { if (timerRef.current) clearInterval(timerRef.current) } }, [])
  function formatTimer(s: number): string { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60; return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` }

  const totalHours = useMemo(() => entries.reduce((s, e) => s + e.hours, 0), [entries])
  const totalBilled = useMemo(() => entries.filter(e => e.status === 'Fakturerad').reduce((s, e) => s + e.amount, 0), [entries])
  const unbilledAmount = useMemo(() => entries.filter(e => e.status === 'Ej fakturerad').reduce((s, e) => s + e.amount, 0), [entries])
  const billableRatio = useMemo(() => { const billable = entries.filter(e => e.status !== 'Ej debiterbar').reduce((s, e) => s + e.hours, 0); return totalHours > 0 ? billable / totalHours : 0 }, [entries, totalHours])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] }); setDialogOpen(true) }
  function openEdit(e: TimeEntry) { setEditing(e); setForm({ date: e.date, client: e.client, project: e.project, description: e.description, hours: e.hours, hourlyRate: e.hourlyRate, status: e.status, worker: e.worker }); setDialogOpen(true) }
  async function handleSave() { const amount = Math.round(form.hours * form.hourlyRate); const entry: TimeEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, amount }; const updated = editing ? entries.map(e => e.id === editing.id ? entry : e) : [...entries, entry]; setEntries(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = entries.filter(e => e.id !== id); setEntries(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<div className="flex items-center gap-2"><Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny tid</Button></div>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            {/* Timer */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <Timer className="h-5 w-5 text-muted-foreground" />
                  <span className={cn('font-mono text-2xl tabular-nums', timerRunning && 'text-emerald-600')}>{formatTimer(timerSeconds)}</span>
                </div>
                {!timerRunning ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input placeholder="Kund" value={timerClient} onChange={e => setTimerClient(e.target.value)} className="max-w-[150px]" />
                    <Input placeholder="Projekt" value={timerProject} onChange={e => setTimerProject(e.target.value)} className="max-w-[150px]" />
                    <Button onClick={startTimer} size="sm" className="gap-1.5"><Play className="h-3.5 w-3.5" />Starta</Button>
                  </div>
                ) : (
                  <Button onClick={stopTimer} size="sm" variant="destructive" className="gap-1.5"><Square className="h-3.5 w-3.5" />Stoppa & registrera</Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Totalt timmar" value={fmtH(totalHours)} unit="tim" />
              <KPICard label="Fakturerat" value={fmt(totalBilled)} unit="kr" />
              <KPICard label="Ej fakturerat" value={fmt(unbilledAmount)} unit="kr" trend={unbilledAmount > 0 ? 'neutral' : 'up'} />
              <KPICard label="Debiterbar andel" value={`${Math.round(billableRatio * 100)}%`} trend={billableRatio >= 0.7 ? 'up' : 'down'} trendLabel={billableRatio < 0.7 ? 'Under 70%' : undefined} />
            </div>

            <Tabs defaultValue="tidrapport" className="space-y-4">
              <TabsList><TabsTrigger value="tidrapport">Tidrapport</TabsTrigger><TabsTrigger value="per-kund">Per kund</TabsTrigger></TabsList>

              <TabsContent value="tidrapport">
                {entries.length === 0 ? <EmptyModuleState icon={Clock} title="Inga tidposter" description="Registrera tid per kund och projekt. Använd timern eller lägg till manuellt." actionLabel="Ny tid" onAction={openNew} /> : (
                  <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium">Projekt</TableHead><TableHead className="font-medium">Beskrivning</TableHead><TableHead className="font-medium text-right">Timmar</TableHead><TableHead className="font-medium text-right">kr/tim</TableHead><TableHead className="font-medium text-right">Belopp</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                    <TableBody>{entries.sort((a, b) => b.date.localeCompare(a.date)).map(e => (
                      <TableRow key={e.id}><TableCell>{e.date}</TableCell><TableCell className="font-medium">{e.client}</TableCell><TableCell>{e.project}</TableCell><TableCell className="text-muted-foreground max-w-[200px] truncate">{e.description}</TableCell><TableCell className="text-right tabular-nums">{fmtH(e.hours)}</TableCell><TableCell className="text-right tabular-nums">{fmt(e.hourlyRate)}</TableCell><TableCell className="text-right tabular-nums font-medium">{fmt(e.amount)} kr</TableCell><TableCell><StatusBadge label={e.status} variant={STATUS_V[e.status]} /></TableCell>
                        <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                    ))}</TableBody></Table></div>
                )}
              </TabsContent>

              <TabsContent value="per-kund">
                {entries.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Inga tidposter registrerade.</p> : (() => {
                  const byClient: Record<string, { hours: number; amount: number; unbilled: number; projects: Set<string> }> = {}
                  entries.forEach(e => {
                    if (!byClient[e.client]) byClient[e.client] = { hours: 0, amount: 0, unbilled: 0, projects: new Set() }
                    byClient[e.client].hours += e.hours
                    byClient[e.client].amount += e.amount
                    if (e.status === 'Ej fakturerad') byClient[e.client].unbilled += e.amount
                    if (e.project) byClient[e.client].projects.add(e.project)
                  })
                  return (
                    <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium text-right">Timmar</TableHead><TableHead className="font-medium text-right">Totalbelopp</TableHead><TableHead className="font-medium text-right">Ej fakturerat</TableHead><TableHead className="font-medium text-right">Projekt</TableHead><TableHead className="font-medium text-right">Eff. timpris</TableHead></TableRow></TableHeader>
                      <TableBody>{Object.entries(byClient).sort((a, b) => b[1].amount - a[1].amount).map(([client, data]) => (
                        <TableRow key={client}><TableCell className="font-medium">{client || 'Okänd'}</TableCell><TableCell className="text-right tabular-nums">{fmtH(data.hours)}</TableCell><TableCell className="text-right tabular-nums">{fmt(data.amount)} kr</TableCell><TableCell className={cn('text-right tabular-nums', data.unbilled > 0 && 'text-amber-600')}>{fmt(data.unbilled)} kr</TableCell><TableCell className="text-right tabular-nums">{data.projects.size}</TableCell><TableCell className="text-right tabular-nums">{data.hours > 0 ? fmt(data.amount / data.hours) : '-'} kr</TableCell></TableRow>
                      ))}</TableBody></Table></div>
                  )
                })()}
              </TabsContent>
            </Tabs>

            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny tidpost'}</DialogTitle><DialogDescription>Registrera tid för debitering.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Kund *</Label><Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} /></div><div className="grid gap-2"><Label>Projekt</Label><Input value={form.project} onChange={e => setForm(f => ({ ...f, project: e.target.value }))} /></div></div>
          <div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Timmar *</Label><Input type="number" step="0.25" value={form.hours || ''} onChange={e => setForm(f => ({ ...f, hours: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Timpris (kr)</Label><Input type="number" value={form.hourlyRate || ''} onChange={e => setForm(f => ({ ...f, hourlyRate: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as EntryStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ENTRY_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Medarbetare</Label><Input value={form.worker} onChange={e => setForm(f => ({ ...f, worker: e.target.value }))} /></div><div className="rounded-lg bg-muted/30 p-3 flex items-center"><p className="text-xs text-muted-foreground">Belopp: <strong>{fmt(Math.round(form.hours * form.hourlyRate))} kr</strong></p></div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.date || !form.client.trim() || form.hours <= 0}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
