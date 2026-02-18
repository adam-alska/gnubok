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
import { Plus, Pencil, Trash2, Loader2, Users } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface RevenueRecord { id: string; consultant: string; period: string; revenue: number; budget: number }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const EMPTY_FORM = { consultant: '', period: '', revenue: 0, budget: 0 }

export function IntaktPerKonsultWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<RevenueRecord[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<RevenueRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<RevenueRecord | null>(null)

  const saveRecords = useCallback(async (r: RevenueRecord[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'revenue_records', config_value: r }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'revenue_records').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setRecords(data.config_value as RevenueRecord[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalRevenue = records.reduce((s, r) => s + r.revenue, 0)
  const totalBudget = records.reduce((s, r) => s + r.budget, 0)
  const consultants = [...new Set(records.map(r => r.consultant))]
  const perConsultant = consultants.map(c => { const rs = records.filter(r => r.consultant === c); return { consultant: c, revenue: rs.reduce((s, r) => s + r.revenue, 0), budget: rs.reduce((s, r) => s + r.budget, 0) } }).sort((a, b) => b.revenue - a.revenue)

  function openNew() { setEditingRecord(null); setForm({ ...EMPTY_FORM, period: new Date().toISOString().slice(0, 7) }); setDialogOpen(true) }
  function openEdit(r: RevenueRecord) { setEditingRecord(r); setForm({ consultant: r.consultant, period: r.period, revenue: r.revenue, budget: r.budget }); setDialogOpen(true) }
  async function handleSave() { const nr: RevenueRecord = { id: editingRecord?.id ?? crypto.randomUUID(), ...form, consultant: form.consultant.trim() }; const updated = editingRecord ? records.map(r => r.id === editingRecord.id ? nr : r) : [...records, nr]; setRecords(updated); setDialogOpen(false); await saveRecords(updated) }
  async function handleDelete() { if (!recordToDelete) return; const updated = records.filter(r => r.id !== recordToDelete.id); setRecords(updated); setDeleteDialogOpen(false); setRecordToDelete(null); await saveRecords(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Konsult" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        <Tabs defaultValue="ranking" className="space-y-6">
          <TabsList><TabsTrigger value="ranking">Ranking</TabsTrigger><TabsTrigger value="detaljer">Detaljer</TabsTrigger></TabsList>
          <TabsContent value="ranking" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : records.length === 0 ? <EmptyModuleState icon={Users} title="Ingen intäktsdata" description="Registrera intäkt per konsult med budget vs utfall." actionLabel="Ny post" onAction={openNew} /> : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><KPICard label="Total intäkt" value={fmt(totalRevenue)} unit="kr" /><KPICard label="Total budget" value={fmt(totalBudget)} unit="kr" /><KPICard label="Budget vs Utfall" value={totalBudget > 0 ? `${((totalRevenue / totalBudget) * 100).toFixed(1)}` : '-'} unit="%" trend={totalRevenue >= totalBudget ? 'up' : 'down'} /></div>
                <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b border-border"><th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Konsult</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Intäkt (kr)</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Budget (kr)</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Utfall %</th></tr></thead><tbody>
                  {perConsultant.map((c, i) => (<tr key={c.consultant} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{i + 1}</td><td className="px-4 py-3 font-medium">{c.consultant}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(c.revenue)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(c.budget)}</td><td className="px-4 py-3 text-right tabular-nums font-medium">{c.budget > 0 ? ((c.revenue / c.budget) * 100).toFixed(1) : '-'}%</td></tr>))}
                </tbody></table></div>
              </>
            )}
          </TabsContent>
          <TabsContent value="detaljer" className="space-y-4">
            {records.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Konsult</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Period</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Intäkt</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Budget</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{records.sort((a, b) => b.period.localeCompare(a.period)).map(r => (<tr key={r.id} className="border-b last:border-0"><td className="px-4 py-3">{r.consultant}</td><td className="px-4 py-3">{r.period}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(r.revenue)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(r.budget)}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setRecordToDelete(r); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>))}</tbody></table></div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editingRecord ? 'Redigera' : 'Ny intäktspost'}</DialogTitle><DialogDescription>Ange intäkt och budget per konsult.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Konsult *</Label><Input value={form.consultant} onChange={e => setForm(f => ({ ...f, consultant: e.target.value }))} /></div><div className="grid gap-2"><Label>Period *</Label><Input type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Intäkt (kr)</Label><Input type="number" min={0} value={form.revenue} onChange={e => setForm(f => ({ ...f, revenue: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Budget (kr)</Label><Input type="number" min={0} value={form.budget} onChange={e => setForm(f => ({ ...f, budget: parseFloat(e.target.value) || 0 }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.consultant.trim() || !form.period}>{editingRecord ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
