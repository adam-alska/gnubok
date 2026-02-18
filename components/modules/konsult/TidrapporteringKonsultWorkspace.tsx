'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface TimeEntry { id: string; date: string; consultant: string; assignment: string; category: string; hours: number; billable: boolean; description: string }
const CATEGORIES = ['Konsulttid', 'Möte', 'Administration', 'Resrelaterad', 'Intern', 'Utbildning']
const EMPTY_FORM = { date: '', consultant: '', assignment: '', category: 'Konsulttid', hours: 0, billable: true, description: '' }

export function TidrapporteringKonsultWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<TimeEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<TimeEntry | null>(null)

  const saveItems = useCallback(async (items: TimeEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'time_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'time_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as TimeEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const today = new Date().toISOString().split('T')[0]
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0] })()
  const thisWeek = entries.filter(e => e.date >= weekStart)
  const totalWeekHours = thisWeek.reduce((s, e) => s + e.hours, 0)
  const billableWeekHours = thisWeek.filter(e => e.billable).reduce((s, e) => s + e.hours, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM, date: today }); setDialogOpen(true) }
  function openEdit(e: TimeEntry) { setEditing(e); setForm({ date: e.date, consultant: e.consultant, assignment: e.assignment, category: e.category, hours: e.hours, billable: e.billable, description: e.description }); setDialogOpen(true) }
  async function handleSave() { const item: TimeEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, consultant: form.consultant.trim(), assignment: form.assignment.trim(), description: form.description.trim() }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Konsult" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny tid</Button>}>
        <Tabs defaultValue="vecka" className="space-y-6">
          <TabsList><TabsTrigger value="vecka">Veckoöversikt</TabsTrigger><TabsTrigger value="alla">Alla poster</TabsTrigger></TabsList>
          <TabsContent value="vecka" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3 mb-4">
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Totalt denna vecka</p><p className="text-2xl font-semibold mt-1">{totalWeekHours}h</p></div>
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Debiteringsbart</p><p className="text-2xl font-semibold mt-1">{billableWeekHours}h</p></div>
              <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase">Debiteringsgrad</p><p className="text-2xl font-semibold mt-1">{totalWeekHours > 0 ? ((billableWeekHours / totalWeekHours) * 100).toFixed(1) : '0.0'}%</p></div>
            </div>
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : thisWeek.length === 0 ? <EmptyModuleState icon={Clock} title="Inga tidposter denna vecka" description="Registrera tid med timer, kategorier och koppling till uppdrag." actionLabel="Ny tid" onAction={openNew} /> : (
              <div className="space-y-2">{thisWeek.sort((a, b) => b.date.localeCompare(a.date)).map(e => (
                <div key={e.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0"><span className="text-xs text-muted-foreground w-20">{e.date}</span><span className="font-medium text-sm truncate">{e.assignment}</span><Badge variant="outline" className="text-xs">{e.category}</Badge>{e.billable && <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 text-xs">Debit.</Badge>}</div>
                  <div className="flex items-center gap-2"><span className="font-medium tabular-nums">{e.hours}h</span><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}</div>
            )}
          </TabsContent>
          <TabsContent value="alla" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Datum</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Konsult</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Uppdrag</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Kategori</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Timmar</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.sort((a, b) => b.date.localeCompare(a.date)).map(e => (<tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3">{e.date}</td><td className="px-4 py-3">{e.consultant}</td><td className="px-4 py-3 font-medium">{e.assignment}</td><td className="px-4 py-3">{e.category}</td><td className="px-4 py-3 text-right tabular-nums">{e.hours}h</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>))}</tbody></table></div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera tidpost' : 'Ny tidpost'}</DialogTitle><DialogDescription>Registrera tid mot uppdrag.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Timmar *</Label><Input type="number" min={0} step="0.25" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Konsult</Label><Input value={form.consultant} onChange={e => setForm(f => ({ ...f, consultant: e.target.value }))} /></div><div className="grid gap-2"><Label>Uppdrag *</Label><Input value={form.assignment} onChange={e => setForm(f => ({ ...f, assignment: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Kategori</Label><Select value={form.category} onValueChange={val => setForm(f => ({ ...f, category: val }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div className="flex items-center gap-3 pt-6"><input type="checkbox" checked={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))} className="h-4 w-4" /><Label>Debiteringsbar</Label></div></div><div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.date || !form.assignment.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort tidpost</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
