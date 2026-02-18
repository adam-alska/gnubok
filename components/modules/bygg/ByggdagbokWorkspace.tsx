'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  BookOpen,
  Cloud,
  Sun,
  CloudRain,
  CloudSnow,
  Wind,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type WeatherType = 'Sol' | 'Molnigt' | 'Regn' | 'Snö' | 'Blåsigt'

const WEATHER_ICONS: Record<WeatherType, typeof Sun> = {
  'Sol': Sun,
  'Molnigt': Cloud,
  'Regn': CloudRain,
  'Snö': CloudSnow,
  'Blåsigt': Wind,
}

interface DiaryEntry {
  id: string
  date: string
  project: string
  weather: WeatherType
  temperature: string
  staffCount: number
  ueStaffCount: number
  workDescription: string
  incidents: string
  deliveries: string
  inspections: string
  notes: string
  author: string
}

const EMPTY_FORM = {
  date: new Date().toISOString().slice(0, 10),
  project: '',
  weather: 'Sol' as WeatherType,
  temperature: '',
  staffCount: 0,
  ueStaffCount: 0,
  workDescription: '',
  incidents: '',
  deliveries: '',
  inspections: '',
  notes: '',
  author: '',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function ByggdagbokWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<DiaryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterProject, setFilterProject] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DiaryEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<DiaryEntry | null>(null)

  const saveEntries = useCallback(async (items: DiaryEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'diary_entries', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug).eq('config_key', 'diary_entries')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as DiaryEntry[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const projectList = useMemo(() => {
    return [...new Set(entries.map(e => e.project).filter(Boolean))]
  }, [entries])

  const filtered = useMemo(() => {
    let result = entries
    if (filterProject !== 'all') result = result.filter((e) => e.project === filterProject)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) =>
        e.workDescription.toLowerCase().includes(q) ||
        e.project.toLowerCase().includes(q) ||
        e.date.includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, filterProject, searchQuery])

  const stats = useMemo(() => {
    const thisMonth = new Date().toISOString().slice(0, 7)
    const monthEntries = entries.filter(e => e.date.startsWith(thisMonth))
    const totalStaff = monthEntries.reduce((s, e) => s + e.staffCount + e.ueStaffCount, 0)
    const incidents = monthEntries.filter(e => e.incidents.trim().length > 0).length
    return { totalEntries: entries.length, monthEntries: monthEntries.length, totalStaff, incidents }
  }, [entries])

  function openNew() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(entry: DiaryEntry) {
    setEditingEntry(entry)
    setForm({ ...entry })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: DiaryEntry = {
      id: editingEntry?.id ?? generateId(),
      ...form,
      staffCount: Number(form.staffCount),
      ueStaffCount: Number(form.ueStaffCount),
    }
    let updated: DiaryEntry[]
    if (editingEntry) {
      updated = entries.map((e) => e.id === editingEntry.id ? item : e)
    } else {
      updated = [...entries, item]
    }
    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  async function handleDelete() {
    if (!entryToDelete) return
    const updated = entries.filter((e) => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Bygg & Entreprenad"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny dagboksanteckning
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt anteckningar</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.totalEntries}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Denna månad</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.monthEntries}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Personaldagar (mån)</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.totalStaff}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Incidenter (mån)</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.incidents}</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök datum, arbete, projekt..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterProject} onValueChange={setFilterProject}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrera projekt" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla projekt</SelectItem>
                  {projectList.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <EmptyModuleState
                icon={BookOpen}
                title="Ingen dagbok"
                description="Dokumentera dagliga aktiviteter, väder, personal och incidenter. Byggdagbok är krav vid kontraktsenliga projekt."
                actionLabel="Ny anteckning"
                onAction={openNew}
              />
            ) : (
              <div className="space-y-4">
                {filtered.map((entry) => {
                  const WeatherIcon = WEATHER_ICONS[entry.weather]
                  return (
                    <div key={entry.id} className="rounded-xl border border-border bg-card p-5">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold">{entry.date}</h3>
                            <Badge variant="outline">{entry.project}</Badge>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <WeatherIcon className="h-4 w-4" />
                              {entry.weather} {entry.temperature && `${entry.temperature}\u00B0C`}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Egen: {entry.staffCount} pers</span>
                            <span>UE: {entry.ueStaffCount} pers</span>
                            {entry.author && <span>Av: {entry.author}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(entry)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(entry); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                      <p className="text-sm mt-3 whitespace-pre-wrap">{entry.workDescription}</p>
                      {entry.incidents && (
                        <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 text-sm">
                          <span className="font-medium text-red-700 dark:text-red-400">Incident: </span>{entry.incidents}
                        </div>
                      )}
                      {entry.deliveries && (
                        <p className="text-xs text-muted-foreground mt-2">Leveranser: {entry.deliveries}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera dagboksanteckning' : 'Ny dagboksanteckning'}</DialogTitle>
            <DialogDescription>Digital byggdagbok med väder, personal, arbete och incidentrapportering.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Datum *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Projekt *</Label>
                <Input value={form.project} onChange={(e) => setForm(f => ({ ...f, project: e.target.value }))} placeholder="Projektnamn" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Väder</Label>
                <Select value={form.weather} onValueChange={(v) => setForm(f => ({ ...f, weather: v as WeatherType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sol">Sol</SelectItem>
                    <SelectItem value="Molnigt">Molnigt</SelectItem>
                    <SelectItem value="Regn">Regn</SelectItem>
                    <SelectItem value="Snö">Snö</SelectItem>
                    <SelectItem value="Blåsigt">Blåsigt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Temperatur</Label>
                <Input value={form.temperature} onChange={(e) => setForm(f => ({ ...f, temperature: e.target.value }))} placeholder="t.ex. 12" />
              </div>
              <div className="grid gap-2">
                <Label>Ansvarig</Label>
                <Input value={form.author} onChange={(e) => setForm(f => ({ ...f, author: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Egen personal (antal)</Label>
                <Input type="number" value={form.staffCount || ''} onChange={(e) => setForm(f => ({ ...f, staffCount: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label>UE-personal (antal)</Label>
                <Input type="number" value={form.ueStaffCount || ''} onChange={(e) => setForm(f => ({ ...f, ueStaffCount: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Utfört arbete *</Label>
              <Textarea value={form.workDescription} onChange={(e) => setForm(f => ({ ...f, workDescription: e.target.value }))} rows={4} placeholder="Beskriv dagens arbete..." />
            </div>
            <div className="grid gap-2">
              <Label>Incidenter / Avvikelser</Label>
              <Textarea value={form.incidents} onChange={(e) => setForm(f => ({ ...f, incidents: e.target.value }))} rows={2} placeholder="Olyckor, skador, avvikelser..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Leveranser</Label>
                <Input value={form.deliveries} onChange={(e) => setForm(f => ({ ...f, deliveries: e.target.value }))} placeholder="Material, maskiner etc." />
              </div>
              <div className="grid gap-2">
                <Label>Besiktningar</Label>
                <Input value={form.inspections} onChange={(e) => setForm(f => ({ ...f, inspections: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Övriga anteckningar</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.date || !form.project.trim()}>
              {editingEntry ? 'Uppdatera' : 'Spara'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort dagboksanteckning</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort anteckningen från {entryToDelete?.date}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
