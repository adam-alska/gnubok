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
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Plus,
  Loader2,
  Moon,
  CheckCircle,
  Search,
  Trash2,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface RevenueCategory {
  key: string
  label: string
  amount: number
}

interface NightAuditRecord {
  id: string
  date: string
  roomRevenue: number
  conferenceRevenue: number
  fbRevenue: number
  spaRevenue: number
  otherRevenue: number
  cashOnHand: number
  cashExpected: number
  cashDifference: number
  noShowCount: number
  noShowCharge: number
  verified: boolean
  notes: string
  createdAt: string
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_FORM = {
  date: todayStr(),
  roomRevenue: 0,
  conferenceRevenue: 0,
  fbRevenue: 0,
  spaRevenue: 0,
  otherRevenue: 0,
  cashOnHand: 0,
  cashExpected: 0,
  noShowCount: 0,
  noShowCharge: 0,
  verified: false,
  notes: '',
}

export function NattrevisionWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<NightAuditRecord[]>([])
  const [searchDate, setSearchDate] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<NightAuditRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<NightAuditRecord | null>(null)

  const saveRecords = useCallback(async (newRecords: NightAuditRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'night_audits', config_value: newRecords },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'night_audits')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setRecords(data.config_value as NightAuditRecord[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const filteredRecords = useMemo(() => {
    let result = records
    if (searchDate) {
      result = result.filter(r => r.date.includes(searchDate))
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [records, searchDate])

  const totalRevenue = form.roomRevenue + form.conferenceRevenue + form.fbRevenue + form.spaRevenue + form.otherRevenue
  const cashDifference = form.cashOnHand - form.cashExpected

  function openNew() {
    setEditingRecord(null)
    setForm({ ...EMPTY_FORM, date: todayStr() })
    setDialogOpen(true)
  }

  function openEdit(record: NightAuditRecord) {
    setEditingRecord(record)
    setForm({
      date: record.date,
      roomRevenue: record.roomRevenue,
      conferenceRevenue: record.conferenceRevenue,
      fbRevenue: record.fbRevenue,
      spaRevenue: record.spaRevenue,
      otherRevenue: record.otherRevenue,
      cashOnHand: record.cashOnHand,
      cashExpected: record.cashExpected,
      noShowCount: record.noShowCount,
      noShowCharge: record.noShowCharge,
      verified: record.verified,
      notes: record.notes,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: NightAuditRecord = {
      id: editingRecord?.id ?? generateId(),
      date: form.date,
      roomRevenue: form.roomRevenue,
      conferenceRevenue: form.conferenceRevenue,
      fbRevenue: form.fbRevenue,
      spaRevenue: form.spaRevenue,
      otherRevenue: form.otherRevenue,
      cashOnHand: form.cashOnHand,
      cashExpected: form.cashExpected,
      cashDifference: form.cashOnHand - form.cashExpected,
      noShowCount: form.noShowCount,
      noShowCharge: form.noShowCharge,
      verified: form.verified,
      notes: form.notes.trim(),
      createdAt: editingRecord?.createdAt ?? new Date().toISOString(),
    }
    let updated: NightAuditRecord[]
    if (editingRecord) {
      updated = records.map(r => r.id === editingRecord.id ? item : r)
    } else {
      if (records.some(r => r.date === form.date)) {
        // Prevent duplicate date - update instead
        updated = records.map(r => r.date === form.date ? { ...item, id: r.id } : r)
      } else {
        updated = [...records, item]
      }
    }
    setRecords(updated)
    setDialogOpen(false)
    await saveRecords(updated)
  }

  async function handleDelete() {
    if (!recordToDelete) return
    const updated = records.filter(r => r.id !== recordToDelete.id)
    setRecords(updated)
    setDeleteDialogOpen(false)
    setRecordToDelete(null)
    await saveRecords(updated)
  }

  async function toggleVerified(id: string) {
    const updated = records.map(r => r.id === id ? { ...r, verified: !r.verified } : r)
    setRecords(updated)
    await saveRecords(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny nattrevision
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="month"
                  value={searchDate}
                  onChange={e => setSearchDate(e.target.value)}
                  className="pl-9"
                  placeholder="Filtrera manad"
                />
              </div>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...
                </div>
              )}
            </div>

            {/* Records table */}
            {filteredRecords.length === 0 ? (
              <EmptyModuleState
                icon={Moon}
                title="Inga nattrevisioner"
                description="Skapa en nattrevision for att registrera dagens intakter och avstamning."
                actionLabel="Ny nattrevision"
                onAction={openNew}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium text-right">Rum</TableHead>
                      <TableHead className="font-medium text-right">Konferens</TableHead>
                      <TableHead className="font-medium text-right">F&B</TableHead>
                      <TableHead className="font-medium text-right">Spa</TableHead>
                      <TableHead className="font-medium text-right">Totalt</TableHead>
                      <TableHead className="font-medium text-right">Kassadiff</TableHead>
                      <TableHead className="font-medium text-center">No-show</TableHead>
                      <TableHead className="font-medium text-center">Verifierad</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map(rec => {
                      const total = rec.roomRevenue + rec.conferenceRevenue + rec.fbRevenue + rec.spaRevenue + rec.otherRevenue
                      return (
                        <TableRow key={rec.id}>
                          <TableCell className="font-medium">{rec.date}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(rec.roomRevenue)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(rec.conferenceRevenue)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(rec.fbRevenue)}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(rec.spaRevenue)}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{fmt(total)}</TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={rec.cashDifference !== 0 ? 'text-red-600' : 'text-emerald-600'}>
                              {fmt(rec.cashDifference)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">{rec.noShowCount > 0 ? `${rec.noShowCount} (${fmt(rec.noShowCharge)} kr)` : '-'}</TableCell>
                          <TableCell className="text-center">
                            <Button variant="ghost" size="icon" onClick={() => toggleVerified(rec.id)}>
                              <CheckCircle className={`h-4 w-4 ${rec.verified ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                            </Button>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(rec)} title="Redigera">
                                <Moon className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setRecordToDelete(rec); setDeleteDialogOpen(true) }} title="Ta bort">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      {/* Night Audit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Redigera nattrevision' : 'Ny nattrevision'}</DialogTitle>
            <DialogDescription>Registrera dagens intakter per kategori och avstam kassan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <Label>Datum *</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <Separator />
            <h4 className="text-sm font-semibold">Intakter per kategori</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Rum (kr)</Label>
                <Input type="number" min={0} step="0.01" value={form.roomRevenue || ''} onChange={e => setForm(f => ({ ...f, roomRevenue: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Konferens (kr)</Label>
                <Input type="number" min={0} step="0.01" value={form.conferenceRevenue || ''} onChange={e => setForm(f => ({ ...f, conferenceRevenue: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Mat & Dryck (kr)</Label>
                <Input type="number" min={0} step="0.01" value={form.fbRevenue || ''} onChange={e => setForm(f => ({ ...f, fbRevenue: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Spa (kr)</Label>
                <Input type="number" min={0} step="0.01" value={form.spaRevenue || ''} onChange={e => setForm(f => ({ ...f, spaRevenue: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Ovrigt (kr)</Label>
                <Input type="number" min={0} step="0.01" value={form.otherRevenue || ''} onChange={e => setForm(f => ({ ...f, otherRevenue: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label className="font-semibold">Totalt</Label>
                <div className="h-9 flex items-center font-mono font-semibold text-lg">{fmt(totalRevenue)} kr</div>
              </div>
            </div>
            <Separator />
            <h4 className="text-sm font-semibold">Kassaavstamning</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kassa (faktisk, kr)</Label>
                <Input type="number" step="0.01" value={form.cashOnHand || ''} onChange={e => setForm(f => ({ ...f, cashOnHand: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Kassa (forvantad, kr)</Label>
                <Input type="number" step="0.01" value={form.cashExpected || ''} onChange={e => setForm(f => ({ ...f, cashExpected: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <span className="text-muted-foreground">Kassadifferens: </span>
              <span className={`font-mono font-semibold ${cashDifference !== 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {fmt(cashDifference)} kr
              </span>
            </div>
            <Separator />
            <h4 className="text-sm font-semibold">No-show</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Antal no-show</Label>
                <Input type="number" min={0} value={form.noShowCount || ''} onChange={e => setForm(f => ({ ...f, noShowCount: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>No-show avgift (kr)</Label>
                <Input type="number" min={0} step="0.01" value={form.noShowCharge || ''} onChange={e => setForm(f => ({ ...f, noShowCharge: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-3">
              <Switch checked={form.verified} onCheckedChange={val => setForm(f => ({ ...f, verified: val }))} />
              <Label>Markera som verifierad</Label>
            </div>
            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Eventuella noteringar..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.date}>{editingRecord ? 'Uppdatera' : 'Spara revision'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort nattrevision</DialogTitle>
            <DialogDescription>Ar du saker pa att du vill ta bort nattrevisionen for {recordToDelete?.date}?</DialogDescription>
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
