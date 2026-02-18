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
  ClipboardList,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type AtaType = 'Ändring' | 'Tillägg' | 'Avgående'
type AtaStatus = 'Registrerad' | 'Skickad till kund' | 'Godkänd av kund' | 'Avslagen' | 'Fakturerad'

interface AtaItem {
  id: string
  ataNumber: string
  project: string
  type: AtaType
  title: string
  description: string
  amount: number
  customerContact: string
  status: AtaStatus
  registeredDate: string
  approvedDate: string
  invoiceRef: string
  notes: string
}

const EMPTY_FORM = {
  ataNumber: '',
  project: '',
  type: 'Tillägg' as AtaType,
  title: '',
  description: '',
  amount: 0,
  customerContact: '',
  status: 'Registrerad' as AtaStatus,
  registeredDate: new Date().toISOString().slice(0, 10),
  approvedDate: '',
  invoiceRef: '',
  notes: '',
}

const TYPE_COLORS: Record<AtaType, string> = {
  'Ändring': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Tillägg': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Avgående': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const STATUS_COLORS: Record<AtaStatus, string> = {
  'Registrerad': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Skickad till kund': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Godkänd av kund': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Avslagen': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'Fakturerad': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function AtaHanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<AtaItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<AtaStatus | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<AtaItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<AtaItem | null>(null)

  const saveItems = useCallback(async (data: AtaItem[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'ata_items', config_value: data },
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
      .eq('module_slug', mod.slug).eq('config_key', 'ata_items')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setItems(data.config_value as AtaItem[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    let result = items
    if (filterStatus !== 'all') result = result.filter((i) => i.status === filterStatus)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((i) =>
        i.ataNumber.toLowerCase().includes(q) ||
        i.project.toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.registeredDate.localeCompare(a.registeredDate))
  }, [items, filterStatus, searchQuery])

  const stats = useMemo(() => {
    const totalAmount = items.reduce((s, i) => s + i.amount, 0)
    const approvedAmount = items.filter(i => i.status === 'Godkänd av kund' || i.status === 'Fakturerad').reduce((s, i) => s + i.amount, 0)
    const pendingCount = items.filter(i => i.status === 'Registrerad' || i.status === 'Skickad till kund').length
    const invoicedCount = items.filter(i => i.status === 'Fakturerad').length
    return { totalAmount, approvedAmount, pendingCount, invoicedCount }
  }, [items])

  function openNew() {
    setEditingItem(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(item: AtaItem) {
    setEditingItem(item)
    setForm({ ...item })
    setDialogOpen(true)
  }

  async function handleSave() {
    const newItem: AtaItem = {
      id: editingItem?.id ?? generateId(),
      ...form,
      amount: Number(form.amount),
    }
    let updated: AtaItem[]
    if (editingItem) {
      updated = items.map((i) => i.id === editingItem.id ? newItem : i)
    } else {
      updated = [...items, newItem]
    }
    setItems(updated)
    setDialogOpen(false)
    await saveItems(updated)
  }

  async function handleDelete() {
    if (!itemToDelete) return
    const updated = items.filter((i) => i.id !== itemToDelete.id)
    setItems(updated)
    setDeleteDialogOpen(false)
    setItemToDelete(null)
    await saveItems(updated)
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
            Ny ÄTA
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
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt ÄTA-värde</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalAmount)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Godkänt värde</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.approvedAmount)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Väntar svar</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.pendingCount}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">ÄTA</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fakturerade</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.invoicedCount}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">ÄTA</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök ÄTA, projekt, titel..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as AtaStatus | 'all')}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrera status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  <SelectItem value="Registrerad">Registrerad</SelectItem>
                  <SelectItem value="Skickad till kund">Skickad till kund</SelectItem>
                  <SelectItem value="Godkänd av kund">Godkänd av kund</SelectItem>
                  <SelectItem value="Avslagen">Avslagen</SelectItem>
                  <SelectItem value="Fakturerad">Fakturerad</SelectItem>
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
                icon={ClipboardList}
                title="Inga ÄTA-ärenden"
                description="Hantera ändringar, tillägg och avgående. Registrera, skicka till kund för godkännande och koppla till faktura."
                actionLabel="Ny ÄTA"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">ÄTA-nr</TableHead>
                      <TableHead className="font-medium">Projekt</TableHead>
                      <TableHead className="font-medium">Typ</TableHead>
                      <TableHead className="font-medium">Titel</TableHead>
                      <TableHead className="font-medium text-right">Belopp</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono font-medium">{item.ataNumber}</TableCell>
                        <TableCell>{item.project}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={TYPE_COLORS[item.type]}>{item.type}</Badge>
                        </TableCell>
                        <TableCell>{item.title}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(item.amount)} kr</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[item.status]}>{item.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setItemToDelete(item); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
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
            <DialogTitle>{editingItem ? 'Redigera ÄTA' : 'Ny ÄTA'}</DialogTitle>
            <DialogDescription>Registrera ändring, tillägg eller avgående. Flöde: Registrering, kundgodkännande, fakturakoppling.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>ÄTA-nummer *</Label>
                <Input value={form.ataNumber} onChange={(e) => setForm(f => ({ ...f, ataNumber: e.target.value }))} placeholder="ÄTA-001" />
              </div>
              <div className="grid gap-2">
                <Label>Projekt *</Label>
                <Input value={form.project} onChange={(e) => setForm(f => ({ ...f, project: e.target.value }))} placeholder="Projektnamn" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Typ *</Label>
                <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as AtaType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ändring">Ändring</SelectItem>
                    <SelectItem value="Tillägg">Tillägg</SelectItem>
                    <SelectItem value="Avgående">Avgående</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Belopp (kr) *</Label>
                <Input type="number" value={form.amount || ''} onChange={(e) => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Titel *</Label>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Kort beskrivning" />
            </div>
            <div className="grid gap-2">
              <Label>Detaljbeskrivning</Label>
              <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kundkontakt</Label>
                <Input value={form.customerContact} onChange={(e) => setForm(f => ({ ...f, customerContact: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as AtaStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Registrerad">Registrerad</SelectItem>
                    <SelectItem value="Skickad till kund">Skickad till kund</SelectItem>
                    <SelectItem value="Godkänd av kund">Godkänd av kund</SelectItem>
                    <SelectItem value="Avslagen">Avslagen</SelectItem>
                    <SelectItem value="Fakturerad">Fakturerad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Registrerad</Label>
                <Input type="date" value={form.registeredDate} onChange={(e) => setForm(f => ({ ...f, registeredDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Godkänd</Label>
                <Input type="date" value={form.approvedDate} onChange={(e) => setForm(f => ({ ...f, approvedDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Fakturanr</Label>
                <Input value={form.invoiceRef} onChange={(e) => setForm(f => ({ ...f, invoiceRef: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.ataNumber.trim() || !form.project.trim() || !form.title.trim()}>
              {editingItem ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort ÄTA</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort {itemToDelete?.ataNumber} - {itemToDelete?.title}?</DialogDescription>
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
