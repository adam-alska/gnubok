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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Sprout } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type AssetType = 'Djur' | 'Gröda' | 'Skog'
interface BioAsset { id: string; name: string; type: AssetType; quantity: number; unit: string; bookValue: number; fairValue: number; lastValuation: string; account: string }

const ASSET_TYPES: AssetType[] = ['Djur', 'Gröda', 'Skog']
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const EMPTY_FORM = { name: '', type: 'Djur' as AssetType, quantity: 0, unit: 'st', bookValue: 0, fairValue: 0, lastValuation: '', account: '1280' }

export function BiologiskaTillgangarWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assets, setAssets] = useState<BioAsset[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<BioAsset | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: BioAsset[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'bio_assets', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'bio_assets').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setAssets(data.config_value as BioAsset[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalBook = useMemo(() => assets.reduce((s, a) => s + a.bookValue, 0), [assets])
  const totalFair = useMemo(() => assets.reduce((s, a) => s + a.fairValue, 0), [assets])
  const revaluationDiff = totalFair - totalBook

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(a: BioAsset) { setEditing(a); setForm({ name: a.name, type: a.type, quantity: a.quantity, unit: a.unit, bookValue: a.bookValue, fairValue: a.fairValue, lastValuation: a.lastValuation, account: a.account }); setDialogOpen(true) }
  async function handleSave() { const entry: BioAsset = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? assets.map(a => a.id === editing.id ? entry : a) : [...assets, entry]; setAssets(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = assets.filter(a => a.id !== id); setAssets(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny tillgång</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Bokfört värde" value={fmt(totalBook)} unit="kr" />
              <KPICard label="Verkligt värde" value={fmt(totalFair)} unit="kr" />
              <KPICard label="Omvärderingsdiff" value={`${revaluationDiff >= 0 ? '+' : ''}${fmt(revaluationDiff)}`} unit="kr" trend={revaluationDiff >= 0 ? 'up' : 'down'} />
              <KPICard label="Antal tillgångar" value={assets.length} />
            </div>
            {assets.length === 0 ? <EmptyModuleState icon={Sprout} title="Inga biologiska tillgångar" description="Registrera djur, grödor och skog på konto 1280 med årlig omvärdering." actionLabel="Ny tillgång" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Tillgång</TableHead><TableHead className="font-medium">Typ</TableHead><TableHead className="font-medium text-right">Antal</TableHead><TableHead className="font-medium text-right">Bokfört</TableHead><TableHead className="font-medium text-right">Verkligt</TableHead><TableHead className="font-medium">Konto</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{assets.map(a => (
                    <TableRow key={a.id}><TableCell className="font-medium">{a.name}</TableCell><TableCell><Badge variant="outline">{a.type}</Badge></TableCell><TableCell className="text-right tabular-nums">{a.quantity} {a.unit}</TableCell><TableCell className="text-right tabular-nums">{fmt(a.bookValue)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(a.fairValue)} kr</TableCell><TableCell className="font-mono">{a.account}</TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                  ))}</TableBody></Table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny tillgång'}</DialogTitle><DialogDescription>Registrera biologisk tillgång.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mjölkkor" /></div><div className="grid gap-2"><Label>Typ</Label><Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as AssetType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Antal</Label><Input type="number" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Enhet</Label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="st" /></div><div className="grid gap-2"><Label>Konto</Label><Input value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} placeholder="1280" /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Bokfört värde (kr)</Label><Input type="number" value={form.bookValue || ''} onChange={e => setForm(f => ({ ...f, bookValue: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Verkligt värde (kr)</Label><Input type="number" value={form.fairValue || ''} onChange={e => setForm(f => ({ ...f, fairValue: parseFloat(e.target.value) || 0 }))} /></div></div>
          <div className="grid gap-2"><Label>Senaste värdering</Label><Input type="date" value={form.lastValuation} onChange={e => setForm(f => ({ ...f, lastValuation: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
