'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, BarChart3 } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface CropYield { id: string; crop: string; hectares: number; yieldKg: number; season: string; revenuePerKg: number }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtDec(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n) }

const EMPTY_FORM = { crop: '', hectares: 0, yieldKg: 0, season: new Date().getFullYear().toString(), revenuePerKg: 0 }

export function AvkastningPerHektarWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<CropYield[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CropYield | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: CropYield[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'crop_yields', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'crop_yields').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as CropYield[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalHa = useMemo(() => entries.reduce((s, e) => s + e.hectares, 0), [entries])
  const totalYield = useMemo(() => entries.reduce((s, e) => s + e.yieldKg, 0), [entries])
  const avgYieldPerHa = totalHa > 0 ? totalYield / totalHa : 0
  const totalRevenue = useMemo(() => entries.reduce((s, e) => s + e.yieldKg * e.revenuePerKg, 0), [entries])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: CropYield) { setEditing(e); setForm({ crop: e.crop, hectares: e.hectares, yieldKg: e.yieldKg, season: e.season, revenuePerKg: e.revenuePerKg }); setDialogOpen(true) }
  async function handleSave() { const entry: CropYield = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? entries.map(e => e.id === editing.id ? entry : e) : [...entries, entry]; setEntries(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = entries.filter(e => e.id !== id); setEntries(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny gröda</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Total areal" value={fmtDec(totalHa)} unit="ha" />
              <KPICard label="Total skörd" value={fmt(totalYield)} unit="kg" />
              <KPICard label="Snitt kg/ha" value={fmt(avgYieldPerHa)} unit="kg/ha" />
              <KPICard label="Total intäkt" value={fmt(totalRevenue)} unit="kr" />
            </div>
            {entries.length === 0 ? <EmptyModuleState icon={BarChart3} title="Inga grödor" description="Registrera grödor per fält för att analysera avkastning per hektar och säsong." actionLabel="Ny gröda" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Gröda</TableHead><TableHead className="font-medium">Säsong</TableHead><TableHead className="font-medium text-right">Hektar</TableHead><TableHead className="font-medium text-right">Skörd (kg)</TableHead><TableHead className="font-medium text-right">kg/ha</TableHead><TableHead className="font-medium text-right">Intäkt</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{entries.map(e => {
                    const perHa = e.hectares > 0 ? e.yieldKg / e.hectares : 0
                    return (<TableRow key={e.id}><TableCell className="font-medium">{e.crop}</TableCell><TableCell>{e.season}</TableCell><TableCell className="text-right tabular-nums">{fmtDec(e.hectares)}</TableCell><TableCell className="text-right tabular-nums">{fmt(e.yieldKg)}</TableCell><TableCell className="text-right tabular-nums font-medium">{fmt(perHa)}</TableCell><TableCell className="text-right tabular-nums">{fmt(e.yieldKg * e.revenuePerKg)} kr</TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>)
                  })}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny gröda'}</DialogTitle><DialogDescription>Registrera skördedata per gröda.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Gröda *</Label><Input value={form.crop} onChange={e => setForm(f => ({ ...f, crop: e.target.value }))} placeholder="Vete" /></div><div className="grid gap-2"><Label>Säsong</Label><Input value={form.season} onChange={e => setForm(f => ({ ...f, season: e.target.value }))} placeholder="2025" /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Hektar</Label><Input type="number" step="0.1" value={form.hectares || ''} onChange={e => setForm(f => ({ ...f, hectares: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Skörd (kg)</Label><Input type="number" value={form.yieldKg || ''} onChange={e => setForm(f => ({ ...f, yieldKg: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>kr/kg</Label><Input type="number" step="0.1" value={form.revenuePerKg || ''} onChange={e => setForm(f => ({ ...f, revenuePerKg: parseFloat(e.target.value) || 0 }))} /></div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.crop.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
