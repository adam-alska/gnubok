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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Loader2, Kanban, Calendar, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type ProjectPhase = 'Brief' | 'Planering' | 'Produktion' | 'Granskning' | 'Leverans' | 'Avslutad'
type Priority = 'Hög' | 'Medium' | 'Låg'
interface MediaProject { id: string; name: string; client: string; phase: ProjectPhase; priority: Priority; deadline: string; startDate: string; assignee: string; budget: number; description: string; clientApproved: boolean }

const PHASES: ProjectPhase[] = ['Brief', 'Planering', 'Produktion', 'Granskning', 'Leverans', 'Avslutad']
const PRIORITIES: Priority[] = ['Hög', 'Medium', 'Låg']
const PHASE_V: Record<ProjectPhase, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { 'Brief': 'neutral', 'Planering': 'info', 'Produktion': 'warning', 'Granskning': 'info', 'Leverans': 'warning', 'Avslutad': 'success' }
const PRIORITY_V: Record<Priority, 'danger' | 'warning' | 'neutral'> = { 'Hög': 'danger', 'Medium': 'warning', 'Låg': 'neutral' }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const EMPTY_FORM = { name: '', client: '', phase: 'Brief' as ProjectPhase, priority: 'Medium' as Priority, deadline: '', startDate: '', assignee: '', budget: 0, description: '', clientApproved: false }

