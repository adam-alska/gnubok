'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, Award } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
interface Item { id: string; employee: string; competence: string; level: string; certification_date: string; expiry_date: string; issuer: string }
function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }

const LEVEL_COLORS: Record<string, string> = {
  'Junior': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Medel': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Senior': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Expert': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
}

const DEFAULT_ITEMS: Item[] = [
  { id: '1', employee: 'Anna S', competence: 'AWS Solutions Architect', level: 'Senior', certification_date: '2024-06-15', expiry_date: '2027-06-15', issuer: 'Amazon' },
  { id: '2', employee: 'Johan L', competence: 'PMP', level: 'Expert', certification_date: '2023-03-01', expiry_date: '2026-03-01', issuer: 'PMI' },
  { id: '3', employee: 'Erik M', competence: 'Azure DevOps', level: 'Medel', certification_date: '2025-01-10', expiry_date: '2026-01-10', issuer: 'Microsoft' },
]
const EMPTY_FORM = { employee: '', competence: '', level: 'Medel', certification_date: '', expiry_date: '', issuer: '' }

export function KompetensregisterWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [items, setItems] = useState<Item[]>([]); const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Item | null>(null); const [form, setForm] = useState(EMPTY_FORM); const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Item | null>(null); const [searchQuery, setSearchQuery] = useState('')
  const save = useCallback(async (d: Item[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'competences', config_value: d }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetch_ = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'competences').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setItems(data.config_value as Item[]) } else { setItems(DEFAULT_ITEMS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'competences', config_value: DEFAULT_ITEMS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }; setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetch_() }, [fetch_])
  const filtered = useMemo(() => { let r = items; if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter((i) => i.employee.toLowerCase().includes(q) || i.competence.toLowerCase().includes(q)) }; return r.sort((a, b) => a.employee.localeCompare(b.employee)) }, [items, searchQuery])
  const stats = useMemo(() => ({ total: items.length, expiring: items.filter(i => i.expiry_date && i.expiry_date <= new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]).length, uniqueEmployees: new Set(items.map(i => i.employee)).size }), [items])
  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(i: Item) { setEditing(i); setForm({ employee: i.employee, competence: i.competence, level: i.level, certification_date: i.certification_date, expiry_date: i.expiry_date, issuer: i.issuer }); setDialogOpen(true) }
  async function handleSave() { const entry: Item = { id: editing?.id ?? generateId(), employee: form.employee.trim(), competence: form.competence.trim(), level: form.level.trim(), certification_date: form.certification_date, expiry_date: form.expiry_date, issuer: form.issuer.trim() }; const u = editing ? items.map((i) => i.id === editing.id ? entry : i) : [...items, entry]; setItems(u); setDialogOpen(false); await save(u) }
  function openDel(i: Item) { setToDelete(i); setDeleteDialogOpen(true) }
  async function handleDel() { if (!toDelete) return; const u = items.filter((i) => i.id !== toDelete.id); setItems(u); setDeleteDialogOpen(false); setToDelete(null); await save(u) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Bemanning & HR" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny kompetens</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Certifieringar</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.total}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unika anställda</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.uniqueEmployees}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Utgår inom 90 dagar</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-amber-600">{stats.expiring}</span></CardContent></Card>
            </div>
            <div className="flex items-center gap-3"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök anställd eller kompetens..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>{saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}</div>
            {filtered.length === 0 ? <EmptyModuleState icon={Award} title="Inga kompetenser" description="Registrera certifieringar och kompetenser." actionLabel="Ny kompetens" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Anställd</TableHead><TableHead className="font-medium">Kompetens</TableHead><TableHead className="font-medium">Nivå</TableHead><TableHead className="font-medium">Utfärdare</TableHead><TableHead className="font-medium">Certifierad</TableHead><TableHead className="font-medium">Utgår</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader><TableBody>{filtered.map((i) => (
                <TableRow key={i.id}><TableCell className="font-medium">{i.employee}</TableCell><TableCell>{i.competence}</TableCell><TableCell><Badge variant="secondary" className={LEVEL_COLORS[i.level] || ''}>{i.level}</Badge></TableCell><TableCell>{i.issuer}</TableCell><TableCell>{i.certification_date}</TableCell><TableCell>{i.expiry_date}</TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(i)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDel(i)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
              ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera kompetens' : 'Ny kompetens'}</DialogTitle><DialogDescription>Registrera certifieringar och kompetenser per anställd.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Anställd *</Label><Input value={form.employee} onChange={(e) => setForm((f) => ({ ...f, employee: e.target.value }))} /></div><div className="grid gap-2"><Label>Kompetens *</Label><Input value={form.competence} onChange={(e) => setForm((f) => ({ ...f, competence: e.target.value }))} placeholder="AWS Solutions Architect" /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Nivå</Label><Input value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} placeholder="Junior / Medel / Senior / Expert" /></div><div className="grid gap-2"><Label>Utfärdare</Label><Input value={form.issuer} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} placeholder="Amazon, Microsoft, etc." /></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Certifieringsdatum</Label><Input type="date" value={form.certification_date} onChange={(e) => setForm((f) => ({ ...f, certification_date: e.target.value }))} /></div><div className="grid gap-2"><Label>Utgångsdatum</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} /></div></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.employee.trim() || !form.competence.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort kompetens</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{toDelete?.competence}</span> för {toDelete?.employee}?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDel}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
