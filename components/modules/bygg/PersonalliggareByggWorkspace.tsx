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
import { Switch } from '@/components/ui/switch'
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
  Users,
  Download,
  LogIn,
  LogOut,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface StaffEntry {
  id: string
  name: string
  personnummer: string
  company: string
  isSubcontractor: boolean
  project: string
  date: string
  checkIn: string
  checkOut: string
  notes: string
}

const EMPTY_FORM = {
  name: '',
  personnummer: '',
  company: '',
  isSubcontractor: false,
  project: '',
  date: new Date().toISOString().slice(0, 10),
  checkIn: '',
  checkOut: '',
  notes: '',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function PersonalliggareByggWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<StaffEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10))
  const [filterType, setFilterType] = useState<'all' | 'own' | 'ue'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<StaffEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<StaffEntry | null>(null)

  const saveEntries = useCallback(async (items: StaffEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'staff_entries', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'staff_entries')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as StaffEntry[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    let result = entries
    if (filterDate) result = result.filter((e) => e.date === filterDate)
    if (filterType === 'own') result = result.filter((e) => !e.isSubcontractor)
    if (filterType === 'ue') result = result.filter((e) => e.isSubcontractor)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.company.toLowerCase().includes(q) ||
        e.project.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  }, [entries, filterDate, filterType, searchQuery])

  const stats = useMemo(() => {
    const todayEntries = entries.filter(e => e.date === filterDate)
    const onSite = todayEntries.filter(e => e.checkIn && !e.checkOut).length
    const total = todayEntries.length
    const ueCount = todayEntries.filter(e => e.isSubcontractor).length
    const ownCount = todayEntries.filter(e => !e.isSubcontractor).length
    return { onSite, total, ueCount, ownCount }
  }, [entries, filterDate])

  function openNew() {
    setEditingEntry(null)
    setForm({ ...EMPTY_FORM, date: filterDate })
    setDialogOpen(true)
  }

  function openEdit(entry: StaffEntry) {
    setEditingEntry(entry)
    setForm({ ...entry })
    setDialogOpen(true)
  }

  async function handleCheckOut(entry: StaffEntry) {
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const updated = entries.map(e => e.id === entry.id ? { ...e, checkOut: timeStr } : e)
    setEntries(updated)
    await saveEntries(updated)
  }

  async function handleSave() {
    const item: StaffEntry = {
      id: editingEntry?.id ?? generateId(),
      ...form,
    }
    let updated: StaffEntry[]
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

  function exportSkatteverket() {
    const dateEntries = entries.filter(e => e.date === filterDate)
    const lines = dateEntries.map(e =>
      `${e.personnummer};${e.name};${e.company};${e.isSubcontractor ? 'UE' : 'Egen'};${e.project};${e.date};${e.checkIn};${e.checkOut}`
    )
    const csv = `Personnummer;Namn;Företag;Typ;Projekt;Datum;Incheckning;Utcheckning\n${lines.join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `personalliggare-${filterDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Bygg & Entreprenad"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportSkatteverket} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export SKV
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Ny registrering
            </Button>
          </div>
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
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">På plats</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.onSite}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">personer</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt idag</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.total}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">registreringar</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Egen personal</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.ownCount}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UE-personal</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.ueCount}</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök namn, företag, projekt..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-[160px]" />
              <Select value={filterType} onValueChange={(v) => setFilterType(v as 'all' | 'own' | 'ue')}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla</SelectItem>
                  <SelectItem value="own">Egen personal</SelectItem>
                  <SelectItem value="ue">UE-personal</SelectItem>
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
                icon={Users}
                title="Inga registreringar"
                description="Registrera personal på byggarbetsplatsen. Personalliggare krävs enligt lag inklusive UE-personal."
                actionLabel="Ny registrering"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Namn</TableHead>
                      <TableHead className="font-medium">Företag</TableHead>
                      <TableHead className="font-medium">Typ</TableHead>
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium">Incheckning</TableHead>
                      <TableHead className="font-medium">Utcheckning</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{entry.name}</span>
                            <span className="text-xs text-muted-foreground block font-mono">{entry.personnummer}</span>
                          </div>
                        </TableCell>
                        <TableCell>{entry.company}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={entry.isSubcontractor
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'}>
                            {entry.isSubcontractor ? 'UE' : 'Egen'}
                          </Badge>
                        </TableCell>
                        <TableCell>{entry.project}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <LogIn className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="tabular-nums">{entry.checkIn || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {entry.checkOut ? (
                            <div className="flex items-center gap-1">
                              <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="tabular-nums">{entry.checkOut}</span>
                            </div>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleCheckOut(entry)}>
                              <LogOut className="mr-1 h-3.5 w-3.5" />Checka ut
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(entry)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(entry); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera registrering' : 'Ny personalregistrering'}</DialogTitle>
            <DialogDescription>Registrera person i personalliggaren. Krävs enligt lag (SFS 2006:575) på alla byggarbetsplatser.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Namn *</Label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Förnamn Efternamn" />
              </div>
              <div className="grid gap-2">
                <Label>Personnummer *</Label>
                <Input value={form.personnummer} onChange={(e) => setForm(f => ({ ...f, personnummer: e.target.value }))} placeholder="YYYYMMDD-NNNN" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Företag *</Label>
                <Input value={form.company} onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Företagsnamn" />
              </div>
              <div className="grid gap-2">
                <Label>Projekt</Label>
                <Input value={form.project} onChange={(e) => setForm(f => ({ ...f, project: e.target.value }))} placeholder="Projektnamn" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Underentreprenör (UE)</Label>
              <Switch checked={form.isSubcontractor} onCheckedChange={(v) => setForm(f => ({ ...f, isSubcontractor: v }))} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Datum</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Incheckning</Label>
                <Input type="time" value={form.checkIn} onChange={(e) => setForm(f => ({ ...f, checkIn: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Utcheckning</Label>
                <Input type="time" value={form.checkOut} onChange={(e) => setForm(f => ({ ...f, checkOut: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Valfria anteckningar" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || !form.personnummer.trim()}>
              {editingEntry ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort registrering</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort registreringen för {entryToDelete?.name}?</DialogDescription>
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
