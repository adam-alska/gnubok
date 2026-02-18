'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
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
  Mail,
  Send,
  MessageSquare,
  Search,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type MessageType = 'bekraftelse' | 'incheckning' | 'utcheckning' | 'recensionspaminnelse' | 'kampanj' | 'ovrigt'

interface MessageTemplate {
  id: string
  type: MessageType
  name: string
  subject: string
  body: string
  active: boolean
}

interface SendLogEntry {
  id: string
  templateId: string
  templateName: string
  recipient: string
  guestName: string
  sentAt: string
  type: MessageType
}

const MESSAGE_TYPES: { value: MessageType; label: string }[] = [
  { value: 'bekraftelse', label: 'Bokningsbekraftelse' },
  { value: 'incheckning', label: 'Incheckningsinformation' },
  { value: 'utcheckning', label: 'Utcheckningspaminnelse' },
  { value: 'recensionspaminnelse', label: 'Recensionspaminnelse' },
  { value: 'kampanj', label: 'Kampanj / Erbjudande' },
  { value: 'ovrigt', label: 'Ovrigt' },
]

const TYPE_COLORS: Record<MessageType, string> = {
  bekraftelse: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  incheckning: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  utcheckning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  recensionspaminnelse: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  kampanj: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  ovrigt: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: '1',
    type: 'bekraftelse',
    name: 'Bokningsbekraftelse',
    subject: 'Bokningsbekraftelse - {{hotelName}}',
    body: 'Hej {{guestName}},\n\nTack for din bokning!\n\nIncheckning: {{checkinDate}}\nUtcheckning: {{checkoutDate}}\nRumstyp: {{roomType}}\n\nVi ser fram emot ditt besok!\n\nMed vanlig halsning,\n{{hotelName}}',
    active: true,
  },
  {
    id: '2',
    type: 'incheckning',
    name: 'Incheckningsinformation',
    subject: 'Valkommeninformation - {{hotelName}}',
    body: 'Hej {{guestName}},\n\nValkommen till {{hotelName}}!\n\nIncheckning sker fran kl 15:00.\nWiFi: {{wifiCode}}\nFrukost serveras kl 07:00-10:00.\n\nVid fragor, kontakta receptionen.\n\nValkommen!',
    active: true,
  },
  {
    id: '3',
    type: 'utcheckning',
    name: 'Utcheckningspaminnelse',
    subject: 'Paminnelse om utcheckning - {{hotelName}}',
    body: 'Hej {{guestName}},\n\nVi papminner om att utcheckning sker senast kl 11:00.\n\nVi hoppas att du trivdes hos oss!\n\nMed vanlig halsning,\n{{hotelName}}',
    active: true,
  },
  {
    id: '4',
    type: 'recensionspaminnelse',
    name: 'Recensionspaminnelse',
    subject: 'Hur var din vistelse pa {{hotelName}}?',
    body: 'Hej {{guestName}},\n\nTack for att du bodde hos oss! Vi hade uppskattat om du tog nagon minut att bedomma din vistelse.\n\nDin feedback ar vardefull for oss.\n\nMed vanlig halsning,\n{{hotelName}}',
    active: true,
  },
]

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function GastkommunikationWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [sendLog, setSendLog] = useState<SendLogEntry[]>([])

  // Template dialog
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState({ type: 'bekraftelse' as MessageType, name: '', subject: '', body: '', active: true })

  // Send dialog
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [sendTemplateId, setSendTemplateId] = useState('')
  const [sendForm, setSendForm] = useState({ guestName: '', recipient: '' })

  // Delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<MessageTemplate | null>(null)

  // Search
  const [logSearch, setLogSearch] = useState('')

  const saveData = useCallback(async (newTemplates: MessageTemplate[], newLog: SendLogEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await Promise.all([
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'templates', config_value: newTemplates },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'send_log', config_value: newLog },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
    ])
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: rows } = await supabase
      .from('module_configs')
      .select('config_key, config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .in('config_key', ['templates', 'send_log'])

    let loadedTemplates = DEFAULT_TEMPLATES
    let loadedLog: SendLogEntry[] = []

    for (const row of rows ?? []) {
      if (row.config_key === 'templates' && Array.isArray(row.config_value) && row.config_value.length > 0) {
        loadedTemplates = row.config_value as MessageTemplate[]
      }
      if (row.config_key === 'send_log' && Array.isArray(row.config_value)) {
        loadedLog = row.config_value as SendLogEntry[]
      }
    }

    setTemplates(loadedTemplates)
    setSendLog(loadedLog)

    if (!(rows ?? []).find(r => r.config_key === 'templates')) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'templates', config_value: DEFAULT_TEMPLATES },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredLog = useMemo(() => {
    if (!logSearch.trim()) return [...sendLog].sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    const q = logSearch.toLowerCase()
    return sendLog
      .filter(l => l.guestName.toLowerCase().includes(q) || l.recipient.toLowerCase().includes(q) || l.templateName.toLowerCase().includes(q))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  }, [sendLog, logSearch])

  // Template CRUD
  function openNewTemplate() {
    setEditingTemplate(null)
    setTemplateForm({ type: 'bekraftelse', name: '', subject: '', body: '', active: true })
    setTemplateDialogOpen(true)
  }

  function openEditTemplate(template: MessageTemplate) {
    setEditingTemplate(template)
    setTemplateForm({ type: template.type, name: template.name, subject: template.subject, body: template.body, active: template.active })
    setTemplateDialogOpen(true)
  }

  async function handleSaveTemplate() {
    const item: MessageTemplate = {
      id: editingTemplate?.id ?? generateId(),
      type: templateForm.type,
      name: templateForm.name.trim(),
      subject: templateForm.subject.trim(),
      body: templateForm.body.trim(),
      active: templateForm.active,
    }
    let updated: MessageTemplate[]
    if (editingTemplate) {
      updated = templates.map(t => t.id === editingTemplate.id ? item : t)
    } else {
      updated = [...templates, item]
    }
    setTemplates(updated)
    setTemplateDialogOpen(false)
    await saveData(updated, sendLog)
  }

  async function handleDeleteTemplate() {
    if (!templateToDelete) return
    const updated = templates.filter(t => t.id !== templateToDelete.id)
    setTemplates(updated)
    setDeleteDialogOpen(false)
    setTemplateToDelete(null)
    await saveData(updated, sendLog)
  }

  async function toggleTemplateActive(id: string) {
    const updated = templates.map(t => t.id === id ? { ...t, active: !t.active } : t)
    setTemplates(updated)
    await saveData(updated, sendLog)
  }

  // Send
  function openSendDialog(templateId: string) {
    setSendTemplateId(templateId)
    setSendForm({ guestName: '', recipient: '' })
    setSendDialogOpen(true)
  }

  async function handleSend() {
    const template = templates.find(t => t.id === sendTemplateId)
    if (!template) return

    const entry: SendLogEntry = {
      id: generateId(),
      templateId: template.id,
      templateName: template.name,
      recipient: sendForm.recipient.trim(),
      guestName: sendForm.guestName.trim(),
      sentAt: new Date().toISOString(),
      type: template.type,
    }

    const updatedLog = [...sendLog, entry]
    setSendLog(updatedLog)
    setSendDialogOpen(false)
    await saveData(templates, updatedLog)
  }

  async function handleDeleteLogEntry(id: string) {
    const updated = sendLog.filter(l => l.id !== id)
    setSendLog(updated)
    await saveData(templates, updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewTemplate}>
            <Plus className="mr-2 h-4 w-4" />
            Ny mall
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="mallar" className="space-y-6">
            <TabsList>
              <TabsTrigger value="mallar">Meddelandemallar</TabsTrigger>
              <TabsTrigger value="logg">Utskickslogg</TabsTrigger>
            </TabsList>

            <TabsContent value="mallar" className="space-y-6">
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              {templates.length === 0 ? (
                <EmptyModuleState icon={MessageSquare} title="Inga mallar" description="Skapa meddelandemallar for gastkommunikation." actionLabel="Ny mall" onAction={openNewTemplate} />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {templates.map(template => (
                    <Card key={template.id} className={!template.active ? 'opacity-60' : ''}>
                      <CardHeader className="flex flex-row items-start justify-between pb-2">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{template.name}</CardTitle>
                          <Badge variant="secondary" className={TYPE_COLORS[template.type]}>
                            {MESSAGE_TYPES.find(t => t.value === template.type)?.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openSendDialog(template.id)} title="Skicka" disabled={!template.active}>
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditTemplate(template)} title="Redigera">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setTemplateToDelete(template); setDeleteDialogOpen(true) }} title="Ta bort">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm font-medium">{template.subject}</p>
                        <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-line">{template.body}</p>
                        <div className="flex items-center justify-between pt-2">
                          <Badge variant={template.active ? 'default' : 'outline'} className="text-xs cursor-pointer" onClick={() => toggleTemplateActive(template.id)}>
                            {template.active ? 'Aktiv' : 'Inaktiv'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="logg" className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Sok i loggen..." value={logSearch} onChange={e => setLogSearch(e.target.value)} className="pl-9" />
                </div>
                <span className="text-sm text-muted-foreground">{sendLog.length} utskick totalt</span>
              </div>
              {filteredLog.length === 0 ? (
                <EmptyModuleState icon={Mail} title="Inga utskick" description="Skicka meddelanden till gaster for att se historik har." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Mall</TableHead>
                        <TableHead className="font-medium">Typ</TableHead>
                        <TableHead className="font-medium">Gast</TableHead>
                        <TableHead className="font-medium">Mottagare</TableHead>
                        <TableHead className="font-medium text-right">Atgarder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLog.map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-sm">{new Date(entry.sentAt).toLocaleString('sv-SE')}</TableCell>
                          <TableCell className="font-medium">{entry.templateName}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={TYPE_COLORS[entry.type]}>
                              {MESSAGE_TYPES.find(t => t.value === entry.type)?.label}
                            </Badge>
                          </TableCell>
                          <TableCell>{entry.guestName}</TableCell>
                          <TableCell className="text-sm">{entry.recipient}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteLogEntry(entry.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Redigera mall' : 'Ny meddelandemall'}</DialogTitle>
            <DialogDescription>Anvand platshallare som {'{{guestName}}'}, {'{{checkinDate}}'}, {'{{checkoutDate}}'}, {'{{roomType}}'}, {'{{hotelName}}'}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Mallnamn *</Label>
                <Input value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="Bokningsbekraftelse" />
              </div>
              <div className="grid gap-2">
                <Label>Typ *</Label>
                <Select value={templateForm.type} onValueChange={val => setTemplateForm(f => ({ ...f, type: val as MessageType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MESSAGE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Amnesrad *</Label>
              <Input value={templateForm.subject} onChange={e => setTemplateForm(f => ({ ...f, subject: e.target.value }))} placeholder="Bokningsbekraftelse - {{hotelName}}" />
            </div>
            <div className="grid gap-2">
              <Label>Meddelandetext *</Label>
              <Textarea value={templateForm.body} onChange={e => setTemplateForm(f => ({ ...f, body: e.target.value }))} rows={8} placeholder="Hej {{guestName}},..." />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={templateForm.active} onChange={e => setTemplateForm(f => ({ ...f, active: e.target.checked }))} className="h-4 w-4" />
              <Label>Aktiv mall</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveTemplate} disabled={!templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.body.trim()}>
              {editingTemplate ? 'Uppdatera' : 'Skapa mall'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Skicka meddelande</DialogTitle>
            <DialogDescription>Ange mottagarinformation for att logga utskicket.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Gastnamn *</Label>
              <Input value={sendForm.guestName} onChange={e => setSendForm(f => ({ ...f, guestName: e.target.value }))} placeholder="Anna Andersson" />
            </div>
            <div className="grid gap-2">
              <Label>Mottagare (e-post) *</Label>
              <Input type="email" value={sendForm.recipient} onChange={e => setSendForm(f => ({ ...f, recipient: e.target.value }))} placeholder="anna@example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSend} disabled={!sendForm.guestName.trim() || !sendForm.recipient.trim()}>
              <Send className="mr-2 h-4 w-4" />Logga utskick
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort mall</DialogTitle>
            <DialogDescription>Ar du saker pa att du vill ta bort mallen &quot;{templateToDelete?.name}&quot;?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteTemplate}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
