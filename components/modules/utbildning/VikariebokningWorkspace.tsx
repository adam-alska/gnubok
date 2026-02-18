'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, UserCheck, Users } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type BookingStatus = 'Förfrågan' | 'Bekräftad' | 'Pågående' | 'Slutförd' | 'Avbokad'
const BOOKING_STATUSES: BookingStatus[] = ['Förfrågan', 'Bekräftad', 'Pågående', 'Slutförd', 'Avbokad']
const STATUS_VARIANT: Record<BookingStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  'Förfrågan': 'info', 'Bekräftad': 'warning', 'Pågående': 'success', 'Slutförd': 'neutral', 'Avbokad': 'danger',
}

interface Substitute { id: string; name: string; phone: string; email: string; qualifications: string; hourlyRate: number; available: boolean }
interface Booking { id: string; substituteId: string; substituteName: string; date: string; timeStart: string; timeEnd: string; className: string; reason: string; status: BookingStatus; cost: number }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const EMPTY_SUB_FORM = { name: '', phone: '', email: '', qualifications: '', hourlyRate: 0, available: true }
const EMPTY_BOOKING_FORM = { substituteId: '', date: '', timeStart: '08:00', timeEnd: '16:00', className: '', reason: '', status: 'Förfrågan' as BookingStatus }

