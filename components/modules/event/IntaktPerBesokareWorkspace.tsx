'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Loader2, Users } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface EventRevenueEntry { id: string; event: string; date: string; visitors: number; ticketRevenue: number; fbRevenue: number; merchRevenue: number; otherRevenue: number }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtDec(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(n) }
const EMPTY_FORM = { event: '', date: '', visitors: 0, ticketRevenue: 0, fbRevenue: 0, merchRevenue: 0, otherRevenue: 0 }

export function IntaktPerBesokareWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<EventRevenueEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<EventRevenueEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<EventRevenueEntry | null>(null)
  const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState('')

  const saveItems = useCallback(async (items: EventRevenueEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'revenue_per_visitor', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'revenue_per_visitor').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as EventRevenueEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = entries.filter(e => { if (fromDate && e.date < fromDate) return false; if (toDate && e.date > toDate) return false; return true })
  const totalVisitors = filtered.reduce((s, e) => s + e.visitors, 0)
  const totalRevenue = filtered.reduce((s, e) => s + e.ticketRevenue + e.fbRevenue + e.merchRevenue + e.otherRevenue, 0)
  const revenuePerVisitor = totalVisitors > 0 ? totalRevenue / totalVisitors : 0
  const ticketPerVisitor = totalVisitors > 0 ? filtered.reduce((s, e) => s + e.ticketRevenue, 0) / totalVisitors : 0

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] }); setDialogOpen(true) }
  function openEdit(e: EventRevenueEntry) { setEditing(e); setForm({ event: e.event, date: e.date, visitors: e.visitors, ticketRevenue: e.ticketRevenue, fbRevenue: e.fbRevenue, merchRevenue: e.merchRevenue, otherRevenue: e.otherRevenue }); setDialogOpen(true) }
  async function handleSave() { const item: EventRevenueEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, event: form.event.trim() }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="detaljer">Detaljer</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            <DateRangeFilter from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <EmptyModuleState icon={Users} title="Inga eventdata" description="Registrera besökarantal och intäkter per event för att beräkna intäkt per besökare." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Intäkt/besökare" value={fmtDec(revenuePerVisitor)} unit="kr" /><KPICard label="Biljett/besökare" value={fmtDec(ticketPerVisitor)} unit="kr" /><KPICard label="Totala besökare" value={fmt(totalVisitors)} unit="st" /><KPICard label="Total intäkt" value={fmt(totalRevenue)} unit="kr" /></div>
            )}
          </TabsContent>
          <TabsContent value="detaljer" className="space-y-4">
            {filtered.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Datum</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Besökare</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Biljetter</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">F&B</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Merch</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Totalt</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">kr/besökare</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{filtered.sort((a, b) => b.date.localeCompare(a.date)).map(e => { const total = e.ticketRevenue + e.fbRevenue + e.merchRevenue + e.otherRevenue; const perV = e.visitors > 0 ? total / e.visitors : 0; return <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.event}</td><td className="px-4 py-3">{e.date}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.visitors)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.ticketRevenue)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.fbRevenue)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.merchRevenue)}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(total)}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmtDec(perV)}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr> })}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny eventpost'}</DialogTitle><DialogDescription>Registrera besökare och intäkter per event.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Event *</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div><div className="grid gap-2"><Label>Datum</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Antal besökare</Label><Input type="number" min={0} value={form.visitors} onChange={e => setForm(f => ({ ...f, visitors: parseInt(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Biljettintäkter (kr)</Label><Input type="number" min={0} value={form.ticketRevenue} onChange={e => setForm(f => ({ ...f, ticketRevenue: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>F&B (kr)</Label><Input type="number" min={0} value={form.fbRevenue} onChange={e => setForm(f => ({ ...f, fbRevenue: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Merch (kr)</Label><Input type="number" min={0} value={form.merchRevenue} onChange={e => setForm(f => ({ ...f, merchRevenue: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Övrigt (kr)</Label><Input type="number" min={0} value={form.otherRevenue} onChange={e => setForm(f => ({ ...f, otherRevenue: parseFloat(e.target.value) || 0 }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.event.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
