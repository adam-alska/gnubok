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
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  MessageSquare,
  Bell,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type TemplateType = 'booking_reminder' | 'revisit_reminder' | 'confirmation' | 'cancellation'

interface SmsTemplate {
  id: string
  name: string
  type: TemplateType
  message: string
  hoursBeforeBooking: number
  daysAfterLastVisit: number
  isActive: boolean
}

interface SmsLog {
  id: string
  templateName: string
  recipient: string
  message: string
  sentAt: string
  status: 'sent' | 'failed' | 'pending'
}

const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
  { value: 'booking_reminder', label: 'Bokningspåminnelse' },
  { value: 'revisit_reminder', label: 'Återbesökspåminnelse' },
  { value: 'confirmation', label: 'Bokningsbekräftelse' },
  { value: 'cancellation', label: 'Avbokning' },
]

const TYPE_LABELS: Record<TemplateType, string> = {
  booking_reminder: 'Bokningspåminnelse',
  revisit_reminder: 'Återbesök',
  confirmation: 'Bekräftelse',
  cancellation: 'Avbokning',
}

const DEFAULT_TEMPLATES: SmsTemplate[] = [
  {
    id: 'tpl-1',
    name: 'Påminnelse 24h',
    type: 'booking_reminder',
    message: 'Hej {namn}! Påminnelse om din bokning imorgon kl {tid} hos {stylist}. Salong: {salong}. Avboka: {länk}',
    hoursBeforeBooking: 24,
    daysAfterLastVisit: 0,
    isActive: true,
  },
  {
    id: 'tpl-2',
    name: 'Återbesök 6 veckor',
    type: 'revisit_reminder',
    message: 'Hej {namn}! Det har gått 6 veckor sedan ditt senaste besök. Dags att boka tid? Boka här: {länk}',
    hoursBeforeBooking: 0,
    daysAfterLastVisit: 42,
    isActive: true,
  },
  {
    id: 'tpl-3',
    name: 'Bokningsbekräftelse',
    type: 'confirmation',
    message: 'Tack {namn}! Din bokning är bekräftad: {tjänst} den {datum} kl {tid} hos {stylist}. Välkommen!',
    hoursBeforeBooking: 0,
    daysAfterLastVisit: 0,
    isActive: true,
  },
]

function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

