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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  FileText,
  Copy,
  Share2,
  PenTool,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type DocStatus = 'Utkast' | 'Granskas' | 'Signerat' | 'Delat' | 'Arkiverat'
type DocCategory = 'Kontrakt' | 'Fullmakt' | 'Yttrande' | 'PM' | 'Korrespondens' | 'Mall' | 'Övrigt'

interface DocumentEntry {
  id: string
  title: string
  caseRef: string
  clientName: string
  category: DocCategory
  status: DocStatus
  version: number
  createdDate: string
  modifiedDate: string
  author: string
  sharedWithClient: boolean
  eSigned: boolean
  note: string
}

const DOC_STATUSES: DocStatus[] = ['Utkast', 'Granskas', 'Signerat', 'Delat', 'Arkiverat']
const DOC_CATEGORIES: DocCategory[] = ['Kontrakt', 'Fullmakt', 'Yttrande', 'PM', 'Korrespondens', 'Mall', 'Övrigt']

const STATUS_COLORS: Record<DocStatus, string> = {
  'Utkast': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  'Granskas': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Signerat': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Delat': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Arkiverat': 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500',
}

const EMPTY_FORM = {
  title: '',
  caseRef: '',
  clientName: '',
  category: 'Kontrakt' as DocCategory,
  status: 'Utkast' as DocStatus,
  author: '',
  sharedWithClient: false,
  eSigned: false,
  note: '',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function DokumenthanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [documents, setDocuments] = useState<DocumentEntry[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<DocStatus | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<DocCategory | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<DocumentEntry | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [docToDelete, setDocToDelete] = useState<DocumentEntry | null>(null)

  const saveDocuments = useCallback(async (newDocs: DocumentEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'documents',
        config_value: newDocs,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'documents')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setDocuments(data.config_value as DocumentEntry[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  const filteredDocs = useMemo(() => {
    let result = documents
    if (filterStatus !== 'all') {
      result = result.filter((d) => d.status === filterStatus)
    }
    if (filterCategory !== 'all') {
      result = result.filter((d) => d.category === filterCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.caseRef.toLowerCase().includes(q) ||
          d.clientName.toLowerCase().includes(q) ||
          d.author.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.modifiedDate.localeCompare(a.modifiedDate))
  }, [documents, filterStatus, filterCategory, searchQuery])

  const summary = useMemo(() => {
    const total = documents.length
    const drafts = documents.filter((d) => d.status === 'Utkast').length
    const signed = documents.filter((d) => d.eSigned).length
    const shared = documents.filter((d) => d.sharedWithClient).length
    const templates = documents.filter((d) => d.category === 'Mall').length
    return { total, drafts, signed, shared, templates }
  }, [documents])

  function openNewDoc() {
    setEditingDoc(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEditDoc(doc: DocumentEntry) {
    setEditingDoc(doc)
    setForm({
      title: doc.title,
      caseRef: doc.caseRef,
      clientName: doc.clientName,
      category: doc.category,
      status: doc.status,
      author: doc.author,
      sharedWithClient: doc.sharedWithClient,
      eSigned: doc.eSigned,
      note: doc.note,
    })
    setDialogOpen(true)
  }

  async function handleSaveDoc() {
    const today = new Date().toISOString().slice(0, 10)

    let updated: DocumentEntry[]
    if (editingDoc) {
      updated = documents.map((d) =>
        d.id === editingDoc.id
          ? {
              ...d,
              ...form,
              title: form.title.trim(),
              caseRef: form.caseRef.trim(),
              clientName: form.clientName.trim(),
              author: form.author.trim(),
              note: form.note.trim(),
              modifiedDate: today,
              version: d.version + 1,
            }
          : d
      )
    } else {
      updated = [
        ...documents,
        {
          id: generateId(),
          ...form,
          title: form.title.trim(),
          caseRef: form.caseRef.trim(),
          clientName: form.clientName.trim(),
          author: form.author.trim(),
          note: form.note.trim(),
          version: 1,
          createdDate: today,
          modifiedDate: today,
        },
      ]
    }
    setDocuments(updated)
    setDialogOpen(false)
    await saveDocuments(updated)
  }

  async function handleNewVersion(doc: DocumentEntry) {
    const today = new Date().toISOString().slice(0, 10)
    const updated = documents.map((d) =>
      d.id === doc.id ? { ...d, version: d.version + 1, modifiedDate: today, status: 'Utkast' as DocStatus } : d
    )
    setDocuments(updated)
    await saveDocuments(updated)
  }

  async function handleToggleShare(doc: DocumentEntry) {
    const updated = documents.map((d) =>
      d.id === doc.id ? { ...d, sharedWithClient: !d.sharedWithClient, status: !d.sharedWithClient ? 'Delat' as DocStatus : d.status } : d
    )
    setDocuments(updated)
    await saveDocuments(updated)
  }

  async function handleESign(doc: DocumentEntry) {
    const today = new Date().toISOString().slice(0, 10)
    const updated = documents.map((d) =>
      d.id === doc.id ? { ...d, eSigned: true, status: 'Signerat' as DocStatus, modifiedDate: today } : d
    )
    setDocuments(updated)
    await saveDocuments(updated)
  }

  function openDeleteConfirmation(doc: DocumentEntry) {
    setDocToDelete(doc)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteDoc() {
    if (!docToDelete) return
    const updated = documents.filter((d) => d.id !== docToDelete.id)
    setDocuments(updated)
    setDeleteDialogOpen(false)
    setDocToDelete(null)
    await saveDocuments(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Juridik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewDoc}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt dokument
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Oversikt</TabsTrigger>
            <TabsTrigger value="dokument">Dokument</TabsTrigger>
            <TabsTrigger value="mallar">Mallbibliotek</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <EmptyModuleState
                icon={FileText}
                title="Inga dokument"
                description="Skapa dokument per arende med versionering och e-signering."
                actionLabel="Nytt dokument"
                onAction={openNewDoc}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Totalt dokument" value={String(summary.total)} />
                <KPICard label="Utkast" value={String(summary.drafts)} />
                <KPICard label="E-signerade" value={String(summary.signed)} />
                <KPICard label="Delade med klient" value={String(summary.shared)} />
                <KPICard label="Mallar" value={String(summary.templates)} />
              </div>
            )}
          </TabsContent>

          {/* Documents */}
          <TabsContent value="dokument" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sok dokument..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as DocStatus | 'all')}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      {DOC_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterCategory} onValueChange={(val) => setFilterCategory(val as DocCategory | 'all')}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla kategorier</SelectItem>
                      {DOC_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredDocs.length === 0 ? (
                  <EmptyModuleState
                    icon={FileText}
                    title="Inga dokument hittades"
                    description="Inga dokument matchar filtret."
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Titel</TableHead>
                          <TableHead className="font-medium">Arende</TableHead>
                          <TableHead className="font-medium">Kategori</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium text-right">Ver.</TableHead>
                          <TableHead className="font-medium">Andrad</TableHead>
                          <TableHead className="font-medium text-right">Atgarder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDocs.map((doc) => (
                          <TableRow key={doc.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {doc.title}
                                {doc.eSigned && <PenTool className="h-3.5 w-3.5 text-emerald-600" />}
                                {doc.sharedWithClient && <Share2 className="h-3.5 w-3.5 text-blue-600" />}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{doc.caseRef}</TableCell>
                            <TableCell><Badge variant="outline">{doc.category}</Badge></TableCell>
                            <TableCell><Badge variant="secondary" className={STATUS_COLORS[doc.status]}>{doc.status}</Badge></TableCell>
                            <TableCell className="text-right tabular-nums">v{doc.version}</TableCell>
                            <TableCell className="text-sm">{doc.modifiedDate}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleNewVersion(doc)} title="Ny version">
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleToggleShare(doc)} title={doc.sharedWithClient ? 'Avdela' : 'Dela med klient'}>
                                  <Share2 className={cn('h-4 w-4', doc.sharedWithClient && 'text-blue-600')} />
                                </Button>
                                {!doc.eSigned && (
                                  <Button variant="ghost" size="icon" onClick={() => handleESign(doc)} title="E-signera">
                                    <PenTool className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => openEditDoc(doc)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(doc)} title="Ta bort">
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

          {/* Templates */}
          <TabsContent value="mallar" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {(() => {
                  const templates = documents.filter((d) => d.category === 'Mall')
                  if (templates.length === 0) {
                    return (
                      <EmptyModuleState
                        icon={FileText}
                        title="Inga mallar"
                        description="Skapa dokument med kategorin 'Mall' for att bygga upp mallbiblioteket."
                        actionLabel="Ny mall"
                        onAction={openNewDoc}
                      />
                    )
                  }
                  return (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {templates.map((doc) => (
                        <div key={doc.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-sm font-medium">{doc.title}</h3>
                              <p className="text-xs text-muted-foreground mt-1">v{doc.version} - {doc.modifiedDate}</p>
                            </div>
                            <Badge variant="outline">{doc.category}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{doc.note || 'Ingen beskrivning'}</p>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEditDoc(doc)}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Redigera
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDoc ? 'Redigera dokument' : 'Nytt dokument'}</DialogTitle>
            <DialogDescription>
              {editingDoc ? 'Uppdatera dokumentuppgifter.' : 'Skapa ett nytt dokument med versionering.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="doc-title">Titel *</Label>
              <Input id="doc-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Samarbetsavtal" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="doc-case">Arende</Label>
                <Input id="doc-case" value={form.caseRef} onChange={(e) => setForm((f) => ({ ...f, caseRef: e.target.value }))} placeholder="2024-001" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="doc-client">Klient</Label>
                <Input id="doc-client" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="Klient AB" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="doc-cat">Kategori</Label>
                <Select value={form.category} onValueChange={(val) => setForm((f) => ({ ...f, category: val as DocCategory }))}>
                  <SelectTrigger id="doc-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="doc-status">Status</Label>
                <Select value={form.status} onValueChange={(val) => setForm((f) => ({ ...f, status: val as DocStatus }))}>
                  <SelectTrigger id="doc-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="doc-author">Forfattare</Label>
                <Input id="doc-author" value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} placeholder="Namn" />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox id="doc-shared" checked={form.sharedWithClient} onCheckedChange={(checked) => setForm((f) => ({ ...f, sharedWithClient: !!checked }))} />
                <Label htmlFor="doc-shared" className="text-sm cursor-pointer">Delat med klient</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="doc-esign" checked={form.eSigned} onCheckedChange={(checked) => setForm((f) => ({ ...f, eSigned: !!checked }))} />
                <Label htmlFor="doc-esign" className="text-sm cursor-pointer">E-signerat</Label>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-note">Anteckning</Label>
              <Input id="doc-note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Frivillig anteckning..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveDoc} disabled={!form.title.trim()}>
              {editingDoc ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort dokument</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort{' '}
              <span className="font-semibold">{docToDelete?.title}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteDoc}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
