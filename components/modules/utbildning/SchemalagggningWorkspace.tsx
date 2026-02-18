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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, CalendarDays, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ScheduleEntry {
  id: string
  className: string
  subject: string
  teacher: string
  room: string
  dayOfWeek: number
  timeStart: string
  timeEnd: string
}

const WEEKDAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag']
const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']

const EMPTY_FORM = { className: '', subject: '', teacher: '', room: '', dayOfWeek: 0, timeStart: '08:00', timeEnd: '09:00' }

export function SchemalagggningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduleEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [filterClass, setFilterClass] = useState<string>('all')

  const saveEntries = useCallback(async (items: ScheduleEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'schedule', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'schedule').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as ScheduleEntry[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const classes = useMemo(() => [...new Set(entries.map(e => e.className))].sort(), [entries])
  const filteredEntries = useMemo(() => filterClass === 'all' ? entries : entries.filter(e => e.className === filterClass), [entries, filterClass])

  const conflicts = useMemo(() => {
    const issues: string[] = []
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j]
        if (a.dayOfWeek === b.dayOfWeek && a.timeStart < b.timeEnd && b.timeStart < a.timeEnd) {
          if (a.teacher === b.teacher) issues.push(`Lärare ${a.teacher} dubbelbokning ${WEEKDAYS[a.dayOfWeek]} ${a.timeStart}`)
          if (a.room === b.room) issues.push(`Sal ${a.room} dubbelbokning ${WEEKDAYS[a.dayOfWeek]} ${a.timeStart}`)
        }
      }
    }
    return issues
  }, [entries])

  function openNew(day?: number) { setEditing(null); setForm({ ...EMPTY_FORM, dayOfWeek: day ?? 0 }); setDialogOpen(true) }
  function openEdit(e: ScheduleEntry) { setEditing(e); setForm({ className: e.className, subject: e.subject, teacher: e.teacher, room: e.room, dayOfWeek: e.dayOfWeek, timeStart: e.timeStart, timeEnd: e.timeEnd }); setDialogOpen(true) }

  async function handleSave() {
    const entry: ScheduleEntry = { id: editing?.id ?? crypto.randomUUID(), ...form }
    const updated = editing ? entries.map(e => e.id === editing.id ? entry : e) : [...entries, entry]
    setEntries(updated); setDialogOpen(false); await saveEntries(updated)
  }

  async function handleDelete(id: string) {
    const updated = entries.filter(e => e.id !== id)
    setEntries(updated); await saveEntries(updated)
  }

  function getEntriesForSlot(day: number, time: string) {
    return filteredEntries.filter(e => e.dayOfWeek === day && e.timeStart <= time && e.timeEnd > time)
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Utbildning & Förskola" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={() => openNew()}><Plus className="mr-2 h-4 w-4" />Ny lektion</Button>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            {conflicts.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-700"><AlertTriangle className="h-4 w-4" />Konflikter upptäckta</div>
                {conflicts.map((c, i) => <p key={i} className="text-xs text-amber-600">{c}</p>)}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Select value={filterClass} onValueChange={setFilterClass}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrera klass" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla klasser</SelectItem>
                  {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {entries.length === 0 ? (
              <EmptyModuleState icon={CalendarDays} title="Inget schema" description="Lägg till lektioner för att bygga upp schemat med klass-, lärare- och salvy." actionLabel="Ny lektion" onAction={() => openNew()} />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium min-w-[60px]">Tid</th>
                      {WEEKDAYS.map((d, i) => <th key={i} className="px-2 py-2 text-center font-medium min-w-[150px]">{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {TIME_SLOTS.map(time => (
                      <tr key={time} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-muted-foreground">{time}</td>
                        {WEEKDAYS.map((_, day) => {
                          const slotEntries = getEntriesForSlot(day, time)
                          return (
                            <td key={day} className="px-1 py-1 align-top cursor-pointer hover:bg-muted/30" onClick={() => { if (slotEntries.length === 0) openNew(day) }}>
                              {slotEntries.length === 0 ? (
                                <div className="flex items-center justify-center h-10 text-muted-foreground/30"><Plus className="h-3.5 w-3.5" /></div>
                              ) : (
                                <div className="space-y-1">{slotEntries.map(e => (
                                  <button key={e.id} className="w-full rounded px-2 py-1 text-left text-xs bg-secondary/60 hover:bg-secondary" onClick={(ev) => { ev.stopPropagation(); openEdit(e) }}>
                                    <div className="font-medium">{e.subject}</div>
                                    <div className="text-muted-foreground">{e.className} - {e.room}</div>
                                  </button>
                                ))}</div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Redigera lektion' : 'Ny lektion'}</DialogTitle><DialogDescription>Fyll i lektionens uppgifter.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Klass *</Label><Input value={form.className} onChange={e => setForm(f => ({ ...f, className: e.target.value }))} placeholder="3A" /></div>
              <div className="grid gap-2"><Label>Ämne *</Label><Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Matematik" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Lärare *</Label><Input value={form.teacher} onChange={e => setForm(f => ({ ...f, teacher: e.target.value }))} placeholder="Anna Svensson" /></div>
              <div className="grid gap-2"><Label>Sal *</Label><Input value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))} placeholder="A101" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Dag *</Label>
                <Select value={String(form.dayOfWeek)} onValueChange={v => setForm(f => ({ ...f, dayOfWeek: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Start</Label><Input type="time" value={form.timeStart} onChange={e => setForm(f => ({ ...f, timeStart: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Slut</Label><Input type="time" value={form.timeEnd} onChange={e => setForm(f => ({ ...f, timeEnd: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            {editing && <Button variant="destructive" size="sm" onClick={() => { handleDelete(editing.id); setDialogOpen(false) }} className="mr-auto"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Ta bort</Button>}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.className.trim() || !form.subject.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
