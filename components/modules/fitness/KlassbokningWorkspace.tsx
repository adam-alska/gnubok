'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Pencil, Trash2, Loader2, CalendarDays, Clock } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type BookingStatus = 'bokad' | 'vantelista' | 'narvaro' | 'avbokad'

interface ClassBooking {
  id: string
  class_name: string
  date: string
  time: string
  member_name: string
  status: BookingStatus
  capacity: number
  booked_count: number
  waitlist_count: number
  instructor: string
}

const STATUS_LABELS: Record<BookingStatus, string> = { bokad: 'Bokad', vantelista: 'Väntelista', narvaro: 'Närvaro', avbokad: 'Avbokad' }
const STATUS_VARIANT: Record<BookingStatus, 'success' | 'warning' | 'info' | 'neutral'> = { bokad: 'info', vantelista: 'warning', narvaro: 'success', avbokad: 'neutral' }

function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function todayISO(): string { return new Date().toISOString().split('T')[0] }

const DEFAULT_BOOKINGS: ClassBooking[] = [
  { id: '1', class_name: 'Spinning', date: todayISO(), time: '07:00', member_name: 'Anna Svensson', status: 'bokad', capacity: 25, booked_count: 24, waitlist_count: 2, instructor: 'Maria' },
  { id: '2', class_name: 'Spinning', date: todayISO(), time: '07:00', member_name: 'Erik Lindgren', status: 'vantelista', capacity: 25, booked_count: 24, waitlist_count: 2, instructor: 'Maria' },
  { id: '3', class_name: 'Yoga', date: todayISO(), time: '12:00', member_name: 'Karin Holm', status: 'bokad', capacity: 20, booked_count: 15, waitlist_count: 0, instructor: 'Lisa' },
]

const EMPTY_FORM = { class_name: '', date: '', time: '', member_name: '', status: 'bokad' as BookingStatus, capacity: '25', booked_count: '0', waitlist_count: '0', instructor: '' }

export function KlassbokningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bookings, setBookings] = useState<ClassBooking[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<ClassBooking | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [bookingToDelete, setBookingToDelete] = useState<ClassBooking | null>(null)
  const [filterDate, setFilterDate] = useState(todayISO())

  const saveBookings = useCallback(async (newBookings: ClassBooking[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'class_bookings', config_value: newBookings }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'class_bookings').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setBookings(data.config_value as ClassBooking[]) }
    else { setBookings(DEFAULT_BOOKINGS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'class_bookings', config_value: DEFAULT_BOOKINGS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  const filteredBookings = useMemo(() => bookings.filter((b) => b.date === filterDate).sort((a, b) => a.time.localeCompare(b.time)), [bookings, filterDate])

  function openNew() { setEditingBooking(null); setForm({ ...EMPTY_FORM, date: filterDate }); setDialogOpen(true) }
  function openEdit(b: ClassBooking) { setEditingBooking(b); setForm({ class_name: b.class_name, date: b.date, time: b.time, member_name: b.member_name, status: b.status, capacity: String(b.capacity), booked_count: String(b.booked_count), waitlist_count: String(b.waitlist_count), instructor: b.instructor }); setDialogOpen(true) }

  async function handleSave() {
    const entry: ClassBooking = { id: editingBooking?.id ?? generateId(), class_name: form.class_name.trim(), date: form.date, time: form.time, member_name: form.member_name.trim(), status: form.status, capacity: parseInt(form.capacity) || 0, booked_count: parseInt(form.booked_count) || 0, waitlist_count: parseInt(form.waitlist_count) || 0, instructor: form.instructor.trim() }
    const updated = editingBooking ? bookings.map((b) => b.id === editingBooking.id ? entry : b) : [...bookings, entry]
    setBookings(updated); setDialogOpen(false); await saveBookings(updated)
  }

  function openDeleteConfirmation(b: ClassBooking) { setBookingToDelete(b); setDeleteDialogOpen(true) }
  async function handleDelete() { if (!bookingToDelete) return; const updated = bookings.filter((b) => b.id !== bookingToDelete.id); setBookings(updated); setDeleteDialogOpen(false); setBookingToDelete(null); await saveBookings(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fitness & Sport" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny bokning</Button>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Label>Datum</Label>
              <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-auto" />
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>
            {filteredBookings.length === 0 ? (
              <EmptyModuleState icon={CalendarDays} title="Inga bokningar" description="Det finns inga klassbokningar för detta datum." actionLabel="Ny bokning" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Klass</TableHead><TableHead className="font-medium">Tid</TableHead><TableHead className="font-medium">Instruktör</TableHead><TableHead className="font-medium">Medlem</TableHead><TableHead className="font-medium text-right">Bokade/Kap</TableHead><TableHead className="font-medium">Väntelista</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredBookings.map((b) => (
                      <TableRow key={b.id}><TableCell className="font-medium">{b.class_name}</TableCell><TableCell><div className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" />{b.time}</div></TableCell><TableCell>{b.instructor}</TableCell><TableCell>{b.member_name}</TableCell><TableCell className="text-right tabular-nums">{b.booked_count}/{b.capacity}</TableCell><TableCell>{b.waitlist_count > 0 ? <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">{b.waitlist_count} väntar</Badge> : '-'}</TableCell><TableCell><StatusBadge label={STATUS_LABELS[b.status]} variant={STATUS_VARIANT[b.status]} /></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(b)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
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
          <DialogHeader><DialogTitle>{editingBooking ? 'Redigera bokning' : 'Ny klassbokning'}</DialogTitle><DialogDescription>{editingBooking ? 'Uppdatera bokningens uppgifter.' : 'Skapa en ny klassbokning.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Klass *</Label><Input value={form.class_name} onChange={(e) => setForm((f) => ({ ...f, class_name: e.target.value }))} placeholder="Spinning" /></div><div className="grid gap-2"><Label>Instruktör</Label><Input value={form.instructor} onChange={(e) => setForm((f) => ({ ...f, instructor: e.target.value }))} /></div></div>
            <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div><div className="grid gap-2"><Label>Tid *</Label><Input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} /></div><div className="grid gap-2"><Label>Kapacitet</Label><Input type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} /></div></div>
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Medlemsnamn *</Label><Input value={form.member_name} onChange={(e) => setForm((f) => ({ ...f, member_name: e.target.value }))} /></div><div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(val) => setForm((f) => ({ ...f, status: val as BookingStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bokad">Bokad</SelectItem><SelectItem value="vantelista">Väntelista</SelectItem><SelectItem value="narvaro">Närvaro</SelectItem><SelectItem value="avbokad">Avbokad</SelectItem></SelectContent></Select></div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.class_name.trim() || !form.member_name.trim() || !form.date}>{editingBooking ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort bokning</DialogTitle><DialogDescription>Är du säker på att du vill ta bort bokningen för <span className="font-semibold">{bookingToDelete?.member_name}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent>
      </Dialog>
    </>
  )
}
