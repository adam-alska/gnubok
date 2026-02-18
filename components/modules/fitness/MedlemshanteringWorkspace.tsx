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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Pencil, Trash2, Loader2, Search, Users } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ContractType = 'Månadsvis' | 'Årsmedlem' | 'Klippkort' | 'Drop-in' | 'Student' | 'Senior'
type MemberStatus = 'aktiv' | 'pausad' | 'uppsagd' | 'utgangen'

interface Member {
  id: string
  name: string
  email: string
  phone: string
  contract_type: ContractType
  start_date: string
  end_date: string
  status: MemberStatus
  notes: string
}

const CONTRACT_TYPES: ContractType[] = ['Månadsvis', 'Årsmedlem', 'Klippkort', 'Drop-in', 'Student', 'Senior']
const STATUS_LABELS: Record<MemberStatus, string> = { aktiv: 'Aktiv', pausad: 'Pausad', uppsagd: 'Uppsagd', utgangen: 'Utgången' }
const STATUS_VARIANT: Record<MemberStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { aktiv: 'success', pausad: 'warning', uppsagd: 'danger', utgangen: 'neutral' }

function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }

const DEFAULT_MEMBERS: Member[] = [
  { id: '1', name: 'Anna Svensson', email: 'anna@test.se', phone: '070-1234567', contract_type: 'Månadsvis', start_date: '2024-01-15', end_date: '', status: 'aktiv', notes: '' },
  { id: '2', name: 'Erik Lindgren', email: 'erik@test.se', phone: '070-2345678', contract_type: 'Årsmedlem', start_date: '2024-06-01', end_date: '2025-05-31', status: 'aktiv', notes: '' },
  { id: '3', name: 'Maria Holm', email: 'maria@test.se', phone: '070-3456789', contract_type: 'Student', start_date: '2024-09-01', end_date: '2025-06-30', status: 'aktiv', notes: 'Studentrabatt' },
]

const EMPTY_FORM = { name: '', email: '', phone: '', contract_type: 'Månadsvis' as ContractType, start_date: '', end_date: '', status: 'aktiv' as MemberStatus, notes: '' }

export function MedlemshanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<MemberStatus | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null)

  const saveMembers = useCallback(async (newMembers: Member[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'members', config_value: newMembers }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'members').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setMembers(data.config_value as Member[]) }
    else { setMembers(DEFAULT_MEMBERS); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'members', config_value: DEFAULT_MEMBERS }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const filteredMembers = useMemo(() => {
    let result = members
    if (filterStatus !== 'all') result = result.filter((m) => m.status === filterStatus)
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); result = result.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.phone.includes(q)) }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [members, filterStatus, searchQuery])

  const stats = useMemo(() => ({ total: members.length, aktiv: members.filter((m) => m.status === 'aktiv').length, pausad: members.filter((m) => m.status === 'pausad').length, uppsagd: members.filter((m) => m.status === 'uppsagd').length }), [members])

  function openNew() { setEditingMember(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(m: Member) { setEditingMember(m); setForm({ name: m.name, email: m.email, phone: m.phone, contract_type: m.contract_type, start_date: m.start_date, end_date: m.end_date, status: m.status, notes: m.notes }); setDialogOpen(true) }

  async function handleSave() {
    const entry: Member = { id: editingMember?.id ?? generateId(), name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), contract_type: form.contract_type, start_date: form.start_date, end_date: form.end_date, status: form.status, notes: form.notes.trim() }
    const updated = editingMember ? members.map((m) => m.id === editingMember.id ? entry : m) : [...members, entry]
    setMembers(updated); setDialogOpen(false); await saveMembers(updated)
  }

  function openDeleteConfirmation(m: Member) { setMemberToDelete(m); setDeleteDialogOpen(true) }
  async function handleDelete() { if (!memberToDelete) return; const updated = members.filter((m) => m.id !== memberToDelete.id); setMembers(updated); setDeleteDialogOpen(false); setMemberToDelete(null); await saveMembers(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fitness & Sport" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Ny medlem</Button>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.total}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Aktiva</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.aktiv}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pausade</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.pausad}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Uppsagda</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.uppsagd}</span></CardContent></Card>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök medlem..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
              <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as MemberStatus | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera" /></SelectTrigger><SelectContent><SelectItem value="all">Alla</SelectItem><SelectItem value="aktiv">Aktiv</SelectItem><SelectItem value="pausad">Pausad</SelectItem><SelectItem value="uppsagd">Uppsagd</SelectItem><SelectItem value="utgangen">Utgången</SelectItem></SelectContent></Select>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>
            {filteredMembers.length === 0 ? (
              <EmptyModuleState icon={Users} title="Inga medlemmar" description="Lägg till medlemmar för att hantera kontraktstyper och status." actionLabel="Ny medlem" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Namn</TableHead><TableHead className="font-medium">E-post</TableHead><TableHead className="font-medium">Kontraktstyp</TableHead><TableHead className="font-medium">Start</TableHead><TableHead className="font-medium">Status</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredMembers.map((m) => (
                      <TableRow key={m.id}><TableCell className="font-medium">{m.name}</TableCell><TableCell>{m.email}</TableCell><TableCell><Badge variant="outline">{m.contract_type}</Badge></TableCell><TableCell>{m.start_date}</TableCell><TableCell><StatusBadge label={STATUS_LABELS[m.status]} variant={STATUS_VARIANT[m.status]} /></TableCell><TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(m)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
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
          <DialogHeader><DialogTitle>{editingMember ? 'Redigera medlem' : 'Ny medlem'}</DialogTitle><DialogDescription>{editingMember ? 'Uppdatera medlemmens uppgifter.' : 'Registrera en ny medlem.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label>Namn *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Anna Svensson" /></div>
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>E-post</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div><div className="grid gap-2"><Label>Telefon</Label><Input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>Kontraktstyp *</Label><Select value={form.contract_type} onValueChange={(val) => setForm((f) => ({ ...f, contract_type: val as ContractType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CONTRACT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>Startdatum *</Label><Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
              <div className="grid gap-2"><Label>Slutdatum</Label><Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Status</Label><Select value={form.status} onValueChange={(val) => setForm((f) => ({ ...f, status: val as MemberStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="aktiv">Aktiv</SelectItem><SelectItem value="pausad">Pausad</SelectItem><SelectItem value="uppsagd">Uppsagd</SelectItem><SelectItem value="utgangen">Utgången</SelectItem></SelectContent></Select></div>
              <div className="grid gap-2"><Label>Anteckningar</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.name.trim() || !form.start_date}>{editingMember ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort medlem</DialogTitle><DialogDescription>Är du säker på att du vill ta bort <span className="font-semibold">{memberToDelete?.name}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent>
      </Dialog>
    </>
  )
}
