'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, ShieldCheck } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type CheckStatus = 'godkand' | 'pagaende' | 'saknas' | 'utgangen'
interface Item { id: string; employee: string; check_type: string; status: CheckStatus; verified_date: string; expiry_date: string; notes: string }
const STATUS_LABELS: Record<CheckStatus, string> = { godkand: 'Godkänd', pagaende: 'Pågående', saknas: 'Saknas', utgangen: 'Utgången' }
const STATUS_VARIANT: Record<CheckStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { godkand: 'success', pagaende: 'warning', saknas: 'danger', utgangen: 'neutral' }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }

const DEFAULT_ITEMS: Item[] = [
  { id: '1', employee: 'Anna S', check_type: 'Belastningsregister', status: 'godkand', verified_date: '2025-01-15', expiry_date: '2026-01-15', notes: '' },
  { id: '2', employee: 'Johan L', check_type: 'ID-kontroll', status: 'godkand', verified_date: '2025-02-01', expiry_date: '', notes: '' },
  { id: '3', employee: 'Erik M', check_type: 'Arbetsgivarintyg', status: 'saknas', verified_date: '', expiry_date: '', notes: 'Inväntar från tidigare arbetsgivare' },
]
const EMPTY_FORM = { employee: '', check_type: '', status: 'saknas' as CheckStatus, verified_date: '', expiry_date: '', notes: '' }

export function ComplianceBemanningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'compliance', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'compliance').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'compliance', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.employee.toLowerCase().includes(q) || i.check_type.toLowerCase().includes(q)) }; return r.sort((a, b) => a.employee.localeCompare(b.employee)) }, [items, searchQuery])
  const stats = useMemo(() => ({ total: items.length, godkand: items.filter(i => i.status === 'godkand').length, saknas: items.filter(i => i.status === 'saknas').length, utgangen: items.filter(i => i.status === 'utgangen').length }), [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ employee: i.employee, check_type: i.check_type, status: i.status, verified_date: i.verified_date, expiry_date: i.expiry_date, notes: i.notes }); setDialogOpen(true) }
  async function handleSave() { const entry: Item = { id: editing?.id ?? generateId(), employee: form.employee.trim(), check_type: form.check_type.trim(), status: form.status, verified_date: form.verified_date, expiry_date: form.expiry_date, notes: form.notes.trim() }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Bemanning & HR" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny kontroll</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt kontroller</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.total}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Godkända</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-emerald-600">{stats.godkand}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saknas</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-red-600">{stats.saknas}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Utgångna</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-amber-600">{stats.utgangen}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök anställd eller kontrolltyp..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={ShieldCheck} title="Inga kontroller" description="Lägg till compliance-kontroller för anställda." actionLabel="Ny kontroll" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Anställd</TableHead><TableHead className="font-medium">Kontrolltyp</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium">Verifierad</TableHead><TableHead className="font-medium">Utgår</TableHead><TableHead className="font-medium">Anteckningar</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-medium">{i.employee}</TableCell><TableCell>{i.check_type}</TableCell><TableCell><StatusBadge label={STATUS_LABELS[i.status]} variant={STATUS_VARIANT[i.status]} /></TableCell><TableCell>{i.verified_date || '-'}</TableCell><TableCell>{i.expiry_date || '-'}</TableCell><TableCell className="max-w-[200px] truncate">{i.notes}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera kontroll' : 'Ny compliance-kontroll'}</DialogTitle><DialogDescription>Verifiera bakgrundskontroller, ID och arbetsrättsliga krav.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Anställd *</Label><Input value={form.employee} onChange={(e) => setForm((f) => ({ ...f, employee: e.target.value }))} /></div><div className="grid gap-2"><Label>Kontrolltyp *</Label><Input value={form.check_type} onChange={(e) => setForm((f) => ({ ...f, check_type: e.target.value }))} placeholder="Belastningsregister" /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as CheckStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="godkand">Godkänd</SelectItem><SelectItem value="pagaende">Pågående</SelectItem><SelectItem value="saknas">Saknas</SelectItem><SelectItem value="utgangen">Utgången</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Verifierad</Label><Input type="date" value={form.verified_date} onChange={(e) => setForm((f) => ({ ...f, verified_date: e.target.value }))} /></div><div className="grid gap-2"><Label>Utgår</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} /></div></div><div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.employee.trim() || !form.check_type.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort kontroll</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.check_type}</span> för {toDelete?.employee}?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
