'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Loader2, FileText } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }
type DocStatus = 'Utkast' | 'Skickad' | 'Godkänd' | 'Nekad' | 'Signerat'
type DocType = 'Offert' | 'Avtal'
interface Document { id: string; type: DocType; title: string; client: string; status: DocStatus; amount: number; validUntil: string; createdDate: string; notes: string }
const DOC_STATUSES: DocStatus[] = ['Utkast', 'Skickad', 'Godkänd', 'Nekad', 'Signerat']
const STATUS_MAP: Record<DocStatus, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { 'Utkast': 'neutral', 'Skickad': 'info', 'Godkänd': 'success', 'Nekad': 'danger', 'Signerat': 'success' }
function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
const EMPTY_FORM = { type: 'Offert' as DocType, title: '', client: '', status: 'Utkast' as DocStatus, amount: 0, validUntil: '', createdDate: '', notes: '' }

export function OffertAvtalWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])
  const [dialogOpen, setDialogOpen] = useState(false); const [editing, setEditing] = useState<Document | null>(null); const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false); const [toDelete, setToDelete] = useState<Document | null>(null)
  const [filterType, setFilterType] = useState<DocType | 'all'>('all')

  const saveItems = useCallback(async (items: Document[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'documents', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'documents').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setDocs(data.config_value as Document[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const filtered = filterType === 'all' ? docs : docs.filter(d => d.type === filterType)

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM, createdDate: new Date().toISOString().split('T')[0] }); setDialogOpen(true) }
  function openEdit(d: Document) { setEditing(d); setForm({ type: d.type, title: d.title, client: d.client, status: d.status, amount: d.amount, validUntil: d.validUntil, createdDate: d.createdDate, notes: d.notes }); setDialogOpen(true) }
  async function handleSave() { const item: Document = { id: editing?.id ?? crypto.randomUUID(), ...form, title: form.title.trim(), client: form.client.trim(), notes: form.notes.trim() }; const updated = editing ? docs.map(d => d.id === editing.id ? item : d) : [...docs, item]; setDocs(updated); setDialogOpen(false); await saveItems(updated) }
  async function handleDelete() { if (!toDelete) return; const updated = docs.filter(d => d.id !== toDelete.id); setDocs(updated); setDeleteDialogOpen(false); setToDelete(null); await saveItems(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Konsult" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny offert/avtal</Button>}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={filterType} onValueChange={val => setFilterType(val as DocType | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera" /></SelectTrigger><SelectContent><SelectItem value="all">Alla</SelectItem><SelectItem value="Offert">Offerter</SelectItem><SelectItem value="Avtal">Avtal</SelectItem></SelectContent></Select>
            {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
          </div>
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <EmptyModuleState icon={FileText} title="Inga offerter eller avtal" description="Skapa och hantera offerter och avtal med mallar, godkännandeflöde och status." actionLabel="Ny offert/avtal" onAction={openNew} /> : (
            <div className="space-y-3">{filtered.sort((a, b) => b.createdDate.localeCompare(a.createdDate)).map(d => (
              <div key={d.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4">
                <div className="flex flex-col min-w-0"><div className="flex items-center gap-2"><span className="text-xs font-medium text-muted-foreground">{d.type}</span><span className="font-medium text-sm">{d.title}</span></div><div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5"><span>{d.client}</span><span>{fmt(d.amount)} kr</span>{d.validUntil && <span>Giltig t.o.m. {d.validUntil}</span>}</div></div>
                <div className="flex items-center gap-2 flex-shrink-0"><StatusBadge label={d.status} variant={STATUS_MAP[d.status]} /><Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(d); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}</div>
          )}
        </div>
      </ModuleWorkspaceShell>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Ny offert/avtal'}</DialogTitle><DialogDescription>Ange uppgifter.</DialogDescription></DialogHeader><div className="grid gap-4 py-2"><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Typ</Label><Select value={form.type} onValueChange={val => setForm(f => ({ ...f, type: val as DocType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Offert">Offert</SelectItem><SelectItem value="Avtal">Avtal</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as DocStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DOC_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Titel *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div><div className="grid gap-2"><Label>Klient *</Label><Input value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Belopp (kr)</Label><Input type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Skapad</Label><Input type="date" value={form.createdDate} onChange={e => setForm(f => ({ ...f, createdDate: e.target.value }))} /></div><div className="grid gap-2"><Label>Giltig t.o.m.</Label><Input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} /></div></div><div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div></div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.title.trim() || !form.client.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort</DialogTitle><DialogDescription>Är du säker?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
