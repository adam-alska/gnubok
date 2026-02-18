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
import { Plus, Pencil, Trash2, Loader2, PieChart } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface SponsorShareEntry { id: string; event: string; sponsor: string; sponsorAmount: number; totalRevenue: number; period: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtPct(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n) }
const EMPTY_FORM = { event: '', sponsor: '', sponsorAmount: 0, totalRevenue: 0, period: '' }

export function SponsorandelWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<SponsorShareEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<SponsorShareEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<SponsorShareEntry | null>(null)

  const saveItems = useCallback(async (items: SponsorShareEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'sponsor_share', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'sponsor_share').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as SponsorShareEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalSponsor = entries.reduce((s, e) => s + e.sponsorAmount, 0)
  const totalRevenue = entries.reduce((s, e) => s + e.totalRevenue, 0)
  const avgShare = totalRevenue > 0 ? (totalSponsor / totalRevenue) * 100 : 0
  const uniqueSponsors = new Set(entries.map(e => e.sponsor)).size

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: SponsorShareEntry) { setEditing(e); setForm({ event: e.event, sponsor: e.sponsor, sponsorAmount: e.sponsorAmount, totalRevenue: e.totalRevenue, period: e.period }); setDialogOpen(true) }
  async function handleSave() { const item: SponsorShareEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, event: form.event.trim(), sponsor: form.sponsor.trim() }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="detaljer">Detaljer</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={PieChart} title="Inga sponsordata" description="Analysera sponsorintäkternas andel av total omsättning per event och sponsor." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Sponsorandel" value={fmtPct(avgShare)} unit="%" /><KPICard label="Sponsorintäkter" value={fmt(totalSponsor)} unit="kr" /><KPICard label="Total omsättning" value={fmt(totalRevenue)} unit="kr" /><KPICard label="Unika sponsorer" value={String(uniqueSponsors)} unit="st" /></div>
            )}
          </TabsContent>
          <TabsContent value="detaljer" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Sponsor</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Sponsorbelopp</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Total oms.</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Andel</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.map(e => { const share = e.totalRevenue > 0 ? (e.sponsorAmount / e.totalRevenue) * 100 : 0; return <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.event}</td><td className="px-4 py-3">{e.sponsor}</td><td className="px-4 py-3">{e.period}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.sponsorAmount)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.totalRevenue)}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmtPct(share)}%</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr> })}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny sponsorandel'}</DialogTitle><DialogDescription>Registrera sponsorintäkt och total omsättning.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Event *</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div><div className="grid gap-2"><Label>Sponsor *</Label><Input value={form.sponsor} onChange={e => setForm(f => ({ ...f, sponsor: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Sponsorbelopp (kr)</Label><Input type="number" min={0} value={form.sponsorAmount} onChange={e => setForm(f => ({ ...f, sponsorAmount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Total omsättning (kr)</Label><Input type="number" min={0} value={form.totalRevenue} onChange={e => setForm(f => ({ ...f, totalRevenue: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid gap-2"><Label>Period</Label><Input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="t.ex. 2024-Q3" /></div>{form.totalRevenue > 0 && <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">Sponsorandel: <span className="font-semibold">{fmtPct((form.sponsorAmount / form.totalRevenue) * 100)}%</span></div>}</div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.event.trim() || !form.sponsor.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
