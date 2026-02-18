'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { Plus, Pencil, Trash2, Loader2, Wrench } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type MaintenanceType = 'Förebyggande' | 'Avhjälpande' | 'Planerat stopp'
type MaintenanceStatus = 'Planerad' | 'Pågående' | 'Utförd' | 'Försenad'

interface MaintenanceTask {
  id: string
  machine: string
  type: MaintenanceType
  description: string
  scheduledDate: string
  completedDate: string
  status: MaintenanceStatus
  partsUsed: string
  cost: number
}

const TYPES: MaintenanceType[] = ['Förebyggande', 'Avhjälpande', 'Planerat stopp']
const STATUSES: MaintenanceStatus[] = ['Planerad', 'Pågående', 'Utförd', 'Försenad']
const STATUS_VARIANTS: Record<MaintenanceStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  'Planerad': 'info', 'Pågående': 'warning', 'Utförd': 'success', 'Försenad': 'danger',
}

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const EMPTY_FORM = { machine: '', type: 'Förebyggande' as MaintenanceType, description: '', scheduledDate: '', completedDate: '', status: 'Planerad' as MaintenanceStatus, partsUsed: '', cost: 0 }

export function MaskinunderhallWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tasks, setTasks] = useState<MaintenanceTask[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<MaintenanceTask | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<MaintenanceTask | null>(null)
  const [filterType, setFilterType] = useState<MaintenanceType | 'all'>('all')

  const saveTasks = useCallback(async (newTasks: MaintenanceTask[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'maintenance_tasks', config_value: newTasks },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'maintenance_tasks').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setTasks(data.config_value as MaintenanceTask[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filterType === 'all' ? tasks : tasks.filter(t => t.type === filterType)
  const totalCost = tasks.reduce((s, t) => s + t.cost, 0)

  function openNew() { setEditingTask(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(task: MaintenanceTask) { setEditingTask(task); setForm({ machine: task.machine, type: task.type, description: task.description, scheduledDate: task.scheduledDate, completedDate: task.completedDate, status: task.status, partsUsed: task.partsUsed, cost: task.cost }); setDialogOpen(true) }

  async function handleSave() {
    const newTask: MaintenanceTask = { id: editingTask?.id ?? crypto.randomUUID(), ...form, machine: form.machine.trim(), description: form.description.trim(), partsUsed: form.partsUsed.trim() }
    const updated = editingTask ? tasks.map(t => t.id === editingTask.id ? newTask : t) : [...tasks, newTask]
    setTasks(updated); setDialogOpen(false); await saveTasks(updated)
  }

  async function handleDelete() {
    if (!taskToDelete) return
    const updated = tasks.filter(t => t.id !== taskToDelete.id)
    setTasks(updated); setDeleteDialogOpen(false); setTaskToDelete(null); await saveTasks(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name} description={mod.desc} category="operativ" sectorName="Tillverkning"
        backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny uppgift</Button>}
      >
        <Tabs defaultValue="uppgifter" className="space-y-6">
          <TabsList>
            <TabsTrigger value="uppgifter">Underhållsuppgifter</TabsTrigger>
            <TabsTrigger value="sammanfattning">Sammanfattning</TabsTrigger>
          </TabsList>

          <TabsContent value="uppgifter" className="space-y-4">
            <div className="flex items-center gap-3">
              <Select value={filterType} onValueChange={val => setFilterType(val as MaintenanceType | 'all')}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrera typ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla typer</SelectItem>
                  {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <EmptyModuleState icon={Wrench} title="Inga underhållsuppgifter" description="Planera förebyggande och avhjälpande underhåll för era maskiner." actionLabel="Ny uppgift" onAction={openNew} />
            ) : (
              <div className="space-y-3">
                {filtered.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)).map(task => (
                  <div key={task.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-sm">{task.machine} - {task.description}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{task.type}</span>
                        <span>Planerat: {task.scheduledDate}</span>
                        {task.completedDate && <span>Utfört: {task.completedDate}</span>}
                        {task.cost > 0 && <span>{fmt(task.cost)} kr</span>}
                      </div>
                      {task.partsUsed && <p className="text-xs text-muted-foreground mt-0.5">Delar: {task.partsUsed}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusBadge label={task.status} variant={STATUS_VARIANTS[task.status]} />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(task)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setTaskToDelete(task); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sammanfattning" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Totalt</p><p className="text-2xl font-semibold mt-1">{tasks.length}</p></div>
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Förebyggande</p><p className="text-2xl font-semibold mt-1">{tasks.filter(t => t.type === 'Förebyggande').length}</p></div>
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Avhjälpande</p><p className="text-2xl font-semibold mt-1">{tasks.filter(t => t.type === 'Avhjälpande').length}</p></div>
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Total kostnad</p><p className="text-2xl font-semibold mt-1">{fmt(totalCost)} kr</p></div>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingTask ? 'Redigera uppgift' : 'Ny underhållsuppgift'}</DialogTitle><DialogDescription>Ange maskin, typ och schema för underhållet.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Maskin *</Label><Input value={form.machine} onChange={e => setForm(f => ({ ...f, machine: e.target.value }))} placeholder="CNC-1" /></div>
              <div className="grid gap-2"><Label>Typ</Label>
                <Select value={form.type} onValueChange={val => setForm(f => ({ ...f, type: val as MaintenanceType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2"><Label>Beskrivning *</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Byte av slitdelar..." /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Planerat datum</Label><Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Utfört datum</Label><Input type="date" value={form.completedDate} onChange={e => setForm(f => ({ ...f, completedDate: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Status</Label>
                <Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as MaintenanceStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Kostnad (kr)</Label><Input type="number" min={0} value={form.cost} onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Förbrukade delar</Label><Input value={form.partsUsed} onChange={e => setForm(f => ({ ...f, partsUsed: e.target.value }))} placeholder="Lager, filter, etc." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.machine.trim() || !form.description.trim()}>{editingTask ? 'Uppdatera' : 'Skapa'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort uppgift</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
