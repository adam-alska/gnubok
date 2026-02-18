'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  FileText,
  ShieldCheck,
  ClipboardList,
  Eye,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type NoteType = 'Anamnes' | 'Bedömning' | 'Åtgärd' | 'Diagnos' | 'Vårdplan' | 'Uppföljning' | 'Remissvar' | 'Övrigt'

interface JournalEntry {
  id: string
  patientRef: string
  patientName: string
  date: string
  noteType: NoteType
  practitioner: string
  diagnosisCode: string
  content: string
  carePlan: string
  gdprConsent: boolean
  lastModified: string
}

const NOTE_TYPES: NoteType[] = ['Anamnes', 'Bedömning', 'Åtgärd', 'Diagnos', 'Vårdplan', 'Uppföljning', 'Remissvar', 'Övrigt']

const NOTE_TYPE_COLORS: Record<NoteType, string> = {
  'Anamnes': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Bedömning': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Åtgärd': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Diagnos': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'Vårdplan': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Uppföljning': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Remissvar': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  'Övrigt': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function JournalhanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<JournalEntry[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterNoteType, setFilterNoteType] = useState<NoteType | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [entryForm, setEntryForm] = useState({
    patientRef: '',
    patientName: '',
    date: todayStr(),
    noteType: 'Anamnes' as NoteType,
    practitioner: '',
    diagnosisCode: '',
    content: '',
    carePlan: '',
    gdprConsent: true,
  })

  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<JournalEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: JournalEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'journal_entries',
        config_value: newEntries,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'journal_entries')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setEntries(data.config_value as JournalEntry[])
    } else {
      setEntries([])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    let result = entries
    if (filterNoteType !== 'all') {
      result = result.filter((e) => e.noteType === filterNoteType)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (e) =>
          e.patientName.toLowerCase().includes(q) ||
          e.patientRef.toLowerCase().includes(q) ||
          e.practitioner.toLowerCase().includes(q) ||
          e.diagnosisCode.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, filterNoteType, searchQuery])

  const stats = useMemo(() => ({
    totalEntries: entries.length,
    uniquePatients: new Set(entries.map((e) => e.patientRef)).size,
    withDiagnosis: entries.filter((e) => e.diagnosisCode).length,
    withCarePlan: entries.filter((e) => e.carePlan).length,
    gdprConsent: entries.filter((e) => e.gdprConsent).length,
  }), [entries])

  function openNewEntry() {
    setEditingEntry(null)
    setEntryForm({
      patientRef: '',
      patientName: '',
      date: todayStr(),
      noteType: 'Anamnes',
      practitioner: '',
      diagnosisCode: '',
      content: '',
      carePlan: '',
      gdprConsent: true,
    })
    setDialogOpen(true)
  }

  function openEditEntry(entry: JournalEntry) {
    setEditingEntry(entry)
    setEntryForm({
      patientRef: entry.patientRef,
      patientName: entry.patientName,
      date: entry.date,
      noteType: entry.noteType,
      practitioner: entry.practitioner,
      diagnosisCode: entry.diagnosisCode,
      content: entry.content,
      carePlan: entry.carePlan,
      gdprConsent: entry.gdprConsent,
    })
    setDialogOpen(true)
  }

  async function handleSaveEntry() {
    const newEntry: JournalEntry = {
      id: editingEntry ? editingEntry.id : generateId(),
      patientRef: entryForm.patientRef.trim(),
      patientName: entryForm.patientName.trim(),
      date: entryForm.date,
      noteType: entryForm.noteType,
      practitioner: entryForm.practitioner.trim(),
      diagnosisCode: entryForm.diagnosisCode.trim(),
      content: entryForm.content.trim(),
      carePlan: entryForm.carePlan.trim(),
      gdprConsent: entryForm.gdprConsent,
      lastModified: todayStr(),
    }

    let updated: JournalEntry[]
    if (editingEntry) {
      updated = entries.map((e) => e.id === editingEntry.id ? newEntry : e)
    } else {
      updated = [...entries, newEntry]
    }

    setEntries(updated)
    setDialogOpen(false)
    await saveEntries(updated)
  }

  function openViewEntry(entry: JournalEntry) {
    setViewEntry(entry)
    setViewDialogOpen(true)
  }

  function openDeleteConfirmation(entry: JournalEntry) {
    setEntryToDelete(entry)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteEntry() {
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
        sectorName="Hälsa & Sjukvård"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewEntry}>
            <Plus className="mr-2 h-4 w-4" />
            Ny journalanteckning
          </Button>
        }
      >
        <Tabs defaultValue="journaler" className="space-y-6">
          <TabsList>
            <TabsTrigger value="journaler">Journaler</TabsTrigger>
            <TabsTrigger value="gdpr">GDPR-efterlevnad</TabsTrigger>
          </TabsList>

          <TabsContent value="journaler" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <KPICard label="Journalanteckningar" value={stats.totalEntries.toString()} />
                  <KPICard label="Unika patienter" value={stats.uniquePatients.toString()} />
                  <KPICard label="Med diagnos" value={stats.withDiagnosis.toString()} />
                  <KPICard label="Med vårdplan" value={stats.withCarePlan.toString()} />
                  <KPICard label="GDPR-samtycke" value={stats.gdprConsent.toString()} trend={stats.gdprConsent === stats.totalEntries ? 'up' : 'neutral'} />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök patient, diagnos, innehåll..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterNoteType} onValueChange={(val) => setFilterNoteType(val as NoteType | 'all')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Anteckningstyp" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla typer</SelectItem>
                      {NOTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredEntries.length === 0 ? (
                  <EmptyModuleState
                    icon={FileText}
                    title="Inga journalanteckningar"
                    description={
                      searchQuery || filterNoteType !== 'all'
                        ? 'Inga anteckningar matchar dina sökkriterier.'
                        : 'Skapa en journalanteckning för att komma igång.'
                    }
                    actionLabel={!searchQuery && filterNoteType === 'all' ? 'Ny anteckning' : undefined}
                    onAction={!searchQuery && filterNoteType === 'all' ? openNewEntry : undefined}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Patient</TableHead>
                          <TableHead className="font-medium">Typ</TableHead>
                          <TableHead className="font-medium">Behandlare</TableHead>
                          <TableHead className="font-medium">Diagnoskod</TableHead>
                          <TableHead className="font-medium">GDPR</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="text-sm">{entry.date}</TableCell>
                            <TableCell>
                              <div>
                                <span className="font-medium">{entry.patientName}</span>
                                <span className="text-xs text-muted-foreground ml-2">{entry.patientRef}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={NOTE_TYPE_COLORS[entry.noteType]}>
                                {entry.noteType}
                              </Badge>
                            </TableCell>
                            <TableCell>{entry.practitioner}</TableCell>
                            <TableCell className="font-mono text-sm">{entry.diagnosisCode || '-'}</TableCell>
                            <TableCell>
                              {entry.gdprConsent ? (
                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <span className="text-red-500 text-xs">Saknas</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openViewEntry(entry)} title="Visa">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => openEditEntry(entry)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(entry)} title="Ta bort">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="gdpr" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-semibold">GDPR-efterlevnad</h3>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Patientjournaler hanteras enligt GDPR och Patientdatalagen (PDL).</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Samtycke dokumenteras per journalanteckning</li>
                  <li>Åtkomst loggas automatiskt</li>
                  <li>Patienten har rätt att begära registerutdrag</li>
                  <li>Journaler sparas minst 10 år enligt PDL</li>
                  <li>Radering kräver särskild prövning av IVO</li>
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Med samtycke</p>
                  <p className="text-xl font-semibold text-emerald-600">{stats.gdprConsent}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Utan samtycke</p>
                  <p className="text-xl font-semibold text-red-500">{stats.totalEntries - stats.gdprConsent}</p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Redigera journalanteckning' : 'Ny journalanteckning'}</DialogTitle>
            <DialogDescription>
              {editingEntry ? 'Uppdatera journalanteckningen.' : 'Skapa en ny journalanteckning.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="j-name">Patientnamn *</Label>
                <Input id="j-name" value={entryForm.patientName} onChange={(e) => setEntryForm((f) => ({ ...f, patientName: e.target.value }))} placeholder="Anna Andersson" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="j-ref">Patientreferens *</Label>
                <Input id="j-ref" value={entryForm.patientRef} onChange={(e) => setEntryForm((f) => ({ ...f, patientRef: e.target.value }))} placeholder="P-001" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="j-date">Datum *</Label>
                <Input id="j-date" type="date" value={entryForm.date} onChange={(e) => setEntryForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="j-type">Typ *</Label>
                <Select value={entryForm.noteType} onValueChange={(val) => setEntryForm((f) => ({ ...f, noteType: val as NoteType }))}>
                  <SelectTrigger id="j-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="j-diag">Diagnoskod</Label>
                <Input id="j-diag" value={entryForm.diagnosisCode} onChange={(e) => setEntryForm((f) => ({ ...f, diagnosisCode: e.target.value }))} placeholder="J06.9" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="j-pract">Behandlare *</Label>
              <Input id="j-pract" value={entryForm.practitioner} onChange={(e) => setEntryForm((f) => ({ ...f, practitioner: e.target.value }))} placeholder="Dr. Svensson" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="j-content">Journalanteckning *</Label>
              <Textarea id="j-content" value={entryForm.content} onChange={(e) => setEntryForm((f) => ({ ...f, content: e.target.value }))} placeholder="Patientens symtom, bedömning och åtgärder..." className="min-h-[120px]" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="j-plan">Vårdplan</Label>
              <Textarea id="j-plan" value={entryForm.carePlan} onChange={(e) => setEntryForm((f) => ({ ...f, carePlan: e.target.value }))} placeholder="Planerade åtgärder och uppföljning..." className="min-h-[80px]" />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="j-gdpr"
                checked={entryForm.gdprConsent}
                onChange={(e) => setEntryForm((f) => ({ ...f, gdprConsent: e.target.checked }))}
                className="rounded border-border"
              />
              <Label htmlFor="j-gdpr" className="text-sm">Patienten har gett samtycke till journalföring (GDPR)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveEntry} disabled={!entryForm.patientName.trim() || !entryForm.content.trim() || !entryForm.practitioner.trim()}>
              {editingEntry ? 'Uppdatera' : 'Spara anteckning'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Journalanteckning</DialogTitle>
            <DialogDescription>
              {viewEntry?.patientName} - {viewEntry?.date}
            </DialogDescription>
          </DialogHeader>
          {viewEntry && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={NOTE_TYPE_COLORS[viewEntry.noteType]}>{viewEntry.noteType}</Badge>
                {viewEntry.diagnosisCode && <Badge variant="outline" className="font-mono">{viewEntry.diagnosisCode}</Badge>}
                {viewEntry.gdprConsent && <ShieldCheck className="h-4 w-4 text-emerald-600" />}
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Patient:</span> {viewEntry.patientName} ({viewEntry.patientRef})</div>
                <div><span className="text-muted-foreground">Behandlare:</span> {viewEntry.practitioner}</div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Anteckning</p>
                <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3">{viewEntry.content}</p>
              </div>
              {viewEntry.carePlan && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Vårdplan</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3">{viewEntry.carePlan}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Senast ändrad: {viewEntry.lastModified}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Stäng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort journalanteckning</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort anteckningen för{' '}
              <span className="font-semibold">{entryToDelete?.patientName}</span> ({entryToDelete?.date})? Observera att radering av journaler kräver särskild prövning enligt PDL.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteEntry}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
