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
  FileImage,
  Upload,
  History,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type DrawingStatus = 'Utkast' | 'Granskning' | 'Godkänd' | 'Distribuerad' | 'Utgången'
type DrawingDiscipline = 'Arkitekt' | 'Konstruktion' | 'El' | 'VVS' | 'Mark' | 'Brand' | 'Övrigt'

interface Drawing {
  id: string
  drawingNumber: string
  title: string
  project: string
  discipline: DrawingDiscipline
  version: string
  status: DrawingStatus
  author: string
  date: string
  distributedTo: string
  notes: string
  fileName: string
  revisionHistory: { version: string; date: string; change: string }[]
}

const EMPTY_FORM = {
  drawingNumber: '',
  title: '',
  project: '',
  discipline: 'Arkitekt' as DrawingDiscipline,
  version: 'A',
  status: 'Utkast' as DrawingStatus,
  author: '',
  date: new Date().toISOString().slice(0, 10),
  distributedTo: '',
  notes: '',
  fileName: '',
}

const STATUS_COLORS: Record<DrawingStatus, string> = {
  'Utkast': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Granskning': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Godkänd': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Distribuerad': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Utgången': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const DISCIPLINE_COLORS: Record<DrawingDiscipline, string> = {
  'Arkitekt': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Konstruktion': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'El': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  'VVS': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Mark': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Brand': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'Övrigt': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function RitningshanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [drawings, setDrawings] = useState<Drawing[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDiscipline, setFilterDiscipline] = useState<DrawingDiscipline | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDrawing, setEditingDrawing] = useState<Drawing | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [drawingToDelete, setDrawingToDelete] = useState<Drawing | null>(null)
  const [revisionNote, setRevisionNote] = useState('')

  const saveDrawings = useCallback(async (items: Drawing[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'drawings', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'drawings')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setDrawings(data.config_value as Drawing[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    let result = drawings
    if (filterDiscipline !== 'all') result = result.filter((d) => d.discipline === filterDiscipline)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((d) =>
        d.drawingNumber.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        d.project.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => a.drawingNumber.localeCompare(b.drawingNumber))
  }, [drawings, filterDiscipline, searchQuery])

  const stats = useMemo(() => {
    const total = drawings.length
    const current = drawings.filter(d => d.status !== 'Utgången').length
    const inReview = drawings.filter(d => d.status === 'Granskning').length
    const disciplines = new Set(drawings.map(d => d.discipline)).size
    return { total, current, inReview, disciplines }
  }, [drawings])

  function openNew() {
    setEditingDrawing(null)
    setForm({ ...EMPTY_FORM })
    setRevisionNote('')
    setDialogOpen(true)
  }

  function openEdit(d: Drawing) {
    setEditingDrawing(d)
    setForm({
      drawingNumber: d.drawingNumber,
      title: d.title,
      project: d.project,
      discipline: d.discipline,
      version: d.version,
      status: d.status,
      author: d.author,
      date: d.date,
      distributedTo: d.distributedTo,
      notes: d.notes,
      fileName: d.fileName,
    })
    setRevisionNote('')
    setDialogOpen(true)
  }

  async function handleSave() {
    const isVersionChange = editingDrawing && form.version !== editingDrawing.version
    const revHistory = editingDrawing?.revisionHistory ?? []
    if (isVersionChange && revisionNote.trim()) {
      revHistory.push({
        version: form.version,
        date: new Date().toISOString().slice(0, 10),
        change: revisionNote.trim(),
      })
    }

    const item: Drawing = {
      id: editingDrawing?.id ?? generateId(),
      ...form,
      revisionHistory: editingDrawing ? revHistory : [],
    }
    let updated: Drawing[]
    if (editingDrawing) {
      updated = drawings.map((d) => d.id === editingDrawing.id ? item : d)
    } else {
      updated = [...drawings, item]
    }
    setDrawings(updated)
    setDialogOpen(false)
    await saveDrawings(updated)
  }

  async function handleDelete() {
    if (!drawingToDelete) return
    const updated = drawings.filter((d) => d.id !== drawingToDelete.id)
    setDrawings(updated)
    setDeleteDialogOpen(false)
    setDrawingToDelete(null)
    await saveDrawings(updated)
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
            Ny ritning
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
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt ritningar</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.total}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Gällande</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.current}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Under granskning</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.inReview}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Discipliner</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.disciplines}</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök ritningsnr, titel, projekt..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterDiscipline} onValueChange={(v) => setFilterDiscipline(v as DrawingDiscipline | 'all')}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera disciplin" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla discipliner</SelectItem>
                  <SelectItem value="Arkitekt">Arkitekt</SelectItem>
                  <SelectItem value="Konstruktion">Konstruktion</SelectItem>
                  <SelectItem value="El">El</SelectItem>
                  <SelectItem value="VVS">VVS</SelectItem>
                  <SelectItem value="Mark">Mark</SelectItem>
                  <SelectItem value="Brand">Brand</SelectItem>
                  <SelectItem value="Övrigt">Övrigt</SelectItem>
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
                icon={FileImage}
                title="Inga ritningar"
                description="Hantera ritningar med versionshistorik och distribution till underentreprenörer."
                actionLabel="Ny ritning"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Ritningsnr</TableHead>
                      <TableHead className="font-medium">Titel</TableHead>
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium">Disciplin</TableHead>
                      <TableHead className="font-medium">Version</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-mono font-medium">{d.drawingNumber}</TableCell>
                        <TableCell>{d.title}</TableCell>
                        <TableCell>{d.project}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={DISCIPLINE_COLORS[d.discipline]}>{d.discipline}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-medium">{d.version}</span>
                            {d.revisionHistory.length > 0 && (
                              <History className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[d.status]}>{d.status}</Badge>
                        </TableCell>
                        <TableCell>{d.date}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(d)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setDrawingToDelete(d); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDrawing ? 'Redigera ritning' : 'Ny ritning'}</DialogTitle>
            <DialogDescription>Registrera ritning med versionshantering. Distribuera till UE via statushantering.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Ritningsnummer *</Label>
                <Input value={form.drawingNumber} onChange={(e) => setForm(f => ({ ...f, drawingNumber: e.target.value }))} placeholder="A-101" />
              </div>
              <div className="grid gap-2">
                <Label>Titel *</Label>
                <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Planritning vån 1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Projekt *</Label>
                <Input value={form.project} onChange={(e) => setForm(f => ({ ...f, project: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Disciplin</Label>
                <Select value={form.discipline} onValueChange={(v) => setForm(f => ({ ...f, discipline: v as DrawingDiscipline }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Arkitekt">Arkitekt</SelectItem>
                    <SelectItem value="Konstruktion">Konstruktion</SelectItem>
                    <SelectItem value="El">El</SelectItem>
                    <SelectItem value="VVS">VVS</SelectItem>
                    <SelectItem value="Mark">Mark</SelectItem>
                    <SelectItem value="Brand">Brand</SelectItem>
                    <SelectItem value="Övrigt">Övrigt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Version</Label>
                <Input value={form.version} onChange={(e) => setForm(f => ({ ...f, version: e.target.value }))} placeholder="A" />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as DrawingStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Utkast">Utkast</SelectItem>
                    <SelectItem value="Granskning">Granskning</SelectItem>
                    <SelectItem value="Godkänd">Godkänd</SelectItem>
                    <SelectItem value="Distribuerad">Distribuerad</SelectItem>
                    <SelectItem value="Utgången">Utgången</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Datum</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Upphovsperson</Label>
                <Input value={form.author} onChange={(e) => setForm(f => ({ ...f, author: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Distribuerad till (UE)</Label>
                <Input value={form.distributedTo} onChange={(e) => setForm(f => ({ ...f, distributedTo: e.target.value }))} placeholder="UE-företag, separera med komma" />
              </div>
            </div>
            {editingDrawing && form.version !== editingDrawing.version && (
              <div className="grid gap-2">
                <Label>Revisionskommentar</Label>
                <Input value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)} placeholder="Vad ändrades i denna version?" />
              </div>
            )}
            {editingDrawing && editingDrawing.revisionHistory.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Revisionshistorik</Label>
                <div className="rounded border border-border p-3 space-y-1 text-xs">
                  {editingDrawing.revisionHistory.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="font-mono font-medium">{r.version}</span>
                      <span className="text-muted-foreground">{r.date}</span>
                      <span>{r.change}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.drawingNumber.trim() || !form.title.trim()}>
              {editingDrawing ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort ritning</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort {drawingToDelete?.drawingNumber} - {drawingToDelete?.title}?</DialogDescription>
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
