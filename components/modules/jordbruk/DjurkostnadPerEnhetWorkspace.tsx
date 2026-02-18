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
import { Plus, Pencil, Trash2, Loader2, Bug } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface AnimalCost { id: string; animalType: string; count: number; feedCost: number; vetCost: number; housingCost: number; otherCost: number; saleRevenue: number }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const EMPTY_FORM = { animalType: '', count: 0, feedCost: 0, vetCost: 0, housingCost: 0, otherCost: 0, saleRevenue: 0 }

export function DjurkostnadPerEnhetWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<AnimalCost[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AnimalCost | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: AnimalCost[]) => {
    setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'animal_costs', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'animal_costs').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as AnimalCost[]); setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalAnimals = useMemo(() => entries.reduce((s, e) => s + e.count, 0), [entries])
  const totalCost = useMemo(() => entries.reduce((s, e) => s + e.feedCost + e.vetCost + e.housingCost + e.otherCost, 0), [entries])
  const totalRevenue = useMemo(() => entries.reduce((s, e) => s + e.saleRevenue, 0), [entries])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: AnimalCost) { setEditing(e); setForm({ animalType: e.animalType, count: e.count, feedCost: e.feedCost, vetCost: e.vetCost, housingCost: e.housingCost, otherCost: e.otherCost, saleRevenue: e.saleRevenue }); setDialogOpen(true) }
  async function handleSave() { const entry: AnimalCost = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? entries.map(e => e.id === editing.id ? entry : e) : [...entries, entry]; setEntries(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = entries.filter(e => e.id !== id); setEntries(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny djurtyp</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Totalt djur" value={totalAnimals} />
              <KPICard label="Total kostnad" value={fmt(totalCost)} unit="kr" />
              <KPICard label="Total intäkt" value={fmt(totalRevenue)} unit="kr" />
              <KPICard label="Resultat" value={`${totalRevenue - totalCost >= 0 ? '+' : ''}${fmt(totalRevenue - totalCost)}`} unit="kr" trend={totalRevenue >= totalCost ? 'up' : 'down'} />
            </div>
            {entries.length === 0 ? <EmptyModuleState icon={Bug} title="Inga djurtyper" description="Registrera djurtyper med foder-, veterinär- och stallkostnader för analys per enhet." actionLabel="Ny djurtyp" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Djurtyp</TableHead><TableHead className="font-medium text-right">Antal</TableHead><TableHead className="font-medium text-right">Foder</TableHead><TableHead className="font-medium text-right">Veterinär</TableHead><TableHead className="font-medium text-right">Stall</TableHead><TableHead className="font-medium text-right">Kostnad/djur</TableHead><TableHead className="font-medium text-right">Intäkt</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{entries.map(e => {
                    const total = e.feedCost + e.vetCost + e.housingCost + e.otherCost
                    const perAnimal = e.count > 0 ? total / e.count : 0
                    const profit = e.saleRevenue - total
                    return (<TableRow key={e.id}><TableCell className="font-medium">{e.animalType}</TableCell><TableCell className="text-right tabular-nums">{e.count}</TableCell><TableCell className="text-right tabular-nums">{fmt(e.feedCost)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(e.vetCost)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(e.housingCost)} kr</TableCell><TableCell className="text-right tabular-nums font-medium">{fmt(perAnimal)} kr</TableCell><TableCell className={cn('text-right tabular-nums', profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{fmt(e.saleRevenue)} kr</TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(e.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>)
                  })}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny djurtyp'}</DialogTitle><DialogDescription>Ange kostnader per djurkategori.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Djurtyp *</Label><Input value={form.animalType} onChange={e => setForm(f => ({ ...f, animalType: e.target.value }))} placeholder="Mjölkkor" /></div><div className="grid gap-2"><Label>Antal</Label><Input type="number" value={form.count || ''} onChange={e => setForm(f => ({ ...f, count: parseInt(e.target.value) || 0 }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Foderkostnad (kr)</Label><Input type="number" value={form.feedCost || ''} onChange={e => setForm(f => ({ ...f, feedCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Veterinärkostnad (kr)</Label><Input type="number" value={form.vetCost || ''} onChange={e => setForm(f => ({ ...f, vetCost: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Stallkostnad (kr)</Label><Input type="number" value={form.housingCost || ''} onChange={e => setForm(f => ({ ...f, housingCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Försäljningsintäkt (kr)</Label><Input type="number" value={form.saleRevenue || ''} onChange={e => setForm(f => ({ ...f, saleRevenue: parseFloat(e.target.value) || 0 }))} /></div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.animalType.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
