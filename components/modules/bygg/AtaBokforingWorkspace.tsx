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
  FileText,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type AtaType = 'Ändring' | 'Tillägg' | 'Avgående'
type AtaBookingStatus = 'Registrerad' | 'Kostnadsbokförd' | 'Intäktsbokförd' | 'Slutbokförd'

interface AtaBooking {
  id: string
  ataNumber: string
  project: string
  type: AtaType
  description: string
  costAmount: number
  revenueAmount: number
  costAccount: string
  revenueAccount: string
  status: AtaBookingStatus
  approvedDate: string
  bookedDate: string
  notes: string
}

const EMPTY_FORM = {
  ataNumber: '',
  project: '',
  type: 'Tillägg' as AtaType,
  description: '',
  costAmount: 0,
  revenueAmount: 0,
  costAccount: '4010',
  revenueAccount: '3011',
  status: 'Registrerad' as AtaBookingStatus,
  approvedDate: '',
  bookedDate: '',
  notes: '',
}

const STATUS_COLORS: Record<AtaBookingStatus, string> = {
  'Registrerad': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Kostnadsbokförd': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Intäktsbokförd': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Slutbokförd': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
}

const TYPE_COLORS: Record<AtaType, string> = {
  'Ändring': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Tillägg': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Avgående': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function AtaBokforingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bookings, setBookings] = useState<AtaBooking[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<AtaType | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<AtaBooking | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [bookingToDelete, setBookingToDelete] = useState<AtaBooking | null>(null)

  const saveBookings = useCallback(async (items: AtaBooking[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'ata_bookings', config_value: items },
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
      .eq('module_slug', mod.slug).eq('config_key', 'ata_bookings')
      .maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) {
      setBookings(data.config_value as AtaBooking[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = useMemo(() => {
    let result = bookings
    if (filterType !== 'all') result = result.filter((b) => b.type === filterType)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((b) =>
        b.ataNumber.toLowerCase().includes(q) ||
        b.project.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.ataNumber.localeCompare(a.ataNumber))
  }, [bookings, filterType, searchQuery])

  const stats = useMemo(() => {
    const totalCost = bookings.reduce((s, b) => s + b.costAmount, 0)
    const totalRevenue = bookings.reduce((s, b) => s + b.revenueAmount, 0)
    const margin = totalRevenue - totalCost
    const unbookedCount = bookings.filter(b => b.status !== 'Slutbokförd').length
    return { totalCost, totalRevenue, margin, unbookedCount }
  }, [bookings])

  function openNew() {
    setEditingBooking(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(b: AtaBooking) {
    setEditingBooking(b)
    setForm({ ...b })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: AtaBooking = {
      id: editingBooking?.id ?? generateId(),
      ...form,
      costAmount: Number(form.costAmount),
      revenueAmount: Number(form.revenueAmount),
    }
    let updated: AtaBooking[]
    if (editingBooking) {
      updated = bookings.map((b) => b.id === editingBooking.id ? item : b)
    } else {
      updated = [...bookings, item]
    }
    setBookings(updated)
    setDialogOpen(false)
    await saveBookings(updated)
  }

  async function handleDelete() {
    if (!bookingToDelete) return
    const updated = bookings.filter((b) => b.id !== bookingToDelete.id)
    setBookings(updated)
    setDeleteDialogOpen(false)
    setBookingToDelete(null)
    await saveBookings(updated)
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
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny ÄTA-bokföring
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
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ÄTA-kostnader</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalCost)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ÄTA-intäkter</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{fmt(stats.totalRevenue)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ÄTA-marginal</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className={`text-2xl font-semibold tracking-tight ${stats.margin < 0 ? 'text-red-600' : ''}`}>{fmt(stats.margin)}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">kr</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ej slutbokförda</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{stats.unbookedCount}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">ÄTA</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök ÄTA-nummer, projekt..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as AtaType | 'all')}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera typ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla typer</SelectItem>
                  <SelectItem value="Ändring">Ändring</SelectItem>
                  <SelectItem value="Tillägg">Tillägg</SelectItem>
                  <SelectItem value="Avgående">Avgående</SelectItem>
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
                icon={FileText}
                title="Inga ÄTA-bokföringar"
                description="Bokför ÄTA (ändringar, tillägg, avgående) med koppling till projekt. Kostnadspåverkan och intäktsökning vid godkännande."
                actionLabel="Ny ÄTA-bokföring"
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
                      <TableHead className="font-medium text-right">Kostnad</TableHead>
                      <TableHead className="font-medium text-right">Intäkt</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono font-medium">{b.ataNumber}</TableCell>
                        <TableCell>{b.project}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={TYPE_COLORS[b.type]}>{b.type}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(b.costAmount)} kr</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(b.revenueAmount)} kr</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[b.status]}>{b.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(b)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setBookingToDelete(b); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
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
            <DialogTitle>{editingBooking ? 'Redigera ÄTA-bokföring' : 'Ny ÄTA-bokföring'}</DialogTitle>
            <DialogDescription>Bokför ändringar, tillägg och avgående med koppling till projekt och konto.</DialogDescription>
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
              <Label>Beskrivning</Label>
              <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Beskrivning av ÄTA" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kostnadsbelopp (kr)</Label>
                <Input type="number" value={form.costAmount || ''} onChange={(e) => setForm(f => ({ ...f, costAmount: Number(e.target.value) }))} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label>Intäktsbelopp (kr)</Label>
                <Input type="number" value={form.revenueAmount || ''} onChange={(e) => setForm(f => ({ ...f, revenueAmount: Number(e.target.value) }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kostnadskonto</Label>
                <Input value={form.costAccount} onChange={(e) => setForm(f => ({ ...f, costAccount: e.target.value }))} placeholder="4010" />
              </div>
              <div className="grid gap-2">
                <Label>Intäktskonto</Label>
                <Input value={form.revenueAccount} onChange={(e) => setForm(f => ({ ...f, revenueAccount: e.target.value }))} placeholder="3011" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as AtaBookingStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Registrerad">Registrerad</SelectItem>
                    <SelectItem value="Kostnadsbokförd">Kostnadsbokförd</SelectItem>
                    <SelectItem value="Intäktsbokförd">Intäktsbokförd</SelectItem>
                    <SelectItem value="Slutbokförd">Slutbokförd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Godkännandedatum</Label>
                <Input type="date" value={form.approvedDate} onChange={(e) => setForm(f => ({ ...f, approvedDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Bokföringsdatum</Label>
                <Input type="date" value={form.bookedDate} onChange={(e) => setForm(f => ({ ...f, bookedDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ytterligare information" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.ataNumber.trim() || !form.project.trim()}>
              {editingBooking ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort ÄTA-bokföring</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort {bookingToDelete?.ataNumber}?</DialogDescription>
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
