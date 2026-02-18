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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Pencil, Trash2, Loader2, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type AssetType = 'Varumärke' | 'Patent' | 'Upphovsrätt' | 'Licens' | 'Domännamn' | 'Övrigt'
type DepMethod = 'Linjär' | 'Ingen'
interface IpAsset { id: string; name: string; type: AssetType; account: string; acquisitionDate: string; acquisitionCost: number; usefulLife: number; depMethod: DepMethod; accumulatedDep: number; bookValue: number; notes: string }

const ASSET_TYPES: AssetType[] = ['Varumärke', 'Patent', 'Upphovsrätt', 'Licens', 'Domännamn', 'Övrigt']
const DEP_METHODS: DepMethod[] = ['Linjär', 'Ingen']
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const EMPTY_FORM = { name: '', type: 'Upphovsrätt' as AssetType, account: '1010', acquisitionDate: '', acquisitionCost: 0, usefulLife: 5, depMethod: 'Linjär' as DepMethod, accumulatedDep: 0, bookValue: 0, notes: '' }

export function IpTillgangarWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assets, setAssets] = useState<IpAsset[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<IpAsset | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const saveData = useCallback(async (items: IpAsset[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'ip_assets', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'ip_assets').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setAssets(data.config_value as IpAsset[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalAcquisition = useMemo(() => assets.reduce((s, a) => s + a.acquisitionCost, 0), [assets])
  const totalBookValue = useMemo(() => assets.reduce((s, a) => s + a.bookValue, 0), [assets])
  const totalDep = useMemo(() => assets.reduce((s, a) => s + a.accumulatedDep, 0), [assets])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(a: IpAsset) { setEditing(a); setForm({ name: a.name, type: a.type, account: a.account, acquisitionDate: a.acquisitionDate, acquisitionCost: a.acquisitionCost, usefulLife: a.usefulLife, depMethod: a.depMethod, accumulatedDep: a.accumulatedDep, bookValue: a.bookValue, notes: a.notes }); setDialogOpen(true) }

  async function handleSave() {
    const bv = form.depMethod === 'Linjär' ? Math.max(0, form.acquisitionCost - form.accumulatedDep) : form.acquisitionCost
    const entry: IpAsset = { id: editing?.id ?? crypto.randomUUID(), ...form, bookValue: bv }
    const updated = editing ? assets.map(a => a.id === editing.id ? entry : a) : [...assets, entry]
    setAssets(updated); setDialogOpen(false); await saveData(updated)
  }
  async function handleDelete(id: string) { const updated = assets.filter(a => a.id !== id); setAssets(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny tillgång</Button>}>
        <Tabs defaultValue="register" className="space-y-6">
          <TabsList><TabsTrigger value="register">Register</TabsTrigger><TabsTrigger value="regler">Avskrivningsregler</TabsTrigger></TabsList>
          <TabsContent value="register" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <KPICard label="Anskaffningsvärde" value={fmt(totalAcquisition)} unit="kr" />
                  <KPICard label="Bokfört värde" value={fmt(totalBookValue)} unit="kr" />
                  <KPICard label="Ackumulerad avskrivning" value={fmt(totalDep)} unit="kr" />
                </div>
                {assets.length === 0 ? <EmptyModuleState icon={KeyRound} title="Inga IP-tillgångar" description="Registrera immateriella tillgångar med aktivering och avskrivningsplan (konto 1010/1020)." actionLabel="Ny tillgång" onAction={openNew} /> : (
                  <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Tillgång</TableHead><TableHead className="font-medium">Typ</TableHead><TableHead className="font-medium">Konto</TableHead><TableHead className="font-medium text-right">Anskaffning</TableHead><TableHead className="font-medium text-right">Avskrivning</TableHead><TableHead className="font-medium text-right">Bokfört</TableHead><TableHead className="font-medium">Metod</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                    <TableBody>{assets.map(a => (
                      <TableRow key={a.id}><TableCell className="font-medium">{a.name}</TableCell><TableCell>{a.type}</TableCell><TableCell className="font-mono">{a.account}</TableCell><TableCell className="text-right tabular-nums">{fmt(a.acquisitionCost)} kr</TableCell><TableCell className="text-right tabular-nums">{fmt(a.accumulatedDep)} kr</TableCell><TableCell className={cn('text-right tabular-nums', a.bookValue === 0 && 'text-muted-foreground')}>{fmt(a.bookValue)} kr</TableCell><TableCell><StatusBadge label={a.depMethod} variant={a.depMethod === 'Linjär' ? 'info' : 'neutral'} /></TableCell>
                        <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                    ))}</TableBody></Table></div>
                )}
                {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
              </>
            )}
          </TabsContent>
          <TabsContent value="regler"><div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-3"><h3 className="text-sm font-semibold">IP-tillgångar i mediabranschen</h3><ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4"><li>Konto <strong>1010</strong> - Immateriella rättigheter (upphovsrätt, patent)</li><li>Konto <strong>1020</strong> - Varumärken, domännamn</li><li>Linjär avskrivning över nyttjandeperioden (typiskt 3-10 år)</li><li>Nedskrivningsprövning vid tecken på värdeminskning</li><li>Internt upparbetade tillgångar: aktivera utvecklingskostnader om kriterierna i K3/IFRS uppfylls</li></ul></div></TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny IP-tillgång'}</DialogTitle><DialogDescription>Registrera immateriell tillgång.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Varumärke X" /></div><div className="grid gap-2"><Label>Typ</Label><Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as AssetType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Konto</Label><Input value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} placeholder="1010" /></div><div className="grid gap-2"><Label>Anskaffningsdatum</Label><Input type="date" value={form.acquisitionDate} onChange={e => setForm(f => ({ ...f, acquisitionDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Nyttjandeperiod (år)</Label><Input type="number" value={form.usefulLife || ''} onChange={e => setForm(f => ({ ...f, usefulLife: parseInt(e.target.value) || 0 }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Anskaffningsvärde (kr) *</Label><Input type="number" value={form.acquisitionCost || ''} onChange={e => setForm(f => ({ ...f, acquisitionCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Ack. avskrivning (kr)</Label><Input type="number" value={form.accumulatedDep || ''} onChange={e => setForm(f => ({ ...f, accumulatedDep: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Avskrivningsmetod</Label><Select value={form.depMethod} onValueChange={v => setForm(f => ({ ...f, depMethod: v as DepMethod }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DEP_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Beräknat bokfört värde: <strong>{fmt(Math.max(0, form.acquisitionCost - (form.depMethod === 'Linjär' ? form.accumulatedDep : 0)))} kr</strong>{form.depMethod === 'Linjär' && form.usefulLife > 0 && <> | Årlig avskrivning: <strong>{fmt(Math.round(form.acquisitionCost / form.usefulLife))} kr</strong></>}</p></div>
          <div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim() || form.acquisitionCost <= 0}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
