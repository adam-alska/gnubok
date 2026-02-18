'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, Users } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface Student {
  id: string
  firstName: string
  lastName: string
  personalNumber: string
  className: string
  guardianName: string
  guardianPhone: string
  guardianEmail: string
  allergies: string
  specialNeeds: string
}

const EMPTY_FORM = {
  firstName: '', lastName: '', personalNumber: '', className: '',
  guardianName: '', guardianPhone: '', guardianEmail: '', allergies: '', specialNeeds: '',
}

export function ElevregisterWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [students, setStudents] = useState<Student[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Student | null>(null)

  const saveStudents = useCallback(async (items: Student[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'students', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchStudents = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'students').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value)) setStudents(data.config_value as Student[])
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchStudents() }, [fetchStudents])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return students
    const q = searchQuery.toLowerCase()
    return students.filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.className.toLowerCase().includes(q) || s.guardianName.toLowerCase().includes(q))
  }, [students, searchQuery])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(s: Student) {
    setEditing(s)
    setForm({ firstName: s.firstName, lastName: s.lastName, personalNumber: s.personalNumber, className: s.className, guardianName: s.guardianName, guardianPhone: s.guardianPhone, guardianEmail: s.guardianEmail, allergies: s.allergies, specialNeeds: s.specialNeeds })
    setDialogOpen(true)
  }

  async function handleSave() {
    const entry: Student = { id: editing?.id ?? crypto.randomUUID(), ...form }
    const updated = editing ? students.map(s => s.id === editing.id ? entry : s) : [...students, entry]
    setStudents(updated); setDialogOpen(false); await saveStudents(updated)
  }

  async function handleDelete() {
    if (!toDelete) return
    const updated = students.filter(s => s.id !== toDelete.id)
    setStudents(updated); setDeleteDialogOpen(false); setToDelete(null); await saveStudents(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Utbildning & Förskola" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny elev</Button>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök elev, klass, vårdnadshavare..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              <Badge variant="secondary">{students.length} elever</Badge>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>

            {filtered.length === 0 ? (
              <EmptyModuleState icon={Users} title="Inga elever" description={searchQuery ? 'Inga elever matchar din sökning.' : 'Lägg till elever med kontaktuppgifter, allergier och särskilda behov.'} actionLabel={!searchQuery ? 'Ny elev' : undefined} onAction={!searchQuery ? openNew : undefined} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Namn</TableHead>
                      <TableHead className="font-medium">Klass</TableHead>
                      <TableHead className="font-medium">Vårdnadshavare</TableHead>
                      <TableHead className="font-medium">Telefon</TableHead>
                      <TableHead className="font-medium">Allergier</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.firstName} {s.lastName}</TableCell>
                        <TableCell><Badge variant="outline">{s.className}</Badge></TableCell>
                        <TableCell>{s.guardianName}</TableCell>
                        <TableCell className="text-muted-foreground">{s.guardianPhone}</TableCell>
                        <TableCell>{s.allergies ? <Badge variant="secondary" className="bg-amber-100 text-amber-800">{s.allergies}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(s); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{editing ? 'Redigera elev' : 'Ny elev'}</DialogTitle><DialogDescription>Fyll i elevens uppgifter.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Förnamn *</Label><Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Efternamn *</Label><Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Personnummer</Label><Input value={form.personalNumber} onChange={e => setForm(f => ({ ...f, personalNumber: e.target.value }))} placeholder="YYYYMMDD-XXXX" /></div>
              <div className="grid gap-2"><Label>Klass *</Label><Input value={form.className} onChange={e => setForm(f => ({ ...f, className: e.target.value }))} placeholder="3A" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Vårdnadshavare</Label><Input value={form.guardianName} onChange={e => setForm(f => ({ ...f, guardianName: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Telefon</Label><Input value={form.guardianPhone} onChange={e => setForm(f => ({ ...f, guardianPhone: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>E-post</Label><Input value={form.guardianEmail} onChange={e => setForm(f => ({ ...f, guardianEmail: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Allergier</Label><Input value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} placeholder="Nötter, gluten..." /></div>
              <div className="grid gap-2"><Label>Särskilda behov</Label><Input value={form.specialNeeds} onChange={e => setForm(f => ({ ...f, specialNeeds: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={!form.firstName.trim() || !form.lastName.trim()}>{editing ? 'Uppdatera' : 'Lägg till'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort elev</DialogTitle><DialogDescription>Är du säker på att du vill ta bort {toDelete?.firstName} {toDelete?.lastName}?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
