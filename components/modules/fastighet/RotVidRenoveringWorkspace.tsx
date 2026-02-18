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
import { Plus, Pencil, Trash2, Loader2, Hammer } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface RotEntry { id: string; property: string; tenant: string; workDescription: string; totalCost: number; laborCost: number; rotDeduction: number; year: string; invoiceDate: string; approved: boolean }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const ROT_RATE = 0.30
const ROT_MAX_PER_YEAR = 50000
const EMPTY_FORM = { property: '', tenant: '', workDescription: '', totalCost: 0, laborCost: 0, year: new Date().getFullYear().toString(), invoiceDate: '', approved: false }

export function RotVidRenoveringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<RotEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<RotEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<RotEntry | null>(null)

  const saveItems = useCallback(async (items: RotEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'rot_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'rot_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as RotEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalDeduction = entries.reduce((s, e) => s + e.rotDeduction, 0)
  const totalLabor = entries.reduce((s, e) => s + e.laborCost, 0)
  const totalCost = entries.reduce((s, e) => s + e.totalCost, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: RotEntry) { setEditing(e); setForm({ property: e.property, tenant: e.tenant, workDescription: e.workDescription, totalCost: e.totalCost, laborCost: e.laborCost, year: e.year, invoiceDate: e.invoiceDate, approved: e.approved }); setDialogOpen(true) }
  async function handleSave() { const rotDeduction = Math.min(form.laborCost * ROT_RATE, ROT_MAX_PER_YEAR); const item: RotEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, property: form.property.trim(), tenant: form.tenant.trim(), workDescription: form.workDescription.trim(), rotDeduction }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="poster">Poster</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Hammer} title="Inga ROT-poster" description="ROT-avdrag 30% på arbetskostnad, max 50 000 kr/år. Registrera renoverings-fakturor." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Total ROT-avdrag" value={fmt(totalDeduction)} unit="kr" /><KPICard label="Arbetskostnad" value={fmt(totalLabor)} unit="kr" /><KPICard label="Total kostnad" value={fmt(totalCost)} unit="kr" /><KPICard label="Antal poster" value={String(entries.length)} unit="st" /></div>
            )}
          </TabsContent>
          <TabsContent value="poster" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Fastighet</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Arbete</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Arbete</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">ROT-avdrag</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">År</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.map(e => <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.property}</td><td className="px-4 py-3">{e.workDescription}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.totalCost)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.laborCost)}</td><td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600">{fmt(e.rotDeduction)}</td><td className="px-4 py-3">{e.year}</td><td className="px-4 py-3">{e.approved ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">Godkänd</Badge> : <Badge variant="secondary" className="bg-amber-100 text-amber-800">Väntande</Badge>}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny ROT-post'}</DialogTitle><DialogDescription>Registrera renovering med ROT-avdrag.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Hyresgäst</Label><Input value={form.tenant} onChange={e => setForm(f => ({ ...f, tenant: e.target.value }))} /></div></div><div className="grid gap-2"><Label>Arbetsbeskrivning *</Label><Input value={form.workDescription} onChange={e => setForm(f => ({ ...f, workDescription: e.target.value }))} /></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Total kostnad (kr)</Label><Input type="number" min={0} value={form.totalCost} onChange={e => setForm(f => ({ ...f, totalCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Arbetskostnad (kr)</Label><Input type="number" min={0} value={form.laborCost} onChange={e => setForm(f => ({ ...f, laborCost: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>År</Label><Input value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} /></div><div className="grid gap-2"><Label>Fakturadatum</Label><Input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} /></div></div><div className="flex items-center gap-3"><input type="checkbox" checked={form.approved} onChange={e => setForm(f => ({ ...f, approved: e.target.checked }))} className="h-4 w-4" /><Label>Godkänd av Skatteverket</Label></div>{form.laborCost > 0 && <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">ROT-avdrag (30%): <span className="font-semibold">{fmt(Math.min(form.laborCost * ROT_RATE, ROT_MAX_PER_YEAR))} kr</span> (max {fmt(ROT_MAX_PER_YEAR)} kr/år)</div>}</div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.property.trim() || !form.workDescription.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
