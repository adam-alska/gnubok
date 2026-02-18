'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
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
import { Plus, Pencil, Trash2, Loader2, MessageSquare, Send, Mail, Bell } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type Channel = 'Push' | 'E-post' | 'SMS' | 'Nyhetsflöde'
type MessageStatus = 'Utkast' | 'Skickat' | 'Schemalagt'

interface Message {
  id: string
  title: string
  content: string
  channel: Channel
  targetGroup: string
  status: MessageStatus
  scheduledDate: string
  createdAt: string
}

const CHANNELS: Channel[] = ['Push', 'E-post', 'SMS', 'Nyhetsflöde']
const MSG_STATUSES: MessageStatus[] = ['Utkast', 'Skickat', 'Schemalagt']
const STATUS_VARIANT: Record<MessageStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  'Utkast': 'neutral', 'Skickat': 'success', 'Schemalagt': 'info',
}
const CHANNEL_ICONS: Record<Channel, typeof Mail> = { 'Push': Bell, 'E-post': Mail, 'SMS': MessageSquare, 'Nyhetsflöde': Send }

const EMPTY_FORM = { title: '', content: '', channel: 'E-post' as Channel, targetGroup: '', status: 'Utkast' as MessageStatus, scheduledDate: '' }

export function ForaldrakommunikationWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Message | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveMessages = useCallback(async (items: Message[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'messages', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'messages').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setMessages(data.config_value as Message[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(m: Message) {
    setEditing(m)
    setForm({ title: m.title, content: m.content, channel: m.channel, targetGroup: m.targetGroup, status: m.status, scheduledDate: m.scheduledDate })
    setDialogOpen(true)
  }

  async function handleSave() {
    const entry: Message = { id: editing?.id ?? crypto.randomUUID(), ...form, createdAt: editing?.createdAt ?? new Date().toISOString() }
    const updated = editing ? messages.map(m => m.id === editing.id ? entry : m) : [...messages, entry]
    setMessages(updated); setDialogOpen(false); await saveMessages(updated)
  }

  async function handleDelete(id: string) {
    const updated = messages.filter(m => m.id !== id)
    setMessages(updated); await saveMessages(updated)
  }

  async function handleSend(id: string) {
    const updated = messages.map(m => m.id === id ? { ...m, status: 'Skickat' as MessageStatus } : m)
    setMessages(updated); await saveMessages(updated)
  }

  const drafts = useMemo(() => messages.filter(m => m.status === 'Utkast'), [messages])
  const sent = useMemo(() => messages.filter(m => m.status === 'Skickat'), [messages])
  const scheduled = useMemo(() => messages.filter(m => m.status === 'Schemalagt'), [messages])

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Utbildning & Förskola" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt meddelande</Button>}>
        <Tabs defaultValue="alla" className="space-y-6">
          <TabsList>
            <TabsTrigger value="alla">Alla ({messages.length})</TabsTrigger>
            <TabsTrigger value="utkast">Utkast ({drafts.length})</TabsTrigger>
            <TabsTrigger value="skickade">Skickade ({sent.length})</TabsTrigger>
            <TabsTrigger value="schemalagda">Schemalagda ({scheduled.length})</TabsTrigger>
          </TabsList>

          {['alla', 'utkast', 'skickade', 'schemalagda'].map(tab => {
            const list = tab === 'alla' ? messages : tab === 'utkast' ? drafts : tab === 'skickade' ? sent : scheduled
            return (
              <TabsContent key={tab} value={tab} className="space-y-4">
                {loading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : list.length === 0 ? (
                  <EmptyModuleState icon={MessageSquare} title="Inga meddelanden" description="Skapa meddelanden för att kommunicera med föräldrar via push, e-post, SMS eller nyhetsflöde." actionLabel="Nytt meddelande" onAction={openNew} />
                ) : (
                  <div className="space-y-3">
                    {list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(m => {
                      const Icon = CHANNEL_ICONS[m.channel]
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{m.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{m.targetGroup} - {m.channel}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <StatusBadge label={m.status} variant={STATUS_VARIANT[m.status]} />
                            {m.status === 'Utkast' && <Button variant="outline" size="sm" onClick={() => handleSend(m.id)}><Send className="mr-1.5 h-3.5 w-3.5" />Skicka</Button>}
                            <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            )
          })}
        </Tabs>
        {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Redigera meddelande' : 'Nytt meddelande'}</DialogTitle><DialogDescription>Skriv och skicka meddelande till föräldrar.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Rubrik *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Viktigt meddelande" /></div>
            <div className="grid gap-2"><Label>Meddelande *</Label><Input value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Skriv ditt meddelande..." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Kanal</Label>
                <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v as Channel }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="grid gap-2"><Label>Målgrupp</Label><Input value={form.targetGroup} onChange={e => setForm(f => ({ ...f, targetGroup: e.target.value }))} placeholder="Alla, Klass 3A..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as MessageStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MSG_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              </div>
              {form.status === 'Schemalagt' && <div className="grid gap-2"><Label>Schemalagd tid</Label><Input type="datetime-local" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} /></div>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.title.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
