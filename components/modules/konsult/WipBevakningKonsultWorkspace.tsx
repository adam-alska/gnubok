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
import { Plus, Pencil, Trash2, Loader2, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface WipEntry { id: string; assignment: string; client: string; wipAmount: number; startDate: string; lastBilledDate: string; account: string }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

function daysSince(dateStr: string): number { const d = new Date(dateStr); const now = new Date(); return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)) }

const EMPTY_FORM = { assignment: '', client: '', wipAmount: 0, startDate: '', lastBilledDate: '', account: '1470' }

export function WipBevakningKonsultWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<WipEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<WipEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<WipEntry | null>(null)

  const saveEntries = useCallback(async (e: WipEntry[]) => {
    setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'wip_entries', config_value: e }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'wip_entries').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as WipEntry[]); setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalWip = entries.reduce((s, e) => s + e.wipAmount, 0)
  const over30 = entries.filter(e => e.lastBilledDate && daysSince(e.lastBilledDate) > 30)
  const over60 = entries.filter(e => e.lastBilledDate && daysSince(e.lastBilledDate) > 60)

  function openNew() { setEditingEntry(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(entry: WipEntry) { setEditingEntry(entry); setForm({ assignment: entry.assignment, client: entry.client, wipAmount: entry.wipAmount, startDate: entry.startDate, lastBilledDate: entry.lastBilledDate, account: entry.account }); setDialogOpen(true) }

  async function handleSave() {
    const newEntry: WipEntry = { id: editingEntry?.id ?? crypto.randomUUID(), ...form, assignment: form.assignment.trim(), client: form.client.trim() }
    const updated = editingEntry ? entries.map(e => e.id === editingEntry.id ? newEntry : e) : [...entries, newEntry]
    setEntries(updated); setDialogOpen(false); await saveEntries(updated)
  }

  async function handleDelete() { if (!entryToDelete) return; const updated = entries.filter(e => e.id !== entryToDelete.id); setEntries(updated); setDeleteDialogOpen(false); setEntryToDelete(null); await saveEntries(updated) }

  function agingBadge(lastBilled: string) {
    const days = daysSince(lastBilled)
    if (days > 60) return <Badge variant="secondary" className="bg-red-100 text-red-800">{days} dagar</Badge>
    if (days > 30) return <Badge variant="secondary" className="bg-amber-100 text-amber-800">{days} dagar</Badge>
    return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">{days} dagar</Badge>
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Konsult" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny WIP-post</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="uppdrag">Per uppdrag</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Clock} title="Ingen WIP-bevakning" description="Följ pågående konsultuppdrag (konto 1470) med ålderanalys per uppdrag." actionLabel="Ny WIP-post" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total WIP" value={fmt(totalWip)} unit="kr" />
                <KPICard label="Antal uppdrag" value={String(entries.length)} unit="st" />
                <KPICard label="> 30 dagar" value={String(over30.length)} unit="st" trend={over30.length > 0 ? 'down' : 'neutral'} />
                <KPICard label="> 60 dagar" value={String(over60.length)} unit="st" trend={over60.length > 0 ? 'down' : 'neutral'} />
              </div>
            )}
          </TabsContent>
          <TabsContent value="uppdrag" className="space-y-4">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Clock} title="Inga WIP-poster" description="Lägg till poster." actionLabel="Ny WIP-post" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b border-border"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Uppdrag</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Klient</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">WIP (kr)</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Konto</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Sedan fakturering</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>
                {entries.sort((a, b) => b.wipAmount - a.wipAmount).map(e => (<tr key={e.id} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{e.assignment}</td><td className="px-4 py-3">{e.client}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{fmt(e.wipAmount)}</td><td className="px-4 py-3 font-mono text-xs">{e.account}</td><td className="px-4 py-3">{e.lastBilledDate ? agingBadge(e.lastBilledDate) : '-'}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>))}
              </tbody></table></div>
            )}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editingEntry ? 'Redigera WIP' : 'Ny WIP-post'}</DialogTitle><DialogDescription>Registrera pågående arbete per uppdrag.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Uppdrag *</Label><Input value={form.assignment} onChange={e => setForm(f => ({ ...f, assignment: e.target.value }))} /></div><div className="grid gap-2"><Label>Klient *</Label><Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>WIP-belopp (kr)</Label><Input type="number" min={0} value={form.wipAmount} onChange={e => setForm(f => ({ ...f, wipAmount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Konto</Label><Input value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} placeholder="1470" /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Startdatum</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Senast fakturerat</Label><Input type="date" value={form.lastBilledDate} onChange={e => setForm(f => ({ ...f, lastBilledDate: e.target.value }))} /></div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.assignment.trim() || !form.client.trim()}>{editingEntry ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort WIP-post</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
