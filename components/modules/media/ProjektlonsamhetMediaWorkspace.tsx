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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface ProjectProfit { id: string; projectName: string; client: string; budget: number; actualCost: number; hoursWorked: number; hourlyRate: number; billedAmount: number; freelanceCost: number; internalCost: number }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function pct(n: number): string { return isNaN(n) || !isFinite(n) ? '0%' : `${Math.round(n * 100)}%` }
const EMPTY_FORM = { projectName: '', client: '', budget: 0, actualCost: 0, hoursWorked: 0, hourlyRate: 0, billedAmount: 0, freelanceCost: 0, internalCost: 0 }

export function ProjektlonsamhetMediaWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState<ProjectProfit[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectProfit | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: ProjectProfit[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'project_profitability', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'project_profitability').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setProjects(data.config_value as ProjectProfit[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalBilled = useMemo(() => projects.reduce((s, p) => s + p.billedAmount, 0), [projects])
  const totalCost = useMemo(() => projects.reduce((s, p) => s + p.actualCost, 0), [projects])
  const totalProfit = totalBilled - totalCost
  const avgMargin = totalBilled > 0 ? totalProfit / totalBilled : 0
  const totalHours = useMemo(() => projects.reduce((s, p) => s + p.hoursWorked, 0), [projects])
  const effectiveRate = totalHours > 0 ? totalBilled / totalHours : 0

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(p: ProjectProfit) { setEditing(p); setForm({ projectName: p.projectName, client: p.client, budget: p.budget, actualCost: p.actualCost, hoursWorked: p.hoursWorked, hourlyRate: p.hourlyRate, billedAmount: p.billedAmount, freelanceCost: p.freelanceCost, internalCost: p.internalCost }); setDialogOpen(true) }
  async function handleSave() { const entry: ProjectProfit = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? projects.map(p => p.id === editing.id ? entry : p) : [...projects, entry]; setProjects(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = projects.filter(p => p.id !== id); setProjects(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt projekt</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Total fakturering" value={fmt(totalBilled)} unit="kr" />
              <KPICard label="Total kostnad" value={fmt(totalCost)} unit="kr" />
              <KPICard label="Genomsnittsmarginal" value={pct(avgMargin)} trend={avgMargin >= 0.3 ? 'up' : avgMargin >= 0.15 ? 'neutral' : 'down'} trendLabel={avgMargin < 0.15 ? 'Låg marginal' : undefined} />
              <KPICard label="Effektiv timkostnad" value={fmt(effectiveRate)} unit="kr/tim" />
            </div>
            {projects.length === 0 ? <EmptyModuleState icon={TrendingUp} title="Inga projektdata" description="Analysera projektlönsamhet: budget vs verklig kostnad, timkostnad vs fakturerat." actionLabel="Nytt projekt" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Projekt</TableHead><TableHead className="font-medium">Kund</TableHead><TableHead className="font-medium text-right">Budget</TableHead><TableHead className="font-medium text-right">Fakturerat</TableHead><TableHead className="font-medium text-right">Kostnad</TableHead><TableHead className="font-medium text-right">Resultat</TableHead><TableHead className="font-medium text-right">Marginal</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                <TableBody>{projects.map(p => { const profit = p.billedAmount - p.actualCost; const margin = p.billedAmount > 0 ? profit / p.billedAmount : 0; return (
                  <TableRow key={p.id}><TableCell className="font-medium">{p.projectName}</TableCell><TableCell>{p.client}</TableCell><TableCell className="text-right tabular-nums">{fmt(p.budget)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(p.billedAmount)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(p.actualCost)} kr</TableCell><TableCell className={cn('text-right tabular-nums font-medium', profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{fmt(profit)} kr</TableCell><TableCell className="text-right"><StatusBadge label={pct(margin)} variant={margin >= 0.3 ? 'success' : margin >= 0.15 ? 'warning' : 'danger'} /></TableCell>
                    <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                ) })}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Nytt projekt'}</DialogTitle><DialogDescription>Projektlönsamhet - budget vs verkligt.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Projektnamn *</Label><Input value={form.projectName} onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))} /></div><div className="grid gap-2"><Label>Kund</Label><Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Budget (kr)</Label><Input type="number" value={form.budget || ''} onChange={e => setForm(f => ({ ...f, budget: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Fakturerat (kr)</Label><Input type="number" value={form.billedAmount || ''} onChange={e => setForm(f => ({ ...f, billedAmount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Verklig kostnad (kr)</Label><Input type="number" value={form.actualCost || ''} onChange={e => setForm(f => ({ ...f, actualCost: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Timmar</Label><Input type="number" value={form.hoursWorked || ''} onChange={e => setForm(f => ({ ...f, hoursWorked: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Timpris (kr)</Label><Input type="number" value={form.hourlyRate || ''} onChange={e => setForm(f => ({ ...f, hourlyRate: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Freelancekostnad (kr)</Label><Input type="number" value={form.freelanceCost || ''} onChange={e => setForm(f => ({ ...f, freelanceCost: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Beräknat resultat: <strong className={cn(form.billedAmount - form.actualCost >= 0 ? 'text-emerald-600' : 'text-red-600')}>{fmt(form.billedAmount - form.actualCost)} kr</strong> | Marginal: <strong>{form.billedAmount > 0 ? pct((form.billedAmount - form.actualCost) / form.billedAmount) : '0%'}</strong></p></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.projectName.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