export function ProjekthanteringMediaWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<MediaProject[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MediaProject | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: MediaProject[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'media_projects', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'media_projects').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setProjects(data.config_value as MediaProject[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const activeCount = useMemo(() => projects.filter(p => p.phase !== 'Avslutad').length, [projects])
  const overdueCount = useMemo(() => { const today = new Date().toISOString().split('T')[0]; return projects.filter(p => p.deadline && p.deadline < today && p.phase !== 'Avslutad').length }, [projects])
  const awaitingApproval = useMemo(() => projects.filter(p => p.phase === 'Granskning' && !p.clientApproved).length, [projects])
  const totalBudget = useMemo(() => projects.filter(p => p.phase !== 'Avslutad').reduce((s, p) => s + p.budget, 0), [projects])

  const boardPhases = PHASES.filter(p => p !== 'Avslutad')
  const projectsByPhase = useMemo(() => { const m: Record<string, MediaProject[]> = {}; boardPhases.forEach(p => { m[p] = projects.filter(pr => pr.phase === p) }); return m }, [projects])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(p: MediaProject) { setEditing(p); setForm({ name: p.name, client: p.client, phase: p.phase, priority: p.priority, deadline: p.deadline, startDate: p.startDate, assignee: p.assignee, budget: p.budget, description: p.description, clientApproved: p.clientApproved }); setDialogOpen(true) }
  async function handleSave() { const entry: MediaProject = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? projects.map(p => p.id === editing.id ? entry : p) : [...projects, entry]; setProjects(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = projects.filter(p => p.id !== id); setProjects(updated); await saveData(updated) }
  async function movePhase(id: string, newPhase: ProjectPhase) { const updated = projects.map(p => p.id === id ? { ...p, phase: newPhase } : p); setProjects(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt projekt</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Aktiva projekt" value={activeCount} />
              <KPICard label="Försenade" value={overdueCount} trend={overdueCount > 0 ? 'down' : 'neutral'} trendLabel={overdueCount > 0 ? 'Kräver åtgärd' : undefined} />
              <KPICard label="Väntar kundgodkännande" value={awaitingApproval} />
              <KPICard label="Aktiv budget" value={fmt(totalBudget)} unit="kr" />
            </div>
            <Tabs defaultValue="board" className="space-y-4">
              <TabsList><TabsTrigger value="board"><Kanban className="mr-1.5 h-3.5 w-3.5" />Board</TabsTrigger><TabsTrigger value="timeline"><Calendar className="mr-1.5 h-3.5 w-3.5" />Tidslinje</TabsTrigger></TabsList>
              <TabsContent value="board">
                {projects.length === 0 ? <EmptyModuleState icon={Kanban} title="Inga projekt" description="Skapa projekt med faser, deadline, kundgodkännande och budget." actionLabel="Nytt projekt" onAction={openNew} /> : (
                  <div className="grid grid-cols-5 gap-3 overflow-x-auto">
                    {boardPhases.map(phase => (
                      <div key={phase} className="space-y-2">
                        <div className="flex items-center justify-between px-1"><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{phase}</h3><span className="text-xs text-muted-foreground">{projectsByPhase[phase]?.length || 0}</span></div>
                        <div className="space-y-2 min-h-[100px]">
                          {(projectsByPhase[phase] || []).map(p => {
                            const today = new Date().toISOString().split('T')[0]
                            const overdue = p.deadline && p.deadline < today
                            return (
                              <Card key={p.id} className={cn('cursor-pointer hover:shadow-md transition-shadow', overdue && 'border-red-500/40')}>
                                <CardHeader className="pb-2 pt-3 px-3"><CardTitle className="text-xs font-medium leading-tight">{p.name}</CardTitle></CardHeader>
                                <CardContent className="px-3 pb-3 space-y-1.5">
                                  <p className="text-[10px] text-muted-foreground">{p.client}</p>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <StatusBadge label={p.priority} variant={PRIORITY_V[p.priority]} />
                                    {p.clientApproved && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                                  </div>
                                  {p.deadline && <p className={cn('text-[10px]', overdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>{overdue ? 'Försenad: ' : 'Deadline: '}{p.deadline}</p>}
                                  <div className="flex items-center gap-1 pt-1"><Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-5 w-5 text-red-600" onClick={() => handleDelete(p.id)}><Trash2 className="h-3 w-3" /></Button>
                                    {PHASES.indexOf(p.phase) < PHASES.length - 1 && <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto text-blue-600" onClick={() => movePhase(p.id, PHASES[PHASES.indexOf(p.phase) + 1])} title="Flytta till nästa fas">&rarr;</Button>}
                                  </div>
                                </CardContent>
                              </Card>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="timeline">
                {projects.filter(p => p.phase !== 'Avslutad').length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Inga aktiva projekt.</p> : (
                  <div className="space-y-2">
                    {projects.filter(p => p.phase !== 'Avslutad').sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999')).map(p => {
                      const today = new Date().toISOString().split('T')[0]
                      const overdue = p.deadline && p.deadline < today
                      return (
                        <div key={p.id} className={cn('flex items-center justify-between rounded-lg border px-4 py-3', overdue && 'border-red-500/30 bg-red-500/5')}>
                          <div className="flex items-center gap-3"><StatusBadge label={p.phase} variant={PHASE_V[p.phase]} /><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.client}{p.assignee && ` - ${p.assignee}`}</p></div></div>
                          <div className="flex items-center gap-3"><StatusBadge label={p.priority} variant={PRIORITY_V[p.priority]} /><span className={cn('text-xs', overdue ? 'text-red-600 font-medium' : 'text-muted-foreground')}>{p.deadline || 'Ingen deadline'}</span></div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Nytt projekt'}</DialogTitle><DialogDescription>Mediaprojekt med faser och deadline.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Projektnamn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div><div className="grid gap-2"><Label>Kund</Label><Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Fas</Label><Select value={form.phase} onValueChange={v => setForm(f => ({ ...f, phase: v as ProjectPhase }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PHASES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Prioritet</Label><Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as Priority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Budget (kr)</Label><Input type="number" value={form.budget || ''} onChange={e => setForm(f => ({ ...f, budget: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Startdatum</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} /></div><div className="grid gap-2"><Label>Ansvarig</Label><Input value={form.assignee} onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))} /></div></div>
          <div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="flex items-center gap-2"><Button type="button" variant={form.clientApproved ? 'default' : 'outline'} size="sm" onClick={() => setForm(f => ({ ...f, clientApproved: !f.clientApproved }))}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{form.clientApproved ? 'Kundgodkänd' : 'Ej kundgodkänd'}</Button></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
