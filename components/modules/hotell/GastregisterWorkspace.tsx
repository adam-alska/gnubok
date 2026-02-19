'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
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
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Guest {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  country: string
  visitCount: number
  lastVisit: string
  preferences: string
  notes: string
  vip: boolean
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  country: 'Sverige',
  visitCount: 0,
  lastVisit: '',
  preferences: '',
  notes: '',
  vip: false,
}

export function GastregisterWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [guests, setGuests] = useState<Guest[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [guestToDelete, setGuestToDelete] = useState<Guest | null>(null)

  const saveGuests = useCallback(async (newGuests: Guest[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'guests', config_value: newGuests },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchGuests = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'guests')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setGuests(data.config_value as Guest[])
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchGuests() }, [fetchGuests])

  const filteredGuests = useMemo(() => {
    if (!searchQuery.trim()) return [...guests].sort((a, b) => a.lastName.localeCompare(b.lastName))
    const q = searchQuery.toLowerCase()
    return guests
      .filter(g =>
        g.firstName.toLowerCase().includes(q) ||
        g.lastName.toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        g.phone.includes(q) ||
        g.city.toLowerCase().includes(q)
      )
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
  }, [guests, searchQuery])

  function openNew() {
    setEditingGuest(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(guest: Guest) {
    setEditingGuest(guest)
    setForm({
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email,
      phone: guest.phone,
      address: guest.address,
      city: guest.city,
      country: guest.country,
      visitCount: guest.visitCount,
      lastVisit: guest.lastVisit,
      preferences: guest.preferences,
      notes: guest.notes,
      vip: guest.vip,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    const item: Guest = {
      id: editingGuest?.id ?? generateId(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
      visitCount: form.visitCount,
      lastVisit: form.lastVisit,
      preferences: form.preferences.trim(),
      notes: form.notes.trim(),
      vip: form.vip,
    }
    let updated: Guest[]
    if (editingGuest) {
      updated = guests.map(g => g.id === editingGuest.id ? item : g)
    } else {
      updated = [...guests, item]
    }
    setGuests(updated)
    setDialogOpen(false)
    await saveGuests(updated)
  }

  async function handleDelete() {
    if (!guestToDelete) return
    const updated = guests.filter(g => g.id !== guestToDelete.id)
    setGuests(updated)
    setDeleteDialogOpen(false)
    setGuestToDelete(null)
    await saveGuests(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Ny gäst
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök gäst (namn, e-post, telefon, stad)..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <span className="text-sm text-muted-foreground">{guests.length} gäster totalt</span>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>

            {filteredGuests.length === 0 ? (
              <EmptyModuleState
                icon={Users}
                title="Inga gäster"
                description={searchQuery ? 'Inga gäster matchar sökningen.' : 'Lägg till gäster för att bygga upp gästregistret.'}
                actionLabel={!searchQuery ? 'Ny gäst' : undefined}
                onAction={!searchQuery ? openNew : undefined}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Namn</TableHead>
                      <TableHead className="font-medium">E-post</TableHead>
                      <TableHead className="font-medium">Telefon</TableHead>
                      <TableHead className="font-medium">Stad</TableHead>
                      <TableHead className="font-medium text-right">Besök</TableHead>
                      <TableHead className="font-medium">Senaste</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredGuests.map(guest => (
                      <TableRow key={guest.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {guest.firstName} {guest.lastName}
                            {guest.vip && <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">VIP</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{guest.email}</TableCell>
                        <TableCell className="text-sm">{guest.phone}</TableCell>
                        <TableCell>{guest.city}</TableCell>
                        <TableCell className="text-right">{guest.visitCount}</TableCell>
                        <TableCell>{guest.lastVisit || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(guest)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setGuestToDelete(guest); setDeleteDialogOpen(true) }} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
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

      {/* Guest Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingGuest ? 'Redigera gäst' : 'Ny gäst'}</DialogTitle>
            <DialogDescription>Fyll i gästens kontaktuppgifter och preferenser.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Förnamn *</Label>
                <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Anna" />
              </div>
              <div className="grid gap-2">
                <Label>Efternamn *</Label>
                <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Andersson" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>E-post</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="anna@example.com" />
              </div>
              <div className="grid gap-2">
                <Label>Telefon</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="070-123 45 67" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Adress</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Storgatan 1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Stad</Label>
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Stockholm" />
              </div>
              <div className="grid gap-2">
                <Label>Land</Label>
                <Input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="Sverige" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Antal besök</Label>
                <Input type="number" min={0} value={form.visitCount} onChange={e => setForm(f => ({ ...f, visitCount: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Senaste besök</Label>
                <Input type="date" value={form.lastVisit} onChange={e => setForm(f => ({ ...f, lastVisit: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>VIP-gäst</Label>
                <div className="flex items-center h-9">
                  <input type="checkbox" checked={form.vip} onChange={e => setForm(f => ({ ...f, vip: e.target.checked }))} className="h-4 w-4" />
                  <span className="ml-2 text-sm">VIP</span>
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Preferenser</Label>
              <Textarea value={form.preferences} onChange={e => setForm(f => ({ ...f, preferences: e.target.value }))} rows={2} placeholder="T.ex. högt rum, extra kuddar, allergier..." />
            </div>
            <div className="grid gap-2">
              <Label>Anteckningar</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Interna noteringar..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.firstName.trim() || !form.lastName.trim()}>
              {editingGuest ? 'Uppdatera' : 'Skapa gäst'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort gäst</DialogTitle>
            <DialogDescription>Är du säker på att du vill ta bort {guestToDelete?.firstName} {guestToDelete?.lastName}?</DialogDescription>
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
