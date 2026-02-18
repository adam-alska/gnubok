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
import { Plus, Pencil, Trash2, Loader2, BarChart3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type LineType = 'Intäkt' | 'Kostnad'
type BudgetCategory = 'Biljetter' | 'Sponsorer' | 'F&B' | 'Merch' | 'Artister' | 'Teknik' | 'Personal' | 'Lokal' | 'Marknadsföring' | 'Övrigt'
interface BudgetLine { id: string; event: string; category: BudgetCategory; type: LineType; budget: number; actual: number }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const CATEGORIES: BudgetCategory[] = ['Biljetter', 'Sponsorer', 'F&B', 'Merch', 'Artister', 'Teknik', 'Personal', 'Lokal', 'Marknadsföring', 'Övrigt']
const LINE_TYPES: LineType[] = ['Intäkt', 'Kostnad']
const EMPTY_FORM = { event: '', category: 'Biljetter' as BudgetCategory, type: 'Intäkt' as LineType, budget: 0, actual: 0 }

export function BudgetVsUtfallWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [lines, setLines] = useState<BudgetLine[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<BudgetLine | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<BudgetLine | null>(null); const [filterEvent, setFilterEvent] = useState('all')

  const saveItems = useCallback(async (items: BudgetLine[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'budget_lines', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'budget_lines').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setLines(data.config_value as BudgetLine[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const events = [...new Set(lines.map(l => l.event))]
  const filtered = filterEvent === 'all' ? lines : lines.filter(l => l.event === filterEvent)
  const budgetRevenue = filtered.filter(l => l.type === 'Intäkt').reduce((s, l) => s + l.budget, 0)
  const actualRevenue = filtered.filter(l => l.type === 'Intäkt').reduce((s, l) => s + l.actual, 0)
  const budgetCost = filtered.filter(l => l.type === 'Kostnad').reduce((s, l) => s + l.budget, 0)
  const actualCost = filtered.filter(l => l.type === 'Kostnad').reduce((s, l) => s + l.actual, 0)
  const budgetResult = budgetRevenue - budgetCost
  const actualResult = actualRevenue - actualCost

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(l: BudgetLine) { setEditing(l); setForm({ event: l.event, category: l.category, type: l.type, budget: l.budget, actual: l.actual }); setDialogOpen(true) }
  async function handleSave() { const item: BudgetLine = { id: editing?.id ?? crypto.randomUUID(), ...form, event: form.event.trim() }; const updated = editing ? lines.map(l => l.id === editing.id ? item : l) : [...lines, item]; setLines(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = lines.filter(l => l.id !== toDelete.id); setLines(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Event" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny rad</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="detaljer">Detaljer</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            <div className="flex items-center gap-3">
              <Select value={filterEvent} onValueChange={setFilterEvent}><SelectTrigger className="w-[220px]"><SelectValue placeholder="Filtrera event" /></SelectTrigger><SelectContent><SelectItem value="all">Alla event</SelectItem>{events.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select>
            </div>
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <EmptyModuleState icon={BarChart3} title="Ingen budgetdata" description="Jämför budget mot utfall per event, kategori och intäkt/kostnad." actionLabel="Ny rad" onAction={openNew} /> : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Budget resultat" value={fmt(budgetResult)} unit="kr" /><KPICard label="Utfall resultat" value={fmt(actualResult)} unit="kr" /><KPICard label="Avvikelse" value={fmt(actualResult - budgetResult)} unit="kr" /><KPICard label="Utfall %" value={budgetResult !== 0 ? `${((actualResult / budgetResult) * 100).toFixed(1)}` : '0'} unit="%" /></div>
                <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase mb-3">Intäkter</p><div className="flex justify-between text-sm"><span>Budget</span><span className="font-medium tabular-nums">{fmt(budgetRevenue)} kr</span></div><div className="flex justify-between text-sm mt-1"><span>Utfall</span><span className="font-medium tabular-nums">{fmt(actualRevenue)} kr</span></div><div className="flex justify-between text-sm mt-1 pt-1 border-t"><span>Avvikelse</span><span className={`font-medium tabular-nums ${actualRevenue >= budgetRevenue ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(actualRevenue - budgetRevenue)} kr</span></div></div><div className="rounded-xl border border-border bg-card p-5"><p className="text-xs font-medium text-muted-foreground uppercase mb-3">Kostnader</p><div className="flex justify-between text-sm"><span>Budget</span><span className="font-medium tabular-nums">{fmt(budgetCost)} kr</span></div><div className="flex justify-between text-sm mt-1"><span>Utfall</span><span className="font-medium tabular-nums">{fmt(actualCost)} kr</span></div><div className="flex justify-between text-sm mt-1 pt-1 border-t"><span>Avvikelse</span><span className={`font-medium tabular-nums ${actualCost <= budgetCost ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(actualCost - budgetCost)} kr</span></div></div></div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="detaljer" className="space-y-4">
            {filtered.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Event</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Kategori</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Typ</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Budget</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Utfall</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Avvikelse</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{filtered.map(l => { const diff = l.actual - l.budget; const isGood = l.type === 'Intäkt' ? diff >= 0 : diff <= 0; return <tr key={l.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{l.event}</td><td className="px-4 py-3">{l.category}</td><td className="px-4 py-3"><Badge variant="outline" className={l.type === 'Intäkt' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>{l.type}</Badge></td><td className="px-4 py-3 text-right tabular-nums">{fmt(l.budget)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(l.actual)}</td><td className={`px-4 py-3 text-right tabular-nums font-medium ${isGood ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(diff)}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(l); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr> })}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny budgetrad'}</DialogTitle><DialogDescription>Registrera budget och utfall per kategori.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid gap-2"><Label>Event *</Label><Input value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} /></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Kategori</Label><Select value={form.category} onValueChange={val => setForm(f => ({ ...f, category: val as BudgetCategory }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Typ</Label><Select value={form.type} onValueChange={val => setForm(f => ({ ...f, type: val as LineType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LINE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Budget (kr)</Label><Input type="number" min={0} value={form.budget} onChange={e => setForm(f => ({ ...f, budget: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Utfall (kr)</Label><Input type="number" min={0} value={form.actual} onChange={e => setForm(f => ({ ...f, actual: parseFloat(e.target.value) || 0 }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.event.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
