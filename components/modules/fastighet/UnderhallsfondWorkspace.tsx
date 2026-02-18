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
import { Plus, Pencil, Trash2, Loader2, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type FundStatus = 'Planerad' | 'Avsatt' | 'Använd'
interface FundEntry { id: string; property: string; year: string; plannedAmount: number; actualAmount: number; purpose: string; status: FundStatus }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const STATUSES: FundStatus[] = ['Planerad', 'Avsatt', 'Använd']
const STATUS_COLORS: Record<FundStatus, string> = { 'Planerad': 'bg-blue-100 text-blue-800', 'Avsatt': 'bg-emerald-100 text-emerald-800', 'Använd': 'bg-gray-100 text-gray-800' }
const EMPTY_FORM = { property: '', year: new Date().getFullYear().toString(), plannedAmount: 0, actualAmount: 0, purpose: '', status: 'Planerad' as FundStatus }

export function UnderhallsfondWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [entries, setEntries] = useState<FundEntry[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<FundEntry | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<FundEntry | null>(null)

  const saveItems = useCallback(async (items: FundEntry[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'fund_entries', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'fund_entries').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setEntries(data.config_value as FundEntry[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const totalPlanned = entries.filter(e => e.status !== 'Använd').reduce((s, e) => s + e.plannedAmount, 0)
  const totalReserved = entries.filter(e => e.status === 'Avsatt').reduce((s, e) => s + e.actualAmount, 0)
  const totalUsed = entries.filter(e => e.status === 'Använd').reduce((s, e) => s + e.actualAmount, 0)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(e: FundEntry) { setEditing(e); setForm({ property: e.property, year: e.year, plannedAmount: e.plannedAmount, actualAmount: e.actualAmount, purpose: e.purpose, status: e.status }); setDialogOpen(true) }
  async function handleSave() { const item: FundEntry = { id: editing?.id ?? crypto.randomUUID(), ...form, property: form.property.trim(), purpose: form.purpose.trim() }; const updated = editing ? entries.map(e => e.id === editing.id ? item : e) : [...entries, item]; setEntries(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = entries.filter(e => e.id !== toDelete.id); setEntries(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Fastighet" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny avsättning</Button>}>
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList><TabsTrigger value="oversikt">Översikt</TabsTrigger><TabsTrigger value="poster">Poster</TabsTrigger></TabsList>
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : entries.length === 0 ? <EmptyModuleState icon={Wallet} title="Ingen underhållsfond" description="Planera 10-årig underhållsfond med årliga avsättningar per fastighet och ändamål." actionLabel="Ny avsättning" onAction={openNew} /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><KPICard label="Planerat kvar" value={fmt(totalPlanned)} unit="kr" /><KPICard label="Avsatt" value={fmt(totalReserved)} unit="kr" /><KPICard label="Använt" value={fmt(totalUsed)} unit="kr" /><KPICard label="Antal poster" value={String(entries.length)} unit="st" /></div>
            )}
          </TabsContent>
          <TabsContent value="poster" className="space-y-4">
            {entries.length > 0 && <div className="rounded-xl border border-border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-muted/50 border-b"><th className="text-left px-4 py-3 font-medium text-muted-foreground">Fastighet</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Ändamål</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">År</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Planerat</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Faktiskt</th><th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th><th className="text-right px-4 py-3 font-medium text-muted-foreground">Åtgärder</th></tr></thead><tbody>{entries.sort((a, b) => a.year.localeCompare(b.year)).map(e => <tr key={e.id} className="border-b last:border-0"><td className="px-4 py-3 font-medium">{e.property}</td><td className="px-4 py-3">{e.purpose}</td><td className="px-4 py-3">{e.year}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.plannedAmount)}</td><td className="px-4 py-3 text-right tabular-nums">{fmt(e.actualAmount)}</td><td className="px-4 py-3"><Badge variant="secondary" className={STATUS_COLORS[e.status]}>{e.status}</Badge></td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => { setToDelete(e); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>}
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny avsättning'}</DialogTitle><DialogDescription>Planera underhållsfond-avsättning.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Fastighet *</Label><Input value={form.property} onChange={e => setForm(f => ({ ...f, property: e.target.value }))} /></div><div className="grid gap-2"><Label>Ändamål *</Label><Input value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="t.ex. Takbyte, Stambyte" /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>År</Label><Input value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} /></div><div className="grid gap-2"><Label>Planerat (kr)</Label><Input type="number" min={0} value={form.plannedAmount} onChange={e => setForm(f => ({ ...f, plannedAmount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Faktiskt (kr)</Label><Input type="number" min={0} value={form.actualAmount} onChange={e => setForm(f => ({ ...f, actualAmount: parseFloat(e.target.value) || 0 }))} /></div></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as FundStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.property.trim() || !form.purpose.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
