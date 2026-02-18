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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Euro, AlertTriangle } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type SubsidyStatus = 'Beviljat' | 'Utbetalt' | 'Periodiserat' | 'Villkorad'
interface Subsidy { id: string; name: string; totalAmount: number; periodStart: string; periodEnd: string; recognizedAmount: number; status: SubsidyStatus; conditionalLiability: boolean; notes: string }

const STATUSES: SubsidyStatus[] = ['Beviljat', 'Utbetalt', 'Periodiserat', 'Villkorad']
const STATUS_V: Record<SubsidyStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { 'Beviljat': 'info', 'Utbetalt': 'success', 'Periodiserat': 'warning', 'Villkorad': 'danger' }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const EMPTY_FORM = { name: '', totalAmount: 0, periodStart: '', periodEnd: '', recognizedAmount: 0, status: 'Beviljat' as SubsidyStatus, conditionalLiability: false, notes: '' }

export function EuStodSomIntaktWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [subsidies, setSubsidies] = useState<Subsidy[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Subsidy | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: Subsidy[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'eu_subsidies', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'eu_subsidies').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setSubsidies(data.config_value as Subsidy[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalGranted = useMemo(() => subsidies.reduce((s, e) => s + e.totalAmount, 0), [subsidies])
  const totalRecognized = useMemo(() => subsidies.reduce((s, e) => s + e.recognizedAmount, 0), [subsidies])
  const deferred = totalGranted - totalRecognized
  const conditionalCount = useMemo(() => subsidies.filter(s => s.conditionalLiability).length, [subsidies])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(s: Subsidy) { setEditing(s); setForm({ name: s.name, totalAmount: s.totalAmount, periodStart: s.periodStart, periodEnd: s.periodEnd, recognizedAmount: s.recognizedAmount, status: s.status, conditionalLiability: s.conditionalLiability, notes: s.notes }); setDialogOpen(true) }
  async function handleSave() { const entry: Subsidy = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? subsidies.map(s => s.id === editing.id ? entry : s) : [...subsidies, entry]; setSubsidies(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = subsidies.filter(s => s.id !== id); setSubsidies(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt EU-stöd</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Totalt beviljat" value={fmt(totalGranted)} unit="kr" />
              <KPICard label="Intäktsfört" value={fmt(totalRecognized)} unit="kr" />
              <KPICard label="Förutbetald intäkt" value={fmt(deferred)} unit="kr" />
              <KPICard label="Villkorad skuld" value={conditionalCount} unit="stöd" trend={conditionalCount > 0 ? 'down' : 'neutral'} />
            </div>
            {subsidies.length === 0 ? <EmptyModuleState icon={Euro} title="Inga EU-stöd" description="Lägg till EU-stöd för periodisering och villkorsuppföljning." actionLabel="Nytt EU-stöd" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Stöd</TableHead><TableHead className="font-medium text-right">Belopp</TableHead><TableHead className="font-medium text-right">Intäktsfört</TableHead><TableHead className="font-medium">Period</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{subsidies.map(s => (
                    <TableRow key={s.id}><TableCell className="font-medium"><div className="flex items-center gap-2">{s.name}{s.conditionalLiability && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}</div></TableCell><TableCell className="text-right tabular-nums">{fmt(s.totalAmount)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(s.recognizedAmount)} kr</TableCell><TableCell className="text-sm">{s.periodStart} - {s.periodEnd}</TableCell><TableCell><StatusBadge label={s.status} variant={STATUS_V[s.status]} /></TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                  ))}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Nytt EU-stöd'}</DialogTitle><DialogDescription>Registrera EU-stöd för periodisering.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Stödnamn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Gårdsstöd" /></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Totalt belopp (kr) *</Label><Input type="number" value={form.totalAmount || ''} onChange={e => setForm(f => ({ ...f, totalAmount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Intäktsfört (kr)</Label><Input type="number" value={form.recognizedAmount || ''} onChange={e => setForm(f => ({ ...f, recognizedAmount: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Periodstart</Label><Input type="date" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} /></div><div className="grid gap-2"><Label>Periodslut</Label><Input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} /></div></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as SubsidyStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex items-end"><Button type="button" variant={form.conditionalLiability ? 'destructive' : 'outline'} size="sm" onClick={() => setForm(f => ({ ...f, conditionalLiability: !f.conditionalLiability }))} className="w-full">{form.conditionalLiability ? 'Villkorad skuld: JA' : 'Villkorad skuld: NEJ'}</Button></div>
          </div>
          <div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