export function VikariebokningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [substitutes, setSubstitutes] = useState<Substitute[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [activeTab, setActiveTab] = useState('bokningar')
  const [subDialogOpen, setSubDialogOpen] = useState(false)
  const [editingSub, setEditingSub] = useState<Substitute | null>(null)
  const [subForm, setSubForm] = useState(EMPTY_SUB_FORM)
  const [bookDialogOpen, setBookDialogOpen] = useState(false)
  const [editingBook, setEditingBook] = useState<Booking | null>(null)
  const [bookForm, setBookForm] = useState(EMPTY_BOOKING_FORM)

  const saveData = useCallback(async (subs: Substitute[], books: Booking[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await Promise.all([
      supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'substitutes', config_value: subs }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }),
      supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'bookings', config_value: books }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }),
    ])
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const [{ data: s }, { data: b }] = await Promise.all([
      supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'substitutes').maybeSingle(),
      supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'bookings').maybeSingle(),
    ])
    if (s?.config_value && Array.isArray(s.config_value)) setSubstitutes(s.config_value as Substitute[])
    if (b?.config_value && Array.isArray(b.config_value)) setBookings(b.config_value as Booking[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalCost = useMemo(() => bookings.reduce((s, b) => s + b.cost, 0), [bookings])
  const activeBookings = useMemo(() => bookings.filter(b => b.status !== 'Slutförd' && b.status !== 'Avbokad'), [bookings])

  function openNewSub() { setEditingSub(null); setSubForm({ ...EMPTY_SUB_FORM }); setSubDialogOpen(true) }
  function openEditSub(s: Substitute) { setEditingSub(s); setSubForm({ name: s.name, phone: s.phone, email: s.email, qualifications: s.qualifications, hourlyRate: s.hourlyRate, available: s.available }); setSubDialogOpen(true) }

  async function handleSaveSub() {
    const entry: Substitute = { id: editingSub?.id ?? crypto.randomUUID(), ...subForm }
    const updated = editingSub ? substitutes.map(s => s.id === editingSub.id ? entry : s) : [...substitutes, entry]
    setSubstitutes(updated); setSubDialogOpen(false); await saveData(updated, bookings)
  }

  async function handleDeleteSub(id: string) {
    const updated = substitutes.filter(s => s.id !== id)
    setSubstitutes(updated); await saveData(updated, bookings)
  }

  function openNewBook() { setEditingBook(null); setBookForm({ ...EMPTY_BOOKING_FORM }); setBookDialogOpen(true) }
  function openEditBook(b: Booking) { setEditingBook(b); setBookForm({ substituteId: b.substituteId, date: b.date, timeStart: b.timeStart, timeEnd: b.timeEnd, className: b.className, reason: b.reason, status: b.status }); setBookDialogOpen(true) }

  function calcCost(subId: string, start: string, end: string): number {
    const sub = substitutes.find(s => s.id === subId)
    if (!sub) return 0
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    let hours = (eh - sh) + (em - sm) / 60
    if (hours < 0) hours += 24
    return Math.round(sub.hourlyRate * hours)
  }

  async function handleSaveBook() {
    const sub = substitutes.find(s => s.id === bookForm.substituteId)
    const cost = calcCost(bookForm.substituteId, bookForm.timeStart, bookForm.timeEnd)
    const entry: Booking = { id: editingBook?.id ?? crypto.randomUUID(), ...bookForm, substituteName: sub?.name ?? '', cost }
    const updated = editingBook ? bookings.map(b => b.id === editingBook.id ? entry : b) : [...bookings, entry]
    setBookings(updated); setBookDialogOpen(false); await saveData(substitutes, updated)
  }

  async function handleDeleteBook(id: string) {
    const updated = bookings.filter(b => b.id !== id)
    setBookings(updated); await saveData(substitutes, updated)
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Utbildning & Förskola" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNewBook}><Plus className="mr-2 h-4 w-4" />Ny bokning</Button>}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="bokningar">Bokningar</TabsTrigger>
            <TabsTrigger value="vikarier">Vikariepool</TabsTrigger>
          </TabsList>

          <TabsContent value="bokningar" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <KPICard label="Aktiva bokningar" value={activeBookings.length} />
                  <KPICard label="Total vikarieskuld" value={fmt(totalCost)} unit="kr" />
                  <KPICard label="Vikarier i pool" value={substitutes.filter(s => s.available).length} />
                </div>
                {bookings.length === 0 ? (
                  <EmptyModuleState icon={UserCheck} title="Inga bokningar" description="Skapa en bokning för att snabbt boka vikarier från poolen." actionLabel="Ny bokning" onAction={openNewBook} />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table><TableHeader><TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum</TableHead><TableHead className="font-medium">Tid</TableHead><TableHead className="font-medium">Vikarie</TableHead><TableHead className="font-medium">Klass</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Kostnad</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow></TableHeader><TableBody>
                      {bookings.sort((a, b) => b.date.localeCompare(a.date)).map(b => (
                        <TableRow key={b.id}>
                          <TableCell>{b.date}</TableCell><TableCell>{b.timeStart}-{b.timeEnd}</TableCell><TableCell className="font-medium">{b.substituteName}</TableCell><TableCell>{b.className}</TableCell>
                          <TableCell><StatusBadge label={b.status} variant={STATUS_VARIANT[b.status]} /></TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(b.cost)} kr</TableCell>
                          <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEditBook(b)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDeleteBook(b.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                        </TableRow>
                      ))}
                    </TableBody></Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="vikarier" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Hantera din vikariepool.</p>
              <Button size="sm" onClick={openNewSub}><Plus className="mr-1.5 h-3.5 w-3.5" />Ny vikarie</Button>
            </div>
            {substitutes.length === 0 ? (
              <EmptyModuleState icon={Users} title="Ingen vikariepool" description="Lägg till vikarier för snabb bokning." actionLabel="Ny vikarie" onAction={openNewSub} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50">
                  <TableHead className="font-medium">Namn</TableHead><TableHead className="font-medium">Telefon</TableHead><TableHead className="font-medium">Kompetens</TableHead><TableHead className="font-medium text-right">Timlön</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead>
                </TableRow></TableHeader><TableBody>
                  {substitutes.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell><TableCell>{s.phone}</TableCell><TableCell className="text-muted-foreground">{s.qualifications}</TableCell><TableCell className="text-right tabular-nums">{s.hourlyRate} kr</TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEditSub(s)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDeleteSub(s.id)}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
        {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
      </ModuleWorkspaceShell>

      <Dialog open={bookDialogOpen} onOpenChange={setBookDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingBook ? 'Redigera bokning' : 'Ny bokning'}</DialogTitle><DialogDescription>Boka en vikarie.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Vikarie *</Label>
              <Select value={bookForm.substituteId} onValueChange={v => setBookForm(f => ({ ...f, substituteId: v }))}><SelectTrigger><SelectValue placeholder="Välj vikarie" /></SelectTrigger><SelectContent>{substitutes.filter(s => s.available).map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.hourlyRate} kr/h)</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Datum *</Label><Input type="date" value={bookForm.date} onChange={e => setBookForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Start</Label><Input type="time" value={bookForm.timeStart} onChange={e => setBookForm(f => ({ ...f, timeStart: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Slut</Label><Input type="time" value={bookForm.timeEnd} onChange={e => setBookForm(f => ({ ...f, timeEnd: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Klass</Label><Input value={bookForm.className} onChange={e => setBookForm(f => ({ ...f, className: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Status</Label>
                <Select value={bookForm.status} onValueChange={v => setBookForm(f => ({ ...f, status: v as BookingStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BOOKING_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            <div className="grid gap-2"><Label>Anledning</Label><Input value={bookForm.reason} onChange={e => setBookForm(f => ({ ...f, reason: e.target.value }))} placeholder="Sjukdom, utbildning..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBookDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveBook} disabled={!bookForm.substituteId || !bookForm.date}>{editingBook ? 'Uppdatera' : 'Boka'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingSub ? 'Redigera vikarie' : 'Ny vikarie'}</DialogTitle><DialogDescription>Lägg till en vikarie i poolen.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Namn *</Label><Input value={subForm.name} onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Telefon</Label><Input value={subForm.phone} onChange={e => setSubForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>E-post</Label><Input value={subForm.email} onChange={e => setSubForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Timlön (kr)</Label><Input type="number" value={subForm.hourlyRate || ''} onChange={e => setSubForm(f => ({ ...f, hourlyRate: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div className="grid gap-2"><Label>Kompetens</Label><Input value={subForm.qualifications} onChange={e => setSubForm(f => ({ ...f, qualifications: e.target.value }))} placeholder="Förskollärare, Fritidspedagog..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSubDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveSub} disabled={!subForm.name.trim()}>{editingSub ? 'Uppdatera' : 'Lägg till'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
