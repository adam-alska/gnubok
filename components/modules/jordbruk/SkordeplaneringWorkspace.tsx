'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
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
import { Plus, Pencil, Trash2, Loader2, Wheat } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type CropStatus = 'Planerad' | 'Sådd' | 'Växande' | 'Skördad'
interface FieldPlan { id: string; fieldName: string; hectares: number; crop: string; sowDate: string; harvestDate: string; status: CropStatus; notes: string }

const STATUSES: CropStatus[] = ['Planerad', 'Sådd', 'Växande', 'Skördad']
const STATUS_V: Record<CropStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { 'Planerad': 'neutral', 'Sådd': 'info', 'Växande': 'warning', 'Skördad': 'success' }

const EMPTY_FORM = { fieldName: '', hectares: 0, crop: '', sowDate: '', harvestDate: '', status: 'Planerad' as CropStatus, notes: '' }

export function SkordeplaneringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [plans, setPlans] = useState<FieldPlan[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FieldPlan | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: FieldPlan[]) => {
    setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'field_plans', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'field_plans').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setPlans(data.config_value as FieldPlan[]); setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(p: FieldPlan) { setEditing(p); setForm({ fieldName: p.fieldName, hectares: p.hectares, crop: p.crop, sowDate: p.sowDate, harvestDate: p.harvestDate, status: p.status, notes: p.notes }); setDialogOpen(true) }
  async function handleSave() { const entry: FieldPlan = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? plans.map(p => p.id === editing.id ? entry : p) : [...plans, entry]; setPlans(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = plans.filter(p => p.id !== id); setPlans(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt fält</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            {plans.length === 0 ? <EmptyModuleState icon={Wheat} title="Ingen skördeplanering" description="Lägg till fält med grödor, så- och skördedatum." actionLabel="Nytt fält" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Fält</TableHead><TableHead className="font-medium text-right">Hektar</TableHead><TableHead className="font-medium">Gröda</TableHead><TableHead className="font-medium">Sådd</TableHead><TableHead className="font-medium">Skörd</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{plans.map(p => (
                    <TableRow key={p.id}><TableCell className="font-medium">{p.fieldName}</TableCell><TableCell className="text-right tabular-nums">{p.hectares}</TableCell><TableCell>{p.crop}</TableCell><TableCell>{p.sowDate}</TableCell><TableCell>{p.harvestDate}</TableCell><TableCell><StatusBadge label={p.status} variant={STATUS_V[p.status]} /></TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                  ))}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Nytt fält'}</DialogTitle><DialogDescription>Fyll i fältets odlingsuppgifter.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fältnamn *</Label><Input value={form.fieldName} onChange={e => setForm(f => ({ ...f, fieldName: e.target.value }))} placeholder="Norråkern" /></div><div className="grid gap-2"><Label>Hektar</Label><Input type="number" step="0.1" value={form.hectares || ''} onChange={e => setForm(f => ({ ...f, hectares: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Gröda *</Label><Input value={form.crop} onChange={e => setForm(f => ({ ...f, crop: e.target.value }))} placeholder="Höstvete" /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as CropStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Sådatum</Label><Input type="date" value={form.sowDate} onChange={e => setForm(f => ({ ...f, sowDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Skördedatum</Label><Input type="date" value={form.harvestDate} onChange={e => setForm(f => ({ ...f, harvestDate: e.target.value }))} /></div></div>
          <div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.fieldName.trim() || !form.crop.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
