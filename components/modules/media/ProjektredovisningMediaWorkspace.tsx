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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type ProjectStatus = 'Pågående' | 'Avslutad' | 'Parkerad'
interface Project { id: string; name: string; client: string; budget: number; actualCost: number; invoiced: number; wipValue: number; status: ProjectStatus; startDate: string; endDate: string }

const STATUSES: ProjectStatus[] = ['Pågående', 'Avslutad', 'Parkerad']
const STATUS_V: Record<ProjectStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { 'Pågående': 'info', 'Avslutad': 'success', 'Parkerad': 'neutral' }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const EMPTY_FORM = { name: '', client: '', budget: 0, actualCost: 0, invoiced: 0, wipValue: 0, status: 'Pågående' as ProjectStatus, startDate: '', endDate: '' }

export function ProjektredovisningMediaWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: Project[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'projects', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'projects').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setProjects(data.config_value as Project[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalBudget = useMemo(() => projects.reduce((s, p) => s + p.budget, 0), [projects])
  const totalActual = useMemo(() => projects.reduce((s, p) => s + p.actualCost, 0), [projects])
  const totalWIP = useMemo(() => projects.filter(p => p.status === 'Pågående').reduce((s, p) => s + p.wipValue, 0), [projects])
  const activeCount = useMemo(() => projects.filter(p => p.status === 'Pågående').length, [projects])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(p: Project) { setEditing(p); setForm({ name: p.name, client: p.client, budget: p.budget, actualCost: p.actualCost, invoiced: p.invoiced, wipValue: p.wipValue, status: p.status, startDate: p.startDate, endDate: p.endDate }); setDialogOpen(true) }
  async function handleSave() { const entry: Project = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? projects.map(p => p.id === editing.id ? entry : p) : [...projects, entry]; setProjects(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = projects.filter(p => p.id !== id); setProjects(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt projekt</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Aktiva projekt" value={activeCount} />
              <KPICard label="Total budget" value={fmt(totalBudget)} unit="kr" />
              <KPICard label="Verklig kostnad" value={fmt(totalActual)} unit="kr" />
              <KPICard label="PIA (pågående arbeten)" value={fmt(totalWIP)} unit="kr" />
            </div>
            {projects.length === 0 ? <EmptyModuleState icon={FolderOpen} title="Inga projekt" description="Skapa projekt med budget, verklig kostnad, PIA-värde och projektavslut." actionLabel="Nytt projekt" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Projekt</TableHead><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium text-right">Budget</TableHead><TableHead className="font-medium text-right">Verkligt</TableHead><TableHead className="font-medium text-right">Fakturerat</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                <TableBody>{projects.map(p => { const diff = p.budget - p.actualCost; return (
                  <TableRow key={p.id}><TableCell className="font-medium">{p.name}</TableCell><TableCell>{p.client}</TableCell><TableCell className="text-right tabular-nums">{fmt(p.budget)} kr</TableCell><TableCell className={cn('text-right tabular-nums', diff < 0 && 'text-red-600')}>{fmt(p.actualCost)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(p.invoiced)} kr</TableCell><TableCell><StatusBadge label={p.status} variant={STATUS_V[p.status]} /></TableCell>
                    <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                ) })}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Nytt projekt'}</DialogTitle><DialogDescription>Projektredovisning med budget vs verkligt.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Projektnamn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div><div className="grid gap-2"><Label>Kund</Label><Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Budget (kr)</Label><Input type="number" value={form.budget || ''} onChange={e => setForm(f => ({ ...f, budget: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Verklig kostnad (kr)</Label><Input type="number" value={form.actualCost || ''} onChange={e => setForm(f => ({ ...f, actualCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Fakturerat (kr)</Label><Input type="number" value={form.invoiced || ''} onChange={e => setForm(f => ({ ...f, invoiced: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>PIA-värde (kr)</Label><Input type="number" value={form.wipValue || ''} onChange={e => setForm(f => ({ ...f, wipValue: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Startdatum</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Slutdatum</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div></div>
          <div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as ProjectStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
