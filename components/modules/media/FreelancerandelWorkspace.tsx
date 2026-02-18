'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Users, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface PeriodEntry { id: string; period: string; totalProductionCost: number; freelanceCost: number; internalCost: number; projectCount: number; freelancerCount: number }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function pct(n: number): string { return isNaN(n) || !isFinite(n) ? '0%' : `${Math.round(n * 100)}%` }
const EMPTY_FORM = { period: '', totalProductionCost: 0, freelanceCost: 0, internalCost: 0, projectCount: 0, freelancerCount: 0 }

export function FreelancerandelWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<PeriodEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PeriodEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: PeriodEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'freelancer_share', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'freelancer_share').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as PeriodEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalFreelance = useMemo(() => entries.reduce((s, e) => s + e.freelanceCost, 0), [entries])
  const totalProduction = useMemo(() => entries.reduce((s, e) => s + e.totalProductionCost, 0), [entries])
  const avgShare = totalProduction > 0 ? totalFreelance / totalProduction : 0
  const latestEntry = useMemo(() => entries.length > 0 ? entries.sort((a, b) => b.period.localeCompare(a.period))[0] : null, [entries])
  const latestShare = latestEntry && latestEntry.totalProductionCost > 0 ? latestEntry.freelanceCost / latestEntry.totalProductionCost : 0

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: PeriodEntry) { setEditing(e); setForm({ period: e.period, totalProductionCost: e.totalProductionCost, freelanceCost: e.freelanceCost, internalCost: e.internalCost, projectCount: e.projectCount, freelancerCount: e.freelancerCount }); setDialogOpen(true) }
  async function handleSave() { const entry: PeriodEntry = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? entries.map(e => e.id === editing.id ? entry : e) : [...entries, entry]; setEntries(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = entries.filter(e => e.id !== id); setEntries(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny period</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            {avgShare > 0.6 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-700"><AlertTriangle className="h-4 w-4" />Hög freelanceandel ({pct(avgShare)})</div>
                <p className="text-xs text-amber-600">En freelanceandel över 60% kan påverka lönsamhet och leveranssäkerhet negativt.</p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Genomsnittlig freelanceandel" value={pct(avgShare)} trend={avgShare > 0.5 ? 'down' : 'up'} trendLabel={avgShare > 0.5 ? 'Hög andel' : 'Balanserad'} />
              <KPICard label="Senaste period" value={pct(latestShare)} />
              <KPICard label="Total freelancekostnad" value={fmt(totalFreelance)} unit="kr" />
              <KPICard label="Total produktionskostnad" value={fmt(totalProduction)} unit="kr" />
            </div>
            {entries.length === 0 ? <EmptyModuleState icon={Users} title="Inga perioder" description="Analysera freelanceandel av produktionskostnad per period. Identifiera trender och lönsamhetspåverkan." actionLabel="Ny period" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Period</TableHead><TableHead className="font-medium text-right">Produktionskostnad</TableHead><TableHead className="font-medium text-right">Freelancekostnad</TableHead><TableHead className="font-medium text-right">Internkostnad</TableHead><TableHead className="font-medium text-right">Andel freelance</TableHead><TableHead className="font-medium text-right">Projekt</TableHead><TableHead className="font-medium text-right">Freelancers</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                <TableBody>{entries.sort((a, b) => b.period.localeCompare(a.period)).map(e => { const share = e.totalProductionCost > 0 ? e.freelanceCost / e.totalProductionCost : 0; return (
                  <TableRow key={e.id}><TableCell className="font-medium">{e.period}</TableCell><TableCell className="text-right tabular-nums">{fmt(e.totalProductionCost)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(e.freelanceCost)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(e.internalCost)} kr</TableCell><TableCell className="text-right"><Badge variant={share > 0.6 ? 'destructive' : share > 0.4 ? 'secondary' : 'default'}>{pct(share)}</Badge></TableCell><TableCell className="text-right tabular-nums">{e.projectCount}</TableCell><TableCell className="text-right tabular-nums">{e.freelancerCount}</TableCell>
                    <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                ) })}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny period'}</DialogTitle><DialogDescription>Freelanceandel av produktionskostnad.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Period *</Label><Input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="2025-Q1" /></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Total produktionskostnad (kr) *</Label><Input type="number" value={form.totalProductionCost || ''} onChange={e => setForm(f => ({ ...f, totalProductionCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Freelancekostnad (kr)</Label><Input type="number" value={form.freelanceCost || ''} onChange={e => setForm(f => ({ ...f, freelanceCost: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Internkostnad (kr)</Label><Input type="number" value={form.internalCost || ''} onChange={e => setForm(f => ({ ...f, internalCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Antal projekt</Label><Input type="number" value={form.projectCount || ''} onChange={e => setForm(f => ({ ...f, projectCount: parseInt(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Antal freelancers</Label><Input type="number" value={form.freelancerCount || ''} onChange={e => setForm(f => ({ ...f, freelancerCount: parseInt(e.target.value) || 0 }))} /></div></div>
          <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Freelanceandel: <strong className={cn(form.totalProductionCost > 0 && form.freelanceCost / form.totalProductionCost > 0.6 ? 'text-red-600' : '')}>{form.totalProductionCost > 0 ? pct(form.freelanceCost / form.totalProductionCost) : '0%'}</strong></p></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.period.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
