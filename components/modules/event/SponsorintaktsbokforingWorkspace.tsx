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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Handshake } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type PeriodStatus = 'Förskott' | 'Periodiserad' | 'Intäktsförd'
interface SponsorEntry { id: string; sponsor: string; event: string; totalAmount: number; periodStart: string; periodEnd: string; recognizedAmount: number; status: PeriodStatus; account: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const STATUSES: PeriodStatus[] = ['Förskott', 'Periodiserad', 'Intäktsförd']
const STATUS_COLORS: Record<PeriodStatus, string> = { 'Förskott': 'bg-amber-100 text-amber-800', 'Periodiserad': 'bg-blue-100 text-blue-800', 'Intäktsförd': 'bg-emerald-100 text-emerald-800' }
const EMPTY_FORM = { sponsor: '', event: '', totalAmount: 0, periodStart: '', periodEnd: '', recognizedAmount: 0, status: 'Förskott' as PeriodStatus, account: '3910' }

export function SponsorintaktsbokforingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<SponsorEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<SponsorEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<SponsorEntry | null>(null)

  const saveItems = useCallback(async (items: SponsorEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'sponsor_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'sponsor_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as SponsorEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalContract = entries.reduce((s, e) => s + e.totalAmount, 0)
  const totalRecognized = entries.reduce((s, e) => s + e.recognizedAmount, 0)
  const totalDeferred = totalContract - totalRecognized

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: SponsorEntry) { setEditing(e); setForm({ sponsor: e.sponsor, event: e.event, totalAmount: e.totalAmount, periodStart: e.periodStart, periodEnd: e.periodEnd, recognizedAmount: e.recognizedAmount, status: e.status, account: e.account }); setDialogOpen(true) }
  async function handleSave() { const item: SponsorEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, sponsor: form.sponsor.trim(), event: form.event.trim() }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="poster">Poster</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Handshake} title="Inga sponsorposter" description="Periodisera sponsorintäkter över avtalsperioden. Konto 3910 för upplupna, 2970 för förskott." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Totalt avtalat" value={fmt(totalContract)} unit="kr" /><KPICard label="Intäktsredovisat" value={fmt(totalRecognized)} unit="kr" /><KPICard label="Periodiserat kvar" value={fmt(totalDeferred)} unit="kr" /><KPICard label="Antal avtal" value={String(entries.length)} unit="st" /></div>
            )}
          </TabsContent>
          <TabsContent value="poster" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Sponsor</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Avtal</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Redovisat</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Konto</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.map(e => <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.sponsor}</td><td className="px-4 py-3">{e.event}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.totalAmount)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.recognizedAmount)}</td><td className="px-4 py-3 text-xs">{e.periodStart} - {e.periodEnd}</td><td className="px-4 py-3"><Badge variant="secondary" className={STATUS_COLORS[e.status]}>{e.status}</Badge></td><td className="px-4 py-3 font-mono text-xs">{e.account}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny sponsorpost'}</DialogTitle><DialogDescription>Registrera sponsoravtal och periodisering.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Sponsor *</Label><Input value={form.sponsor} onChange={e => setForm(f => ({ ...f, sponsor: e.target.value }))} /></div><div className="grid gap-2"><Label>Event *</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Avtalsbelopp (kr)</Label><Input type="number" min={0} value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Redovisat (kr)</Label><Input type="number" min={0} value={form.recognizedAmount} onChange={e => setForm(f => ({ ...f, recognizedAmount: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Period från</Label><Input type="date" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} /></div><div className="grid gap-2"><Label>Period till</Label><Input type="date" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as PeriodStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Konto</Label><Input value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.sponsor.trim() || !form.event.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
