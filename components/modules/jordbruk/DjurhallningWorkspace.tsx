'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, Heart } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface Animal { id: string; earTag: string; species: string; breed: string; birthDate: string; gender: string; healthLog: string[]; jordbruksverketId: string }

const EMPTY_FORM = { earTag: '', species: '', breed: '', birthDate: '', gender: 'Hona', healthLog: [] as string[], jordbruksverketId: '' }

export function DjurhallningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [animals, setAnimals] = useState<Animal[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Animal | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [healthNote, setHealthNote] = useState('')

  const saveData = useCallback(async (items: Animal[]) => {
    setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'animals', config_value: items }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'animals').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setAnimals(data.config_value as Animal[]); setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return animals
    const q = searchQuery.toLowerCase()
    return animals.filter(a => a.earTag.toLowerCase().includes(q) || a.species.toLowerCase().includes(q) || a.breed.toLowerCase().includes(q))
  }, [animals, searchQuery])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setHealthNote(''); setDialogOpen(true) }
  function openEdit(a: Animal) { setEditing(a); setForm({ earTag: a.earTag, species: a.species, breed: a.breed, birthDate: a.birthDate, gender: a.gender, healthLog: a.healthLog, jordbruksverketId: a.jordbruksverketId }); setHealthNote(''); setDialogOpen(true) }

  function addHealthNote() {
    if (!healthNote.trim()) return
    const note = `${new Date().toISOString().split('T')[0]}: ${healthNote.trim()}`
    setForm(f => ({ ...f, healthLog: [...f.healthLog, note] }))
    setHealthNote('')
  }

  async function handleSave() { const entry: Animal = { id: editing?.id ?? crypto.randomUUID(), ...form }; const updated = editing ? animals.map(a => a.id === editing.id ? entry : a) : [...animals, entry]; setAnimals(updated); setDialogOpen(false); await saveData(updated) }
  async function handleDelete(id: string) { const updated = animals.filter(a => a.id !== id); setAnimals(updated); await saveData(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt djur</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök öronmärke, art, ras..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" /></div>
              <Badge variant="secondary">{animals.length} djur</Badge>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>
            {filtered.length === 0 ? <EmptyModuleState icon={Heart} title="Inga djur" description="Registrera djur med öronmärke, hälsologg och Jordbruksverket-ID." actionLabel="Nytt djur" onAction={openNew} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Öronmärke</TableHead><TableHead className="font-medium">Art</TableHead><TableHead className="font-medium">Ras</TableHead><TableHead className="font-medium">Född</TableHead><TableHead className="font-medium">Kön</TableHead><TableHead className="font-medium">Hälsonoter</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{filtered.map(a => (
                    <TableRow key={a.id}><TableCell className="font-mono font-medium">{a.earTag}</TableCell><TableCell>{a.species}</TableCell><TableCell>{a.breed}</TableCell><TableCell>{a.birthDate}</TableCell><TableCell>{a.gender}</TableCell><TableCell><Badge variant="outline">{a.healthLog.length} noteringar</Badge></TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                  ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editing ? 'Redigera djur' : 'Nytt djur'}</DialogTitle><DialogDescription>Registrera djurets uppgifter.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Öronmärke *</Label><Input value={form.earTag} onChange={e => setForm(f => ({ ...f, earTag: e.target.value }))} placeholder="SE12345" /></div><div className="grid gap-2"><Label>Jordbruksverket-ID</Label><Input value={form.jordbruksverketId} onChange={e => setForm(f => ({ ...f, jordbruksverketId: e.target.value }))} /></div></div>
          <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Art</Label><Input value={form.species} onChange={e => setForm(f => ({ ...f, species: e.target.value }))} placeholder="Nötkreatur" /></div><div className="grid gap-2"><Label>Ras</Label><Input value={form.breed} onChange={e => setForm(f => ({ ...f, breed: e.target.value }))} placeholder="SRB" /></div><div className="grid gap-2"><Label>Kön</Label><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}><option value="Hona">Hona</option><option value="Hane">Hane</option></select></div></div>
          <div className="grid gap-2"><Label>Födelsedatum</Label><Input type="date" value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} /></div>
          <div className="grid gap-2"><Label>Hälsologg</Label>
            <div className="flex gap-2"><Input value={healthNote} onChange={e => setHealthNote(e.target.value)} placeholder="Ny hälsonotering..." /><Button type="button" variant="outline" size="sm" onClick={addHealthNote}>Lägg till</Button></div>
            {form.healthLog.length > 0 && <div className="space-y-1 max-h-32 overflow-auto">{form.healthLog.map((note, i) => <p key={i} className="text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded">{note}</p>)}</div>}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.earTag.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
