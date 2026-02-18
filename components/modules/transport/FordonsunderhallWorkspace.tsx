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
  Wrench,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ServiceStatus = 'scheduled' | 'in_progress' | 'completed' | 'overdue'
type ServiceType = 'routine' | 'repair' | 'inspection' | 'tire_change' | 'other'

interface MaintenanceRecord {
  id: string
  vehicle_name: string
  reg_number: string
  service_type: ServiceType
  description: string
  date: string
  next_service_date: string
  next_service_km: number
  current_km: number
  cost: number
  parts: string
  workshop: string
  status: ServiceStatus
  notes: string
}

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  routine: 'Rutinservice',
  repair: 'Reparation',
  inspection: 'Besiktning',
  tire_change: 'Däckbyte',
  other: 'Övrigt',
}

const STATUS_LABELS: Record<ServiceStatus, string> = {
  scheduled: 'Planerad',
  in_progress: 'Pågående',
  completed: 'Utförd',
  overdue: 'Försenad',
}

const STATUS_VARIANTS: Record<ServiceStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  overdue: 'danger',
}

const EMPTY_FORM = {
  vehicle_name: '',
  reg_number: '',
  service_type: 'routine' as ServiceType,
  description: '',
  date: '',
  next_service_date: '',
  next_service_km: 0,
  current_km: 0,
  cost: 0,
  parts: '',
  workshop: '',
  status: 'scheduled' as ServiceStatus,
  notes: '',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - new Date().getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function FordonsunderhallWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [records, setRecords] = useState<MaintenanceRecord[]>([])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<MaintenanceRecord | null>(null)

  const saveRecords = useCallback(async (items: MaintenanceRecord[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'maintenance_records',
        config_value: items,
      },
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
      .eq('config_key', 'maintenance_records')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setRecords(data.config_value as MaintenanceRecord[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const upcoming = useMemo(() => {
    return records.filter((r) => {
      if (r.status === 'completed') return false
      const d = daysUntil(r.next_service_date || r.date)
      return d != null && d >= 0 && d <= 30
    }).sort((a, b) => (a.next_service_date || a.date).localeCompare(b.next_service_date || b.date))
  }, [records])

  const overdue = useMemo(() => {
    return records.filter((r) => {
      if (r.status === 'completed') return false
      const d = daysUntil(r.next_service_date || r.date)
      return d != null && d < 0
    })
  }, [records])

  const history = useMemo(() => {
    return records
      .filter((r) => r.status === 'completed')
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [records])

  const totalCost = useMemo(() => records.reduce((s, r) => s + r.cost, 0), [records])

  function openNew() {
    setEditingRecord(null)
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] })
    setDialogOpen(true)
  }

  function openEdit(record: MaintenanceRecord) {
    setEditingRecord(record)
    setForm({
      vehicle_name: record.vehicle_name,
      reg_number: record.reg_number,
      service_type: record.service_type,
      description: record.description,
      date: record.date,
      next_service_date: record.next_service_date,
      next_service_km: record.next_service_km,
      current_km: record.current_km,
      cost: record.cost,
      parts: record.parts,
      workshop: record.workshop,
      status: record.status,
      notes: record.notes,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: MaintenanceRecord = {
      id: editingRecord?.id || crypto.randomUUID(),
      vehicle_name: form.vehicle_name.trim(),
      reg_number: form.reg_number.trim().toUpperCase(),
      service_type: form.service_type,
      description: form.description.trim(),
      date: form.date,
      next_service_date: form.next_service_date,
      next_service_km: form.next_service_km,
      current_km: form.current_km,
      cost: form.cost,
      parts: form.parts.trim(),
      workshop: form.workshop.trim(),
      status: form.status,
      notes: form.notes.trim(),
    }

    let updated: MaintenanceRecord[]
    if (editingRecord) {
      updated = records.map((r) => r.id === editingRecord.id ? item : r)
    } else {
      updated = [...records, item]
    }

    setRecords(updated)
    setDialogOpen(false)
    await saveRecords(updated)
  }

  function openDeleteConfirmation(record: MaintenanceRecord) {
    setRecordToDelete(record)
    setDeleteDialogOpen(true)
  }

  async function handleDelete() {
    if (!recordToDelete) return
    const updated = records.filter((r) => r.id !== recordToDelete.id)
    setRecords(updated)
    setDeleteDialogOpen(false)
    setRecordToDelete(null)
    await saveRecords(updated)
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
            Nytt underhåll
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="planering" className="space-y-6">
            <TabsList>
              <TabsTrigger value="planering">Planering</TabsTrigger>
              <TabsTrigger value="historik">Historik</TabsTrigger>
            </TabsList>

            <TabsContent value="planering" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Kommande (30d)" value={String(upcoming.length)} />
                <KPICard label="Försenade" value={String(overdue.length)} trend={overdue.length > 0 ? 'down' : 'neutral'} />
                <KPICard label="Utförda" value={String(history.length)} />
                <KPICard label="Total kostnad" value={fmt(totalCost)} unit="kr" />
              </div>

              {overdue.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-red-600">Försenade</h3>
                  <div className="space-y-2">
                    {overdue.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30 px-4 py-3">
                        <div>
                          <span className="font-medium text-sm">{r.vehicle_name}</span>
                          <span className="font-mono text-xs text-muted-foreground ml-2">{r.reg_number}</span>
                          <span className="text-xs text-muted-foreground ml-2">- {SERVICE_TYPE_LABELS[r.service_type]}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge label="Försenad" variant="danger" />
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {upcoming.length === 0 && overdue.length === 0 ? (
                <EmptyModuleState
                  icon={Wrench}
                  title="Inga planerade underhåll"
                  description="Lägg till serviceintervall och reservdelshistorik för dina fordon."
                  actionLabel="Nytt underhåll"
                  onAction={openNew}
                />
              ) : upcoming.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Kommande service</h3>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Fordon</TableHead>
                          <TableHead className="font-medium">Typ</TableHead>
                          <TableHead className="font-medium">Planerat datum</TableHead>
                          <TableHead className="font-medium">Dagar kvar</TableHead>
                          <TableHead className="font-medium">Verkstad</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {upcoming.map((r) => {
                          const days = daysUntil(r.next_service_date || r.date)
                          return (
                            <TableRow key={r.id}>
                              <TableCell>
                                <div className="font-medium">{r.vehicle_name}</div>
                                <div className="font-mono text-xs text-muted-foreground">{r.reg_number}</div>
                              </TableCell>
                              <TableCell><StatusBadge label={SERVICE_TYPE_LABELS[r.service_type]} variant="info" /></TableCell>
                              <TableCell>{r.next_service_date || r.date}</TableCell>
                              <TableCell>
                                <span className={days != null && days <= 7 ? 'text-amber-600 font-medium' : ''}>
                                  {days} dagar
                                </span>
                              </TableCell>
                              <TableCell>{r.workshop || '-'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(r)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </TabsContent>

            <TabsContent value="historik" className="space-y-4">
              {history.length === 0 ? (
                <EmptyModuleState icon={Wrench} title="Ingen underhållshistorik" description="Utförda underhåll visas här." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Fordon</TableHead>
                        <TableHead className="font-medium">Typ</TableHead>
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Beskrivning</TableHead>
                        <TableHead className="font-medium">Reservdelar</TableHead>
                        <TableHead className="font-medium text-right">Kostnad</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium">{r.vehicle_name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{r.reg_number}</div>
                          </TableCell>
                          <TableCell>{SERVICE_TYPE_LABELS[r.service_type]}</TableCell>
                          <TableCell>{r.date}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{r.description || '-'}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{r.parts || '-'}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(r.cost)} kr</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(r)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRecord ? 'Redigera underhåll' : 'Nytt underhåll'}</DialogTitle>
            <DialogDescription>
              {editingRecord ? 'Uppdatera underhållsinformationen.' : 'Registrera nytt underhåll eller service.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Fordon *</Label>
                <Input value={form.vehicle_name} onChange={(e) => setForm((f) => ({ ...f, vehicle_name: e.target.value }))} placeholder="Volvo FH16" />
              </div>
              <div className="grid gap-2">
                <Label>Regnr *</Label>
                <Input value={form.reg_number} onChange={(e) => setForm((f) => ({ ...f, reg_number: e.target.value }))} placeholder="ABC 123" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Typ</Label>
                <Select value={form.service_type} onValueChange={(v) => setForm((f) => ({ ...f, service_type: v as ServiceType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Rutinservice</SelectItem>
                    <SelectItem value="repair">Reparation</SelectItem>
                    <SelectItem value="inspection">Besiktning</SelectItem>
                    <SelectItem value="tire_change">Däckbyte</SelectItem>
                    <SelectItem value="other">Övrigt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as ServiceStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Planerad</SelectItem>
                    <SelectItem value="in_progress">Pågående</SelectItem>
                    <SelectItem value="completed">Utförd</SelectItem>
                    <SelectItem value="overdue">Försenad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Kostnad (kr)</Label>
                <Input type="number" min={0} value={form.cost || ''} onChange={(e) => setForm((f) => ({ ...f, cost: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Datum *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Nästa service</Label>
                <Input type="date" value={form.next_service_date} onChange={(e) => setForm((f) => ({ ...f, next_service_date: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Mätarställning (km)</Label>
                <Input type="number" min={0} value={form.current_km || ''} onChange={(e) => setForm((f) => ({ ...f, current_km: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Nästa service (km)</Label>
                <Input type="number" min={0} value={form.next_service_km || ''} onChange={(e) => setForm((f) => ({ ...f, next_service_km: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Beskrivning</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Oljebyte, bromskontroll..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Reservdelar</Label>
                <Input value={form.parts} onChange={(e) => setForm((f) => ({ ...f, parts: e.target.value }))} placeholder="Oljefilter, bromsskivor..." />
              </div>
              <div className="grid gap-2">
                <Label>Verkstad</Label>
                <Input value={form.workshop} onChange={(e) => setForm((f) => ({ ...f, workshop: e.target.value }))} placeholder="Volvos serviceverkstad" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.vehicle_name.trim() || !form.reg_number.trim() || !form.date}>
              {editingRecord ? 'Uppdatera' : 'Lägg till'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort underhåll</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort underhållet för{' '}
              <span className="font-semibold">{recordToDelete?.vehicle_name}</span> ({recordToDelete?.date})?
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
