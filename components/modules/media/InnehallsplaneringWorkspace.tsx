'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Loader2, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type ContentStatus = 'Idé' | 'Planerad' | 'Produktion' | 'Granskning' | 'Publicerad' | 'Arkiverad'
type ContentChannel = 'Webb' | 'Sociala medier' | 'Print' | 'Video' | 'Podcast' | 'Nyhetsbrev' | 'Övrigt'
interface ContentItem { id: string; title: string; channel: ContentChannel; status: ContentStatus; publishDate: string; deadline: string; assignee: string; client: string; description: string }

const STATUSES: ContentStatus[] = ['Idé', 'Planerad', 'Produktion', 'Granskning', 'Publicerad', 'Arkiverad']
const CHANNELS: ContentChannel[] = ['Webb', 'Sociala medier', 'Print', 'Video', 'Podcast', 'Nyhetsbrev', 'Övrigt']
const STATUS_V: Record<ContentStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { 'Idé': 'neutral', 'Planerad': 'info', 'Produktion': 'warning', 'Granskning': 'info', 'Publicerad': 'success', 'Arkiverad': 'neutral' }
const CHANNEL_COLORS: Record<ContentChannel, string> = { 'Webb': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', 'Sociala medier': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400', 'Print': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', 'Video': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', 'Podcast': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', 'Nyhetsbrev': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', 'Övrigt': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400' }
const EMPTY_FORM = { title: '', channel: 'Webb' as ContentChannel, status: 'Idé' as ContentStatus, publishDate: '', deadline: '', assignee: '', client: '', description: '' }

export function InnehallsplaneringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<ContentItem[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ContentItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [filterChannel, setFilterChannel] = useState<ContentChannel | 'all'>('all')

  const saveData = useCallback(async (data: ContentItem[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'content_plan', config_value: data }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'content_plan').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setItems(data.config_value as ContentItem[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const activeItems = useMemo(() => items.filter(i => i.status !== 'Arkiverad' && i.status !== 'Publicerad'), [items])
  const publishedCount = useMemo(() => items.filter(i => i.status === 'Publicerad').length, [items])
  const overdueCount = useMemo(() => { const today = new Date().toISOString().split('T')[0]; return items.filter(i => i.deadline && i.deadline < today && i.status !== 'Publicerad' && i.status !== 'Arkiverad').length }, [items])
  const channelCounts = useMemo(() => { const c: Record<string, number> = {}; CHANNELS.forEach(ch => { c[ch] = items.filter(i => i.channel === ch && i.status !== 'Arkiverad').length }); return c }, [items])

  const filtered = useMemo(() => { let r = items.filter(i => i.status !== 'Arkiverad'); if (filterChannel !== 'all') r = r.filter(i => i.channel === filterChannel); return r.sort((a, b) => (a.publishDate || a.deadline || '9999').localeCompare(b.publishDate || b.deadline || '9999')) }, [items, filterChannel])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(item: ContentItem) { setEditing(item); setForm({ title: item.title, channel: item.channel, status: item.status, publishDate: item.publishDate, deadline: item.deadline, assignee: item.assignee, client: item.client, description: item.description }); setDialogOpen(true) }
  async function handleSave() { const entry: ContentItem = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? items.map(i => i.id === editing.id ? entry : i) : [...items, entry]; setItems(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = items.filter(i => i.id !== id); setItems(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt innehåll</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Aktiva innehåll" value={activeItems.length} />
              <KPICard label="Publicerade" value={publishedCount} />
              <KPICard label="Försenade" value={overdueCount} trend={overdueCount > 0 ? 'down' : 'neutral'} />
              <KPICard label="Totalt" value={items.length} />
            </div>

            <Tabs defaultValue="kalender" className="space-y-4">
              <TabsList>
                <TabsTrigger value="kalender">Kalender</TabsTrigger>
                <TabsTrigger value="kanaler">Per kanal</TabsTrigger>
              </TabsList>

              <TabsContent value="kalender" className="space-y-4">
                <div className="flex items-center gap-3">
                  <Select value={filterChannel} onValueChange={v => setFilterChannel(v as ContentChannel | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera kanal" /></SelectTrigger><SelectContent><SelectItem value="all">Alla kanaler</SelectItem>{CHANNELS.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}</SelectContent></Select>
                </div>
                {filtered.length === 0 ? <EmptyModuleState icon={CalendarDays} title="Inget innehåll" description="Planera innehåll med kanal, status, deadline och publiceringsdag." actionLabel="Nytt innehåll" onAction={openNew} /> : (
                  <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Titel</TableHead><TableHead className="font-medium">Kanal</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium">Publicering</TableHead><TableHead className="font-medium">Deadline</TableHead><TableHead className="font-medium">Ansvarig</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                    <TableBody>{filtered.map(item => {
                      const today = new Date().toISOString().split('T')[0]
                      const overdue = item.deadline && item.deadline < today && item.status !== 'Publicerad'
                      return (
                        <TableRow key={item.id} className={cn(overdue && 'bg-red-500/5')}>
                          <TableCell className="font-medium">{item.title}</TableCell>
                          <TableCell><span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', CHANNEL_COLORS[item.channel])}>{item.channel}</span></TableCell>
                          <TableCell><StatusBadge label={item.status} variant={STATUS_V[item.status]} /></TableCell>
                          <TableCell>{item.publishDate || '-'}</TableCell>
                          <TableCell className={cn(overdue && 'text-red-600 font-medium')}>{item.deadline || '-'}</TableCell>
                          <TableCell>{item.assignee || '-'}</TableCell>
                          <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                        </TableRow>
                      )
                    })}</TableBody></Table></div>
                )}
              </TabsContent>

              <TabsContent value="kanaler">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {CHANNELS.filter(ch => channelCounts[ch] > 0).map(ch => (
                    <Card key={ch} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setFilterChannel(ch) }}>
                      <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{ch}</CardTitle></CardHeader>
                      <CardContent><span className="text-2xl font-semibold">{channelCounts[ch]}</span><span className="text-sm text-muted-foreground ml-1.5">innehåll</span></CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Nytt innehåll'}</DialogTitle><DialogDescription>Planera innehåll för publicering.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Titel *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Bloggpost om..." /></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Kanal</Label><Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v as ContentChannel }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map(ch => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as ContentStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Publiceringsdag</Label><Input type="date" value={form.publishDate} onChange={e => setForm(f => ({ ...f, publishDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} /></div><div className="grid gap-2"><Label>Ansvarig</Label><Input value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Kund</Label><Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} /></div><div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.title.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
