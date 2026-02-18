'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
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
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  Search,
  Copy,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type DocumentType = 'cmr' | 'fraktsedel' | 'foljesedel' | 'other'
type DocumentStatus = 'draft' | 'issued' | 'signed' | 'delivered' | 'archived'

interface FreightDocument {
  id: string
  document_number: string
  document_type: DocumentType
  status: DocumentStatus
  date: string
  sender_name: string
  sender_address: string
  receiver_name: string
  receiver_address: string
  goods_description: string
  weight_kg: number
  packages_count: number
  vehicle_reg: string
  driver_name: string
  signed_by: string
  signed_date: string
  notes: string
}

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  cmr: 'CMR-fraktsedel',
  fraktsedel: 'Fraktsedel',
  foljesedel: 'Följesedel',
  other: 'Övrigt dokument',
}

const DOC_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Utkast',
  issued: 'Utfärdad',
  signed: 'Signerad',
  delivered: 'Levererad',
  archived: 'Arkiverad',
}

const DOC_STATUS_VARIANTS: Record<DocumentStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  draft: 'neutral',
  issued: 'info',
  signed: 'warning',
  delivered: 'success',
  archived: 'neutral',
}

const EMPTY_FORM = {
  document_number: '',
  document_type: 'fraktsedel' as DocumentType,
  status: 'draft' as DocumentStatus,
  date: '',
  sender_name: '',
  sender_address: '',
  receiver_name: '',
  receiver_address: '',
  goods_description: '',
  weight_kg: 0,
  packages_count: 0,
  vehicle_reg: '',
  driver_name: '',
  signed_by: '',
  signed_date: '',
  notes: '',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateDocNumber(type: DocumentType): string {
  const prefix = type === 'cmr' ? 'CMR' : type === 'fraktsedel' ? 'FS' : type === 'foljesedel' ? 'FJ' : 'DOK'
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`
}

export function FraktsedlarDokumentWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [documents, setDocuments] = useState<FreightDocument[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<DocumentType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<DocumentStatus | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<FreightDocument | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [docToDelete, setDocToDelete] = useState<FreightDocument | null>(null)

  const saveDocuments = useCallback(async (items: FreightDocument[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'freight_documents',
        config_value: items,
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
      .eq('config_key', 'freight_documents')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setDocuments(data.config_value as FreightDocument[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  const filtered = useMemo(() => {
    let result = documents
    if (filterType !== 'all') {
      result = result.filter((d) => d.document_type === filterType)
    }
    if (filterStatus !== 'all') {
      result = result.filter((d) => d.status === filterStatus)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((d) =>
        d.document_number.toLowerCase().includes(q) ||
        d.sender_name.toLowerCase().includes(q) ||
        d.receiver_name.toLowerCase().includes(q) ||
        d.goods_description.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [documents, filterType, filterStatus, searchQuery])

  const stats = useMemo(() => {
    const drafts = documents.filter((d) => d.status === 'draft').length
    const issued = documents.filter((d) => d.status === 'issued').length
    const signed = documents.filter((d) => d.status === 'signed').length
    const cmrCount = documents.filter((d) => d.document_type === 'cmr').length
    return { total: documents.length, drafts, issued, signed, cmrCount }
  }, [documents])

  function openNew() {
    const docType = 'fraktsedel' as DocumentType
    setEditingDoc(null)
    setForm({
      ...EMPTY_FORM,
      date: new Date().toISOString().split('T')[0],
      document_number: generateDocNumber(docType),
      document_type: docType,
    })
    setDialogOpen(true)
  }

  function openEdit(doc: FreightDocument) {
    setEditingDoc(doc)
    setForm({
      document_number: doc.document_number,
      document_type: doc.document_type,
      status: doc.status,
      date: doc.date,
      sender_name: doc.sender_name,
      sender_address: doc.sender_address,
      receiver_name: doc.receiver_name,
      receiver_address: doc.receiver_address,
      goods_description: doc.goods_description,
      weight_kg: doc.weight_kg,
      packages_count: doc.packages_count,
      vehicle_reg: doc.vehicle_reg,
      driver_name: doc.driver_name,
      signed_by: doc.signed_by,
      signed_date: doc.signed_date,
      notes: doc.notes,
    })
    setDialogOpen(true)
  }

  function duplicateDoc(doc: FreightDocument) {
    setEditingDoc(null)
    setForm({
      document_number: generateDocNumber(doc.document_type),
      document_type: doc.document_type,
      status: 'draft',
      date: new Date().toISOString().split('T')[0],
      sender_name: doc.sender_name,
      sender_address: doc.sender_address,
      receiver_name: doc.receiver_name,
      receiver_address: doc.receiver_address,
      goods_description: doc.goods_description,
      weight_kg: doc.weight_kg,
      packages_count: doc.packages_count,
      vehicle_reg: doc.vehicle_reg,
      driver_name: doc.driver_name,
      signed_by: '',
      signed_date: '',
      notes: '',
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: FreightDocument = {
      id: editingDoc?.id || crypto.randomUUID(),
      document_number: form.document_number.trim(),
      document_type: form.document_type,
      status: form.status,
      date: form.date,
      sender_name: form.sender_name.trim(),
      sender_address: form.sender_address.trim(),
      receiver_name: form.receiver_name.trim(),
      receiver_address: form.receiver_address.trim(),
      goods_description: form.goods_description.trim(),
      weight_kg: form.weight_kg,
      packages_count: form.packages_count,
      vehicle_reg: form.vehicle_reg.trim().toUpperCase(),
      driver_name: form.driver_name.trim(),
      signed_by: form.signed_by.trim(),
      signed_date: form.signed_date,
      notes: form.notes.trim(),
    }

    let updated: FreightDocument[]
    if (editingDoc) {
      updated = documents.map((d) => d.id === editingDoc.id ? item : d)
    } else {
      updated = [...documents, item]
    }

    setDocuments(updated)
    setDialogOpen(false)
    await saveDocuments(updated)
  }

  function openDeleteConfirmation(doc: FreightDocument) {
    setDocToDelete(doc)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!docToDelete) return
    const updated = documents.filter((d) => d.id !== docToDelete.id)
    setDocuments(updated)
    setDeleteDialogOpen(false)
    setDocToDelete(null)
    await saveDocuments(updated)
  }

  async function updateDocStatus(docId: string, newStatus: DocumentStatus) {
    const updated = documents.map((d) => d.id === docId ? { ...d, status: newStatus } : d)
    setDocuments(updated)
    await saveDocuments(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Transport & Logistik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt dokument
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <KPICard label="Totalt dokument" value={String(stats.total)} />
              <KPICard label="Utkast" value={String(stats.drafts)} />
              <KPICard label="Utfärdade" value={String(stats.issued)} />
              <KPICard label="Signerade" value={String(stats.signed)} />
              <KPICard label="CMR-fraktsedlar" value={String(stats.cmrCount)} />
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök dokument, avsändare, mottagare..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as DocumentType | 'all')}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Alla typer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla typer</SelectItem>
                  <SelectItem value="cmr">CMR</SelectItem>
                  <SelectItem value="fraktsedel">Fraktsedel</SelectItem>
                  <SelectItem value="foljesedel">Följesedel</SelectItem>
                  <SelectItem value="other">Övrigt</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as DocumentStatus | 'all')}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Alla statusar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  <SelectItem value="draft">Utkast</SelectItem>
                  <SelectItem value="issued">Utfärdad</SelectItem>
                  <SelectItem value="signed">Signerad</SelectItem>
                  <SelectItem value="delivered">Levererad</SelectItem>
                  <SelectItem value="archived">Arkiverad</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filtered.length === 0 ? (
              <EmptyModuleState
                icon={FileText}
                title="Inga fraktdokument"
                description="Skapa CMR-fraktsedlar, följesedlar och leveransdokument med digital signering."
                actionLabel="Nytt dokument"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Dokument</TableHead>
                      <TableHead className="font-medium">Typ</TableHead>
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">Avsändare</TableHead>
                      <TableHead className="font-medium">Mottagare</TableHead>
                      <TableHead className="font-medium text-right">Vikt</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-sm font-medium">{doc.document_number}</TableCell>
                        <TableCell><Badge variant="outline">{DOC_TYPE_LABELS[doc.document_type]}</Badge></TableCell>
                        <TableCell>{doc.date}</TableCell>
                        <TableCell>
                          <div className="text-sm">{doc.sender_name}</div>
                          {doc.sender_address && <div className="text-xs text-muted-foreground truncate max-w-[150px]">{doc.sender_address}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{doc.receiver_name}</div>
                          {doc.receiver_address && <div className="text-xs text-muted-foreground truncate max-w-[150px]">{doc.receiver_address}</div>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{doc.weight_kg > 0 ? `${fmt(doc.weight_kg)} kg` : '-'}</TableCell>
                        <TableCell><StatusBadge label={DOC_STATUS_LABELS[doc.status]} variant={DOC_STATUS_VARIANTS[doc.status]} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {doc.status === 'draft' && (
                              <Button variant="outline" size="sm" onClick={() => updateDocStatus(doc.id, 'issued')}>Utfärda</Button>
                            )}
                            {doc.status === 'issued' && (
                              <Button variant="outline" size="sm" onClick={() => updateDocStatus(doc.id, 'signed')}>Signera</Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => duplicateDoc(doc)} title="Duplicera"><Copy className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(doc)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(doc)} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {saving && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sparar...
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingDoc ? 'Redigera dokument' : 'Nytt fraktdokument'}</DialogTitle>
            <DialogDescription>
              {editingDoc ? 'Uppdatera dokumentets information.' : 'Skapa ett nytt fraktdokument (CMR, fraktsedel eller följesedel).'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-4 gap-4">
              <div className="grid gap-2">
                <Label>Dokumentnr *</Label>
                <Input value={form.document_number} onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Typ *</Label>
                <Select value={form.document_type} onValueChange={(v) => {
                  const newType = v as DocumentType
                  setForm((f) => ({
                    ...f,
                    document_type: newType,
                    document_number: editingDoc ? f.document_number : generateDocNumber(newType),
                  }))
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cmr">CMR-fraktsedel</SelectItem>
                    <SelectItem value="fraktsedel">Fraktsedel</SelectItem>
                    <SelectItem value="foljesedel">Följesedel</SelectItem>
                    <SelectItem value="other">Övrigt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as DocumentStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Utkast</SelectItem>
                    <SelectItem value="issued">Utfärdad</SelectItem>
                    <SelectItem value="signed">Signerad</SelectItem>
                    <SelectItem value="delivered">Levererad</SelectItem>
                    <SelectItem value="archived">Arkiverad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Datum *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Avsändare</h4>
                <div className="grid gap-2">
                  <Label>Namn *</Label>
                  <Input value={form.sender_name} onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))} placeholder="Företag AB" />
                </div>
                <div className="grid gap-2">
                  <Label>Adress</Label>
                  <Input value={form.sender_address} onChange={(e) => setForm((f) => ({ ...f, sender_address: e.target.value }))} placeholder="Gatan 1, 111 22 Stad" />
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mottagare</h4>
                <div className="grid gap-2">
                  <Label>Namn *</Label>
                  <Input value={form.receiver_name} onChange={(e) => setForm((f) => ({ ...f, receiver_name: e.target.value }))} placeholder="Kund AB" />
                </div>
                <div className="grid gap-2">
                  <Label>Adress</Label>
                  <Input value={form.receiver_address} onChange={(e) => setForm((f) => ({ ...f, receiver_address: e.target.value }))} placeholder="Vägen 2, 333 44 Stad" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Godsbeskrivning</Label>
                <Input value={form.goods_description} onChange={(e) => setForm((f) => ({ ...f, goods_description: e.target.value }))} placeholder="Pallgods, styckegods..." />
              </div>
              <div className="grid gap-2">
                <Label>Vikt (kg)</Label>
                <Input type="number" min={0} value={form.weight_kg || ''} onChange={(e) => setForm((f) => ({ ...f, weight_kg: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Antal kolli</Label>
                <Input type="number" min={0} value={form.packages_count || ''} onChange={(e) => setForm((f) => ({ ...f, packages_count: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fordon (regnr)</Label>
                <Input value={form.vehicle_reg} onChange={(e) => setForm((f) => ({ ...f, vehicle_reg: e.target.value }))} placeholder="ABC 123" />
              </div>
              <div className="grid gap-2">
                <Label>Förare</Label>
                <Input value={form.driver_name} onChange={(e) => setForm((f) => ({ ...f, driver_name: e.target.value }))} placeholder="Erik Svensson" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Signerad av</Label>
                <Input value={form.signed_by} onChange={(e) => setForm((f) => ({ ...f, signed_by: e.target.value }))} placeholder="Mottagarens namn" />
              </div>
              <div className="grid gap-2">
                <Label>Signeringsdatum</Label>
                <Input type="date" value={form.signed_date} onChange={(e) => setForm((f) => ({ ...f, signed_date: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Valfria anteckningar..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.document_number.trim() || !form.date || !form.sender_name.trim() || !form.receiver_name.trim()}>
              {editingDoc ? 'Uppdatera' : 'Skapa dokument'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort dokument</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort dokument{' '}
              <span className="font-mono font-semibold">{docToDelete?.document_number}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
