'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Briefcase } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type AssignmentStatus = 'Offert' | 'Aktivt' | 'Pausat' | 'Avslutat'
interface Assignment { id: string; name: string; client: string; status: AssignmentStatus; startDate: string; endDate: string; budget: number; invoiced: number; milestones: string; profitMarginPct: number }
const STATUSES: AssignmentStatus[] = ['Offert', 'Aktivt', 'Pausat', 'Avslutat']
const STATUS_MAP: Record<AssignmentStatus, 'info' | 'success' | 'warning' | 'neutral'> = { 'Offert': 'info', 'Aktivt': 'success', 'Pausat': 'warning', 'Avslutat': 'neutral' }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const EMPTY_FORM = { name: '', client: '', status: 'Offert' as AssignmentStatus, startDate: '', endDate: '', budget: 0, invoiced: 0, milestones: '', profitMarginPct: 0 }

export function UppdragshanteringKonsultWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Assignment | null>(null); const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Assignment | null>(null)

  const saveItems = useCallback(async (items: Assignment[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'assignments', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'assignments').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setAssignments(data.config_value as Assignment[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(a: Assignment) { setEditing(a); setForm({ name: a.name, client: a.client, status: a.status, startDate: a.startDate, endDate: a.endDate, budget: a.budget, invoiced: a.invoiced, milestones: a.milestones, profitMarginPct: a.profitMarginPct }); setDialogOpen(true) }
  async function handleSave() { const item: Assignment = { id: editing?.id ?? crypto.randomUUID(), ...form, name: form.name.trim(), client: form.client.trim(), milestones: form.milestones.trim() }; const updated = editing ? assignments.map(a => a.id === editing.id ? item : a) : [...assignments, item]; setAssignments(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = assignments.filter(a => a.id !== toDelete.id); setAssignments(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  const active = assignments.filter(a => a.status === 'Aktivt')
  const totalBudget = active.reduce((s, a) => s + a.budget, 0)
  const totalInvoiced = active.reduce((s, a) => s + a.invoiced, 0)

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Konsult" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt uppdrag</Button>}>
        <Tabs defaultValue="uppdrag" className="space-y-6">
          <TabsList><TabsTrigger value="uppdrag">Uppdrag</TabsTrigger><TabsTrigger value="oversikt">Översikt</TabsTrigger></TabsList>
          <TabsContent value="uppdrag" className="space-y-4">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : assignments.length === 0 ? <EmptyModuleState icon={Briefcase} title="Inga uppdrag" description="Hantera konsultuppdrag med milstolpar, status och lönsamhet." actionLabel="Nytt uppdrag" onAction={openNew} /> : (
              <div className="space-y-3">{assignments.sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)).map(a => (
                <div key={a.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                  <div className="flex flex-col min-w-0"><span className="font-medium text-sm">{a.name}</span><div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5"><span>{a.client}</span><span>{a.startDate} - {a.endDate || 'pågående'}</span><span>Budget: {fmt(a.budget)} kr</span><span>Fakturerat: {fmt(a.invoiced)} kr</span></div>{a.milestones && <p className="text-xs text-muted-foreground mt-0.5">Milstolpar: {a.milestones}</p>}</div>
                  <div className="flex items-center gap-2 flex-shrink-0"><StatusBadge label={a.status} variant={STATUS_MAP[a.status]} /><Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(a); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}</div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
          <TabsContent value="oversikt" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Aktiva uppdrag" value={String(active.length)} unit="st" /><KPICard label="Total budget" value={fmt(totalBudget)} unit="kr" /><KPICard label="Fakturerat" value={fmt(totalInvoiced)} unit="kr" /><KPICard label="Faktureringsgrad" value={totalBudget > 0 ? `${((totalInvoiced / totalBudget) * 100).toFixed(1)}` : '-'} unit="%" /></div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera uppdrag' : 'Nytt uppdrag'}</DialogTitle><DialogDescription>Ange uppdragsuppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Uppdragsnamn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div><div className="grid gap-2"><Label>Klient *</Label><Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as AssignmentStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Start</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Slut</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Budget (kr)</Label><Input type="number" min={0} value={form.budget} onChange={e => setForm(f => ({ ...f, budget: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Fakturerat (kr)</Label><Input type="number" min={0} value={form.invoiced} onChange={e => setForm(f => ({ ...f, invoiced: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Marginal %</Label><Input type="number" min={0} value={form.profitMarginPct} onChange={e => setForm(f => ({ ...f, profitMarginPct: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid gap-2"><Label>Milstolpar</Label><Input value={form.milestones} onChange={e => setForm(f => ({ ...f, milestones: e.target.value }))} placeholder="Fas 1, Fas 2, Leverans..." /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim() || !form.client.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort uppdrag</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
