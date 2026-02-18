'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Pencil, Trash2, Loader2, Dumbbell, Search } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type SessionStatus = 'bokad' | 'genomford' | 'avbokad' | 'no_show'

interface PtSession {
  id: string
  client_name: string
  trainer_name: string
  date: string
  time: string
  duration_min: number
  package_name: string
  sessions_left: number
  status: SessionStatus
  notes: string
}

const STATUS_LABELS: Record<SessionStatus, string> = { bokad: 'Bokad', genomford: 'Genomförd', avbokad: 'Avbokad', no_show: 'No-show' }
const STATUS_VARIANT: Record<SessionStatus, 'info' | 'success' | 'neutral' | 'danger'> = { bokad: 'info', genomford: 'success', avbokad: 'neutral', no_show: 'danger' }

function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function todayISO(): string { return new Date().toISOString().split('T')[0] }

const DEFAULT_SESSIONS: PtSession[] = [
  { id: '1', client_name: 'Anna Svensson', trainer_name: 'Erik PT', date: todayISO(), time: '09:00', duration_min: 60, package_name: '10-pack', sessions_left: 7, status: 'bokad', notes: '' },
  { id: '2', client_name: 'Maria Holm', trainer_name: 'Erik PT', date: todayISO(), time: '10:30', duration_min: 60, package_name: '5-pack', sessions_left: 3, status: 'bokad', notes: 'Knäproblem' },
]

const EMPTY_FORM = { client_name: '', trainer_name: '', date: '', time: '', duration_min: '60', package_name: '', sessions_left: '', status: 'bokad' as SessionStatus, notes: '' }

export function PtBokningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sessions, setSessions] = useState<PtSession[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<PtSession | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<PtSession | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const saveSessions = useCallback(async (newSessions: PtSession[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'pt_sessions', config_value: newSessions }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'pt_sessions').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setSessions(data.config_value as PtSession[]) }
    else { setSessions(DEFAULT_SESSIONS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'pt_sessions', config_value: DEFAULT_SESSIONS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  const filteredSessions = useMemo(() => {
    let result = sessions
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); result = result.filter((s) => s.client_name.toLowerCase().includes(q) || s.trainer_name.toLowerCase().includes(q)) }
    return result.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
  }, [sessions, searchQuery])

  const stats = useMemo(() => ({ total: sessions.length, upcoming: sessions.filter((s) => s.status === 'bokad').length, completed: sessions.filter((s) => s.status === 'genomford').length }), [sessions])

  function openNew() { setEditingSession(null); setForm({ ...EMPTY_FORM, date: todayISO() }); setDialogOpen(true) }
  function openEdit(s: PtSession) { setEditingSession(s); setForm({ client_name: s.client_name, trainer_name: s.trainer_name, date: s.date, time: s.time, duration_min: String(s.duration_min), package_name: s.package_name, sessions_left: String(s.sessions_left), status: s.status, notes: s.notes }); setDialogOpen(true) }

  async function handleSave() {
    const entry: PtSession = { id: editingSession?.id ?? generateId(), client_name: form.client_name.trim(), trainer_name: form.trainer_name.trim(), date: form.date, time: form.time, duration_min: parseInt(form.duration_min) || 60, package_name: form.package_name.trim(), sessions_left: parseInt(form.sessions_left) || 0, status: form.status, notes: form.notes.trim() }
    const updated = editingSession ? sessions.map((s) => s.id === editingSession.id ? entry : s) : [...sessions, entry]
    setSessions(updated); setDialogOpen(false); await saveSessions(updated)
  }

  function openDeleteConfirmation(s: PtSession) { setSessionToDelete(s); setDeleteDialogOpen(true) }
  async function handleDelete() { if (!sessionToDelete) return; const updated = sessions.filter((s) => s.id !== sessionToDelete.id); setSessions(updated); setDeleteDialogOpen(false); setSessionToDelete(null); await saveSessions(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fitness & Sport" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt PT-pass</Button>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt pass</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.total}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Kommande</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.upcoming}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Genomförda</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.completed}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök klient eller tränare..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>
            {filteredSessions.length === 0 ? (
              <EmptyModuleState icon={Dumbbell} title="Inga PT-pass" description="Skapa ett nytt PT-pass för att hantera bokningar och paket." actionLabel="Nytt PT-pass" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Klient</TableHead><TableHead className="font-medium">Tränare</TableHead><TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium">Tid</TableHead><TableHead className="font-medium">Paket</TableHead><TableHead className="font-medium text-right">Kvar</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredSessions.map((s) => (
                      <TableRow key={s.id}><TableCell className="font-medium">{s.client_name}</TableCell><TableCell>{s.trainer_name}</TableCell><TableCell>{s.date}</TableCell><TableCell>{s.time}</TableCell><TableCell><Badge variant="outline">{s.package_name || '-'}</Badge></TableCell><TableCell className="text-right tabular-nums">{s.sessions_left}</TableCell><TableCell><StatusBadge label={STATUS_LABELS[s.status]} variant={STATUS_VARIANT[s.status]} /></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(s)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingSession ? 'Redigera PT-pass' : 'Nytt PT-pass'}</DialogTitle><DialogDescription>{editingSession ? 'Uppdatera passets uppgifter.' : 'Boka ett nytt PT-pass.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Klient *</Label><Input value={form.client_name} onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))} /></div><div className="grid gap-2"><Label>Tränare *</Label><Input value={form.trainer_name} onChange={(e) => setForm((f) => ({ ...f, trainer_name: e.target.value }))} /></div></div>
            <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Tid *</Label><Input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} /></div><div className="grid gap-2"><Label>Längd (min)</Label><Input type="number" min={15} step={15} value={form.duration_min} onChange={(e) => setForm((f) => ({ ...f, duration_min: e.target.value }))} /></div></div>
            <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Paketnamn</Label><Input value={form.package_name} onChange={(e) => setForm((f) => ({ ...f, package_name: e.target.value }))} placeholder="10-pack" /></div><div className="grid gap-2"><Label>Pass kvar</Label><Input type="number" min={0} value={form.sessions_left} onChange={(e) => setForm((f) => ({ ...f, sessions_left: e.target.value }))} /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(val) => setForm((f) => ({ ...f, status: val as SessionStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bokad">Bokad</SelectItem><SelectItem value="genomford">Genomförd</SelectItem><SelectItem value="avbokad">Avbokad</SelectItem><SelectItem value="no_show">No-show</SelectItem></SelectContent></Select></div></div>
            <div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.client_name.trim() || !form.trainer_name.trim() || !form.date}>{editingSession ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort PT-pass</DialogTitle><DialogDescription>Är du säker på att du vill ta bort passet för <span className="font-semibold">{sessionToDelete?.client_name}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent>
      </Dialog>
    </>
  )
}
