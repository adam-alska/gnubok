'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, Calculator } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface Item { id: string; employee: string; month: string; gross_salary: number; contribution: number; account: string }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', employee: 'Anna S', month: '2025-03', gross_salary: 35000, contribution: 10997, account: '7510' },
  { id: '2', employee: 'Johan L', month: '2025-03', gross_salary: 42000, contribution: 13196, account: '7510' },
]
const EMPTY_FORM = { employee: '', month: '', gross_salary: '', contribution: '', account: '7510' }

export function ArbetsgivaravgifterPeriodiseringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'employer_contrib', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'employer_contrib').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'employer_contrib', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.employee.toLowerCase().includes(q)) }; return r.sort((a, b) => b.month.localeCompare(a.month)) }, [items, searchQuery])
  const stats = useMemo(() => ({ totalSalary: items.reduce((s, i) => s + i.gross_salary, 0), totalContrib: items.reduce((s, i) => s + i.contribution, 0), count: items.length, avgRate: items.length > 0 ? (items.reduce((s, i) => s + i.contribution, 0) / items.reduce((s, i) => s + i.gross_salary, 0)) * 100 : 0 }), [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ employee: i.employee, month: i.month, gross_salary: String(i.gross_salary), contribution: String(i.contribution), account: i.account }); setDialogOpen(true) }
  async function handleSave() { const gs = parseFloat(form.gross_salary) || 0; const contrib = form.contribution ? parseFloat(form.contribution) : Math.round(gs * 0.3142); const entry: Item = { id: editing?.id ?? generateId(), employee: form.employee.trim(), month: form.month, gross_salary: gs, contribution: contrib, account: form.account.trim() || '7510' }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Bemanning & HR" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny post</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total bruttolön</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalSalary)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Arbetsgivaravgifter (7510)</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalContrib)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Snitt sats</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.avgRate.toFixed(1)}</span><span className="text-sm text-muted-foreground ml-1">%</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Anställda</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.count}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök anställd..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={Calculator} title="Inga poster" description="Lägg till arbetsgivaravgifter per anställd och månad." actionLabel="Ny post" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Anställd</TableHead><TableHead className="font-medium">Månad</TableHead><TableHead className="font-medium text-right">Bruttolön</TableHead><TableHead className="font-medium text-right">Arbetsgivaravgift</TableHead><TableHead className="font-medium">Konto</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-medium">{i.employee}</TableCell><TableCell>{i.month}</TableCell><TableCell className="text-right tabular-nums">{fmt(i.gross_salary)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{fmt(i.contribution)}</TableCell><TableCell className="font-mono">{i.account}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny arbetsgivaravgift'}</DialogTitle><DialogDescription>Arbetsgivaravgiften beräknas automatiskt till 31.42% om du lämnar fältet tomt.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Anställd *</Label><Input value={form.employee} onChange={(e) => setForm((f) => ({ ...f, employee: e.target.value }))} /></div><div className="grid gap-2"><Label>Månad</Label><Input type="month" value={form.month} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Bruttolön (kr) *</Label><Input type="number" min={0} value={form.gross_salary} onChange={(e) => setForm((f) => ({ ...f, gross_salary: e.target.value }))} /></div><div className="grid gap-2"><Label>Avgift (kr)</Label><Input type="number" min={0} value={form.contribution} onChange={(e) => setForm((f) => ({ ...f, contribution: e.target.value }))} placeholder="Auto 31.42%" /></div><div className="grid gap-2"><Label>Konto</Label><Input value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} placeholder="7510" /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.employee.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker på att du vill ta bort posten för <span className="font-semibold">{toDelete?.employee}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
