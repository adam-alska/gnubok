'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Loader2, TrendingUp } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface IndexEntry { id: string; tenant: string; property: string; baseRent: number; indexBase: number; currentIndex: number; adjustedRent: number; effectiveDate: string; indexType: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtPct(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n) }
const EMPTY_FORM = { tenant: '', property: '', baseRent: 0, indexBase: 100, currentIndex: 100, effectiveDate: '', indexType: 'KPI' }

export function IndexupprakningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<IndexEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<IndexEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<IndexEntry | null>(null)

  const saveItems = useCallback(async (items: IndexEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'index_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'index_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as IndexEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalBaseRent = entries.reduce((s, e) => s + e.baseRent, 0)
  const totalAdjusted = entries.reduce((s, e) => s + e.adjustedRent, 0)
  const totalIncrease = totalAdjusted - totalBaseRent
  const avgIncreaseRate = totalBaseRent > 0 ? ((totalAdjusted / totalBaseRent - 1) * 100) : 0

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: IndexEntry) { setEditing(e); setForm({ tenant: e.tenant, property: e.property, baseRent: e.baseRent, indexBase: e.indexBase, currentIndex: e.currentIndex, effectiveDate: e.effectiveDate, indexType: e.indexType }); setDialogOpen(true) }
  async function handleSave() { const adjustedRent = form.indexBase > 0 ? form.baseRent * (form.currentIndex / form.indexBase) : form.baseRent; const item: IndexEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, tenant: form.tenant.trim(), property: form.property.trim(), adjustedRent }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="poster">Poster</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={TrendingUp} title="Inga indexuppräkningar" description="Beräkna KPI-baserad hyreshöjning med basindex och aktuellt index." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Bashyra (totalt)" value={fmt(totalBaseRent)} unit="kr/mån" /><KPICard label="Justerad hyra" value={fmt(totalAdjusted)} unit="kr/mån" /><KPICard label="Total ökning" value={fmt(totalIncrease)} unit="kr/mån" /><KPICard label="Snitt ökning" value={fmtPct(avgIncreaseRate)} unit="%" /></div>
            )}
          </TabsContent>
          <TabsContent value="poster" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Hyresgäst</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Fastighet</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Bashyra</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Basindex</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Nuv. index</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Justerad hyra</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Ökning %</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.map(e => { const pctChange = e.indexBase > 0 ? ((e.currentIndex / e.indexBase - 1) * 100) : 0; return <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.tenant}</td><td className="px-4 py-3">{e.property}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.baseRent)}</td><td className="px-4 py-3 text-right tabular-nums">{e.indexBase}</td><td className="px-4 py-3 text-right tabular-nums">{e.currentIndex}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(e.adjustedRent)}</td><td className={`px-4 py-3 text-right tabular-nums ${pctChange > 0 ? 'text-emerald-600' : ''}`}>{fmtPct(pctChange)}%</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr> })}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny indexuppräkning'}</DialogTitle><DialogDescription>Beräkna KPI-baserad hyreshöjning.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Hyresgäst *</Label><Input value={form.tenant} onChange={e => setForm(f => ({ ...f, tenant: e.target.value }))} /></div><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Bashyra (kr/mån)</Label><Input type="number" min={0} value={form.baseRent} onChange={e => setForm(f => ({ ...f, baseRent: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Basindex</Label><Input type="number" min={1} value={form.indexBase} onChange={e => setForm(f => ({ ...f, indexBase: parseFloat(e.target.value) || 1 }))} /></div><div className="grid gap-2"><Label>Nuvarande index</Label><Input type="number" min={1} value={form.currentIndex} onChange={e => setForm(f => ({ ...f, currentIndex: parseFloat(e.target.value) || 1 }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Gäller från</Label><Input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Indextyp</Label><Input value={form.indexType} onChange={e => setForm(f => ({ ...f, indexType: e.target.value }))} placeholder="KPI" /></div></div>{form.baseRent > 0 && form.indexBase > 0 && <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">Justerad hyra: <span className="font-semibold">{fmt(form.baseRent * (form.currentIndex / form.indexBase))} kr/mån</span> (ökning {fmtPct(((form.currentIndex / form.indexBase) - 1) * 100)}%)</div>}</div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.tenant.trim() || !form.property.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
