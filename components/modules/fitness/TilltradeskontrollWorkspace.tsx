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
import { Plus, Pencil, Trash2, Loader2, KeyRound, Search, ScanLine } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type AccessMethod = 'nyckelbrička' | 'qr-kod' | 'app' | 'manuell'

interface AccessEntry {
  id: string
  member_name: string
  method: AccessMethod
  key_id: string
  timestamp: string
  granted: boolean
  notes: string
}

function generateId(): string { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7) }
function nowISO(): string { return new Date().toISOString().slice(0, 16) }
function todayISO(): string { return new Date().toISOString().split('T')[0] }

const DEFAULT_ENTRIES: AccessEntry[] = [
  { id: '1', member_name: 'Anna Svensson', method: 'nyckelbrička', key_id: 'NB-001', timestamp: `${todayISO()}T07:15`, granted: true, notes: '' },
  { id: '2', member_name: 'Erik Lindgren', method: 'qr-kod', key_id: 'QR-042', timestamp: `${todayISO()}T08:30`, granted: true, notes: '' },
  { id: '3', member_name: 'Okänd', method: 'nyckelbrička', key_id: 'NB-099', timestamp: `${todayISO()}T09:00`, granted: false, notes: 'Ej registrerad bricka' },
]

const EMPTY_FORM = { member_name: '', method: 'nyckelbrička' as AccessMethod, key_id: '', timestamp: '', granted: true, notes: '' }

export function TilltradeskontrollWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<AccessEntry[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<AccessEntry | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDate, setFilterDate] = useState(todayISO())

  const saveEntries = useCallback(async (newEntries: AccessEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'access_log', config_value: newEntries }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'access_log').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) { setEntries(data.config_value as AccessEntry[]) }
    else { setEntries(DEFAULT_ENTRIES); await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'access_log', config_value: DEFAULT_ENTRIES }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }) }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const filteredEntries = useMemo(() => {
    let result = entries.filter((e) => e.timestamp.startsWith(filterDate))
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); result = result.filter((e) => e.member_name.toLowerCase().includes(q) || e.key_id.toLowerCase().includes(q)) }
    return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [entries, filterDate, searchQuery])

  const stats = useMemo(() => {
    const today = entries.filter((e) => e.timestamp.startsWith(todayISO()))
    return { totalToday: today.length, granted: today.filter((e) => e.granted).length, denied: today.filter((e) => !e.granted).length, totalAll: entries.length }
  }, [entries])

  function openNew() { setForm({ ...EMPTY_FORM, timestamp: nowISO() }); setDialogOpen(true) }

  async function handleSave() {
    const entry: AccessEntry = { id: generateId(), member_name: form.member_name.trim(), method: form.method, key_id: form.key_id.trim(), timestamp: form.timestamp, granted: form.granted, notes: form.notes.trim() }
    const updated = [...entries, entry]
    setEntries(updated); setDialogOpen(false); await saveEntries(updated)
  }

  function openDeleteConfirmation(e: AccessEntry) { setEntryToDelete(e); setDeleteDialogOpen(true) }
  async function handleDelete() { if (!entryToDelete) return; const updated = entries.filter((e) => e.id !== entryToDelete.id); setEntries(updated); setDeleteDialogOpen(false); setEntryToDelete(null); await saveEntries(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="operativ" sectorName="Fitness & Sport" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref} actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Registrera passage</Button>}>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Besök idag</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.totalToday}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Godkända</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.granted}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nekade</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight text-red-600">{stats.denied}</span></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt loggar</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{stats.totalAll}</span></CardContent></Card>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-auto" />
              <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök medlem eller nyckel-ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>
            {filteredEntries.length === 0 ? (
              <EmptyModuleState icon={KeyRound} title="Inga passager" description="Inga passageloggar för valt datum." actionLabel="Registrera passage" onAction={openNew} />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Tid</TableHead><TableHead className="font-medium">Medlem</TableHead><TableHead className="font-medium">Metod</TableHead><TableHead className="font-medium">Nyckel-ID</TableHead><TableHead className="font-medium">Resultat</TableHead><TableHead className="font-medium">Anteckning</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredEntries.map((e) => (
                      <TableRow key={e.id}><TableCell className="tabular-nums">{e.timestamp.split('T')[1]}</TableCell><TableCell className="font-medium">{e.member_name}</TableCell><TableCell><Badge variant="outline">{e.method}</Badge></TableCell><TableCell className="font-mono text-sm">{e.key_id}</TableCell><TableCell><StatusBadge label={e.granted ? 'Godkänd' : 'Nekad'} variant={e.granted ? 'success' : 'danger'} /></TableCell><TableCell className="text-muted-foreground text-sm">{e.notes || '-'}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(e)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrera passage</DialogTitle><DialogDescription>Logga en manuell passage.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Medlem *</Label><Input value={form.member_name} onChange={(e) => setForm((f) => ({ ...f, member_name: e.target.value }))} /></div><div className="grid gap-2"><Label>Nyckel-ID</Label><Input value={form.key_id} onChange={(e) => setForm((f) => ({ ...f, key_id: e.target.value }))} placeholder="NB-001" /></div></div>
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Tidpunkt *</Label><Input type="datetime-local" value={form.timestamp} onChange={(e) => setForm((f) => ({ ...f, timestamp: e.target.value }))} /></div><div className="grid gap-2"><Label>Metod</Label><Select value={form.method} onValueChange={(val) => setForm((f) => ({ ...f, method: val as AccessMethod }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nyckelbrická">Nyckelbrická</SelectItem><SelectItem value="qr-kod">QR-kod</SelectItem><SelectItem value="app">App</SelectItem><SelectItem value="manuell">Manuell</SelectItem></SelectContent></Select></div></div>
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Resultat</Label><Select value={form.granted ? 'true' : 'false'} onValueChange={(val) => setForm((f) => ({ ...f, granted: val === 'true' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Godkänd</SelectItem><SelectItem value="false">Nekad</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>Anteckning</Label><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.member_name.trim() || !form.timestamp}>Registrera</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort logg</DialogTitle><DialogDescription>Är du säker på att du vill ta bort passageloggen för <span className="font-semibold">{entryToDelete?.member_name}</span>?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent>
      </Dialog>
    </>
  )
}