export function SmsPaminnelserWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [smsLog, setSmsLog] = useState<SmsLog[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null)
  const [form, setForm] = useState({
    name: '',
    type: 'booking_reminder' as TemplateType,
    message: '',
    hoursBeforeBooking: 24,
    daysAfterLastVisit: 0,
    isActive: true,
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<SmsTemplate | null>(null)

  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testTemplate, setTestTemplate] = useState<SmsTemplate | null>(null)

  const saveData = useCallback(async (key: string, value: unknown) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: key,
        config_value: value,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: tplData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'sms_templates')
      .maybeSingle()

    if (tplData?.config_value && Array.isArray(tplData.config_value) && tplData.config_value.length > 0) {
      setTemplates(tplData.config_value as SmsTemplate[])
    } else {
      setTemplates(DEFAULT_TEMPLATES)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'sms_templates',
          config_value: DEFAULT_TEMPLATES,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: logData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'sms_log')
      .maybeSingle()

    if (logData?.config_value && Array.isArray(logData.config_value)) {
      setSmsLog(logData.config_value as SmsLog[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = useMemo(() => {
    const activeTemplates = templates.filter((t) => t.isActive).length
    const totalSent = smsLog.filter((l) => l.status === 'sent').length
    const totalFailed = smsLog.filter((l) => l.status === 'failed').length
    return { activeTemplates, totalSent, totalFailed, totalTemplates: templates.length }
  }, [templates, smsLog])

  function openNewTemplate() {
    setEditingTemplate(null)
    setForm({
      name: '',
      type: 'booking_reminder',
      message: '',
      hoursBeforeBooking: 24,
      daysAfterLastVisit: 0,
      isActive: true,
    })
    setDialogOpen(true)
  }

  function openEditTemplate(template: SmsTemplate) {
    setEditingTemplate(template)
    setForm({
      name: template.name,
      type: template.type,
      message: template.message,
      hoursBeforeBooking: template.hoursBeforeBooking,
      daysAfterLastVisit: template.daysAfterLastVisit,
      isActive: template.isActive,
    })
    setDialogOpen(true)
  }

  async function handleSaveTemplate() {
    const newTemplate: SmsTemplate = {
      id: editingTemplate?.id ?? generateId(),
      name: form.name.trim(),
      type: form.type,
      message: form.message.trim(),
      hoursBeforeBooking: form.hoursBeforeBooking,
      daysAfterLastVisit: form.daysAfterLastVisit,
      isActive: form.isActive,
    }

    let updated: SmsTemplate[]
    if (editingTemplate) {
      updated = templates.map((t) => t.id === editingTemplate.id ? newTemplate : t)
    } else {
      updated = [...templates, newTemplate]
    }

    setTemplates(updated)
    setDialogOpen(false)
    await saveData('sms_templates', updated)
  }

  async function toggleTemplateActive(id: string) {
    const updated = templates.map((t) =>
      t.id === id ? { ...t, isActive: !t.isActive } : t
    )
    setTemplates(updated)
    await saveData('sms_templates', updated)
  }

  function openDeleteTemplate(template: SmsTemplate) {
    setTemplateToDelete(template)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteTemplate() {
    if (!templateToDelete) return
    const updated = templates.filter((t) => t.id !== templateToDelete.id)
    setTemplates(updated)
    setDeleteDialogOpen(false)
    setTemplateToDelete(null)
    await saveData('sms_templates', updated)
  }

  function openTestDialog(template: SmsTemplate) {
    setTestTemplate(template)
    setTestPhone('')
    setTestDialogOpen(true)
  }

  async function handleSendTest() {
    if (!testTemplate || !testPhone.trim()) return

    const now = new Date()
    const sentAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const newLog: SmsLog = {
      id: generateId(),
      templateName: testTemplate.name,
      recipient: testPhone.trim(),
      message: testTemplate.message
        .replace('{namn}', 'Test Testsson')
        .replace('{tid}', '14:00')
        .replace('{datum}', '2026-01-15')
        .replace('{stylist}', 'Lisa')
        .replace('{salong}', 'Min Salong')
        .replace('{tjänst}', 'Klippning')
        .replace('{länk}', 'https://...')
      ,
      sentAt,
      status: 'sent',
    }

    const updatedLog = [newLog, ...smsLog]
    setSmsLog(updatedLog)
    setTestDialogOpen(false)
    await saveData('sms_log', updatedLog)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Frisör & Skönhet"
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
              <TabsTrigger value="mallar">SMS-mallar</TabsTrigger>
              <TabsTrigger value="logg">Skickat ({smsLog.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="mallar" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Aktiva mallar" value={String(kpis.activeTemplates)} unit={`av ${kpis.totalTemplates}`} />
                <KPICard label="Skickade SMS" value={String(kpis.totalSent)} unit="st" />
                <KPICard label="Misslyckade" value={String(kpis.totalFailed)} unit="st" />
                <KPICard label="Variabler" value="{namn}, {tid}..." />
              </div>

              {templates.length === 0 ? (
                <EmptyModuleState
                  icon={MessageSquare}
                  title="Inga SMS-mallar"
                  description="Skapa mallar för bokningspåminnelser och återbesök."
                  actionLabel="Ny mall"
                  onAction={openNewTemplate}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {templates.map((template) => (
                    <Card key={template.id} className={!template.isActive ? 'opacity-60' : ''}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-medium">{template.name}</CardTitle>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={template.isActive}
                              onCheckedChange={() => toggleTemplateActive(template.id)}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge label={TYPE_LABELS[template.type]} variant="info" />
                          {template.type === 'booking_reminder' && (
                            <span className="text-xs text-muted-foreground">{template.hoursBeforeBooking}h före</span>
                          )}
                          {template.type === 'revisit_reminder' && (
                            <span className="text-xs text-muted-foreground">{template.daysAfterLastVisit} dagar efter</span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{template.message}</p>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditTemplate(template)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Redigera
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openTestDialog(template)}>
                            <Bell className="mr-1 h-3.5 w-3.5" />
                            Testa
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => openDeleteTemplate(template)}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Ta bort
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="logg" className="space-y-6">
              {smsLog.length === 0 ? (
                <EmptyModuleState
                  icon={MessageSquare}
                  title="Inga skickade SMS"
                  description="Skickade SMS-påminnelser loggas här."
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Tidpunkt</TableHead>
                        <TableHead className="font-medium">Mall</TableHead>
                        <TableHead className="font-medium">Mottagare</TableHead>
                        <TableHead className="font-medium">Meddelande</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {smsLog.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm">{log.sentAt}</TableCell>
                          <TableCell className="text-sm font-medium">{log.templateName}</TableCell>
                          <TableCell className="text-sm">{log.recipient}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{log.message}</TableCell>
                          <TableCell>
                            <StatusBadge
                              label={log.status === 'sent' ? 'Skickat' : log.status === 'failed' ? 'Misslyckat' : 'Väntar'}
                              variant={log.status === 'sent' ? 'success' : log.status === 'failed' ? 'danger' : 'warning'}
                            />
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

      {/* Template dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Redigera mall' : 'Ny SMS-mall'}</DialogTitle>
            <DialogDescription>
              Använd variabler: {'{namn}'}, {'{tid}'}, {'{datum}'}, {'{stylist}'}, {'{salong}'}, {'{tjänst}'}, {'{länk}'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tpl-name">Mallnamn *</Label>
                <Input
                  id="tpl-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Påminnelse 24h"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tpl-type">Typ</Label>
                <Select
                  value={form.type}
                  onValueChange={(val) => setForm((f) => ({ ...f, type: val as TemplateType }))}
                >
                  <SelectTrigger id="tpl-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-msg">Meddelande *</Label>
              <Textarea
                id="tpl-msg"
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Hej {namn}! Påminnelse om din bokning..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(form.type === 'booking_reminder' || form.type === 'confirmation') && (
                <div className="grid gap-2">
                  <Label htmlFor="tpl-hours">Timmar före bokning</Label>
                  <Input
                    id="tpl-hours"
                    type="number"
                    min={1}
                    value={form.hoursBeforeBooking}
                    onChange={(e) => setForm((f) => ({ ...f, hoursBeforeBooking: Number(e.target.value) }))}
                  />
                </div>
              )}
              {form.type === 'revisit_reminder' && (
                <div className="grid gap-2">
                  <Label htmlFor="tpl-days">Dagar efter senaste besök</Label>
                  <Input
                    id="tpl-days"
                    type="number"
                    min={1}
                    value={form.daysAfterLastVisit}
                    onChange={(e) => setForm((f) => ({ ...f, daysAfterLastVisit: Number(e.target.value) }))}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveTemplate} disabled={!form.name.trim() || !form.message.trim()}>
              {editingTemplate ? 'Uppdatera' : 'Skapa mall'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Testa SMS</DialogTitle>
            <DialogDescription>Skicka ett test-SMS med mallen &quot;{testTemplate?.name}&quot;.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="test-phone">Telefonnummer *</Label>
              <Input
                id="test-phone"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="070-123 45 67"
              />
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground mb-1">Förhandsvisning</p>
              <p>{testTemplate?.message
                .replace('{namn}', 'Test Testsson')
                .replace('{tid}', '14:00')
                .replace('{datum}', '2026-01-15')
                .replace('{stylist}', 'Lisa')
                .replace('{salong}', 'Min Salong')
                .replace('{tjänst}', 'Klippning')
                .replace('{länk}', 'https://...')
              }</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSendTest} disabled={!testPhone.trim()}>Skicka test</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort mall</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort mallen &quot;{templateToDelete?.name}&quot;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteTemplate}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
