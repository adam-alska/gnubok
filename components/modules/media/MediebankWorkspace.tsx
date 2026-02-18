'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, Image, Film, FileText, Music } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

type MediaType = 'Bild' | 'Video' | 'Dokument' | 'Ljud' | 'Grafik' | 'Övrigt'
type RightsStatus = 'Ägd' | 'Licensierad' | 'Köpt' | 'Creative Commons' | 'Utgången'
interface MediaAsset { id: string; name: string; type: MediaType; tags: string; rights: RightsStatus; rightsExpiry: string; source: string; project: string; description: string; addedDate: string }

const MEDIA_TYPES: MediaType[] = ['Bild', 'Video', 'Dokument', 'Ljud', 'Grafik', 'Övrigt']
const RIGHTS_STATUSES: RightsStatus[] = ['Ägd', 'Licensierad', 'Köpt', 'Creative Commons', 'Utgången']
const RIGHTS_V: Record<RightsStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = { 'Ägd': 'success', 'Licensierad': 'info', 'Köpt': 'success', 'Creative Commons': 'neutral', 'Utgången': 'danger' }
const TYPE_ICONS: Record<MediaType, typeof Image> = { 'Bild': Image, 'Video': Film, 'Dokument': FileText, 'Ljud': Music, 'Grafik': Image, 'Övrigt': FileText }
const EMPTY_FORM = { name: '', type: 'Bild' as MediaType, tags: '', rights: 'Ägd' as RightsStatus, rightsExpiry: '', source: '', project: '', description: '', addedDate: '' }

export function MediebankWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MediaAsset | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<MediaType | 'all'>('all')

  const saveData = useCallback(async (items: MediaAsset[]) => { setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }; await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'media_bank', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false) }, [supabase, sectorSlug, mod.slug])
  const fetchData = useCallback(async () => { setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }; const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'media_bank').maybeSingle(); if (data?.config_value && Array.isArray(data.config_value)) setAssets(data.config_value as MediaAsset[]); setLoading(false) }, [supabase, sectorSlug, mod.slug])
  useEffect(() => { fetchData() }, [fetchData])

  const expiringSoon = useMemo(() => { const in30 = new Date(); in30.setDate(in30.getDate() + 30); const d = in30.toISOString().split('T')[0]; return assets.filter(a => a.rightsExpiry && a.rightsExpiry <= d && a.rights !== 'Utgången') }, [assets])
  const typeCounts = useMemo(() => { const c: Record<string, number> = {}; MEDIA_TYPES.forEach(t => { c[t] = assets.filter(a => a.type === t).length }); return c }, [assets])

  const filtered = useMemo(() => {
    let r = assets
    if (filterType !== 'all') r = r.filter(a => a.type === filterType)
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter(a => a.name.toLowerCase().includes(q) || a.tags.toLowerCase().includes(q) || a.project.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)) }
    return r.sort((a, b) => (b.addedDate || '').localeCompare(a.addedDate || ''))
  }, [assets, filterType, searchQuery])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM, addedDate: new Date().toISOString().split('T')[0] }); setDialogOpen(true) }
  function openEdit(a: MediaAsset) { setEditing(a); setForm({ name: a.name, type: a.type, tags: a.tags, rights: a.rights, rightsExpiry: a.rightsExpiry, source: a.source, project: a.project, description: a.description, addedDate: a.addedDate }); setDialogOpen(true) }
  async function handleSave() { const entry: MediaAsset = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? assets.map(a => a.id === editing.id ? entry : a) : [...assets, entry]; setAssets(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = assets.filter(a => a.id !== id); setAssets(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Media & Kommunikation" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny media</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            {expiringSoon.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-1">
                <p className="text-sm font-medium text-amber-700">Rättigheter som utgår inom 30 dagar</p>
                {expiringSoon.map(a => <p key={a.id} className="text-xs text-amber-600">{a.name} ({a.rights}) - utgår {a.rightsExpiry}</p>)}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Totalt mediaobjekt" value={assets.length} />
              {MEDIA_TYPES.filter(t => typeCounts[t] > 0).slice(0, 3).map(t => <KPICard key={t} label={t} value={typeCounts[t]} />)}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök namn, taggar, projekt..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" /></div>
              <Select value={filterType} onValueChange={v => setFilterType(v as MediaType | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera typ" /></SelectTrigger><SelectContent><SelectItem value="all">Alla typer</SelectItem>{MEDIA_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>

            {filtered.length === 0 ? <EmptyModuleState icon={Image} title="Inga mediaobjekt" description={searchQuery || filterType !== 'all' ? 'Inga resultat matchar din sökning.' : 'Registrera mediaobjekt med taggar, rättigheter och projekt.'} actionLabel={!searchQuery && filterType === 'all' ? 'Ny media' : undefined} onAction={!searchQuery && filterType === 'all' ? openNew : undefined} /> : (
              <div className="rounded-xl border border-border overflow-hidden"><Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Namn</TableHead><TableHead className="font-medium">Typ</TableHead><TableHead className="font-medium">Taggar</TableHead><TableHead className="font-medium">Rättigheter</TableHead><TableHead className="font-medium">Utgår</TableHead><TableHead className="font-medium">Projekt</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                <TableBody>{filtered.map(a => {
                  const Icon = TYPE_ICONS[a.type] || FileText
                  const today = new Date().toISOString().split('T')[0]
                  const expiring = a.rightsExpiry && a.rightsExpiry <= today
                  return (
                    <TableRow key={a.id}><TableCell className="font-medium"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" />{a.name}</div></TableCell><TableCell>{a.type}</TableCell><TableCell>{a.tags ? <div className="flex flex-wrap gap-1">{a.tags.split(',').map((t, i) => <Badge key={i} variant="outline" className="text-[10px]">{t.trim()}</Badge>)}</div> : '-'}</TableCell><TableCell><StatusBadge label={a.rights} variant={RIGHTS_V[a.rights]} /></TableCell><TableCell className={cn(expiring && 'text-red-600 font-medium')}>{a.rightsExpiry || '-'}</TableCell><TableCell className="text-muted-foreground">{a.project || '-'}</TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                  )
                })}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera' : 'Nytt mediaobjekt'}</DialogTitle><DialogDescription>Registrera media med rättigheter och taggar.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Kampanjbild sommar" /></div><div className="grid gap-2"><Label>Typ</Label><Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as MediaType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MEDIA_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></div>
          <div className="grid gap-2"><Label>Taggar (kommaseparerade)</Label><Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="sommar, kampanj, natur" /></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Rättigheter</Label><Select value={form.rights} onValueChange={v => setForm(f => ({ ...f, rights: v as RightsStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RIGHTS_STATUSES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Rättigheter utgår</Label><Input type="date" value={form.rightsExpiry} onChange={e => setForm(f => ({ ...f, rightsExpiry: e.target.value }))} /></div><div className="grid gap-2"><Label>Källa</Label><Input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Getty, intern" /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Projekt</Label><Input value={form.project} onChange={e => setForm(f => ({ ...f, project: e.target.value }))} /></div><div className="grid gap-2"><Label>Tillagd datum</Label><Input type="date" value={form.addedDate} onChange={e => setForm(f => ({ ...f, addedDate: e.target.value }))} /></div></div>
          <div className="grid gap-2"><Label>Beskrivning</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
