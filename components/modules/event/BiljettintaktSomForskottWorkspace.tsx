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
import { Plus, Pencil, Trash2, Loader2, Ticket } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface AdvanceEntry { id: string; event: string; saleDate: string; eventDate: string; amount: number; recognized: boolean; account: string }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const EMPTY_FORM = { event: '', saleDate: '', eventDate: '', amount: 0, recognized: false, account: '2420' }

export function BiljettintaktSomForskottWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<AdvanceEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<AdvanceEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<AdvanceEntry | null>(null)

  const saveItems = useCallback(async (items: AdvanceEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'advance_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'advance_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as AdvanceEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalAdvance = entries.filter(e => !e.recognized).reduce((s, e) => s + e.amount, 0)
  const totalRecognized = entries.filter(e => e.recognized).reduce((s, e) => s + e.amount, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: AdvanceEntry) { setEditing(e); setForm({ event: e.event, saleDate: e.saleDate, eventDate: e.eventDate, amount: e.amount, recognized: e.recognized, account: e.account }); setDialogOpen(true) }
  async function handleSave() { const item: AdvanceEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, event: form.event.trim() }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }
  async function toggleRecognized(id: string) { const updated = entries.map(e => e.id === id ? { ...e, recognized: !e.recognized } : e); setEntries(updated); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="poster">Poster</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Ticket} title="Inga förskottsbiljetter" description="Biljettförsäljning före eventdatum bokförs som skuld (konto 2420) och intäktsredovisas vid eventet." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><KPICard label="Oredovisade förskott" value={fmt(totalAdvance)} unit="kr" /><KPICard label="Intäktsredovisat" value={fmt(totalRecognized)} unit="kr" /><KPICard label="Antal poster" value={String(entries.length)} unit="st" /></div>
            )}
          </TabsContent>
          <TabsContent value="poster" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Sälj.datum</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Eventdatum</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Belopp</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Konto</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>
              {entries.sort((a, b) => b.saleDate.localeCompare(a.saleDate)).map(e => <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.event}</td><td className="px-4 py-3">{e.saleDate}</td><td className="px-4 py-3">{e.eventDate}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.amount)}</td><td className="px-4 py-3 font-mono text-xs">{e.account}</td><td className="px-4 py-3"><Button variant="outline" size="sm" onClick={() => toggleRecognized(e.id)}>{e.recognized ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">Redovisad</Badge> : <Badge variant="secondary" className="bg-amber-100 text-amber-800">Förskott</Badge>}</Button></td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}
            </tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny förskottspost'}</DialogTitle><DialogDescription>Registrera biljettförskott.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>Event *</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Försäljningsdatum</Label><Input type="date" value={form.saleDate} onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Eventdatum</Label><Input type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Belopp (kr)</Label><Input type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Konto</Label><Input value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.event.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
