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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Loader2, Search, FileSpreadsheet } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type AccountType = 'Intäkt' | 'Kostnad' | 'Tillgång' | 'Skuld'
type AccountCategory = 'Växtodling' | 'Djurförsäljning' | 'EU-stöd' | 'Biologiska tillgångar' | 'Skog' | 'Maskiner' | 'Personal' | 'Övrigt'

interface Account { number: string; name: string; type: AccountType; category: AccountCategory }

const ACCOUNT_TYPES: AccountType[] = ['Intäkt', 'Kostnad', 'Tillgång', 'Skuld']
const ACCOUNT_CATEGORIES: AccountCategory[] = ['Växtodling', 'Djurförsäljning', 'EU-stöd', 'Biologiska tillgångar', 'Skog', 'Maskiner', 'Personal', 'Övrigt']

const DEFAULT_ACCOUNTS: Account[] = [
  { number: '3010', name: 'Växtodlingsintäkter', type: 'Intäkt', category: 'Växtodling' },
  { number: '3020', name: 'Djurförsäljning', type: 'Intäkt', category: 'Djurförsäljning' },
  { number: '3910', name: 'EU-stöd', type: 'Intäkt', category: 'EU-stöd' },
  { number: '3920', name: 'Övriga jordbruksstöd', type: 'Intäkt', category: 'EU-stöd' },
  { number: '1280', name: 'Biologiska tillgångar', type: 'Tillgång', category: 'Biologiska tillgångar' },
  { number: '1760', name: 'Skogskonto', type: 'Tillgång', category: 'Skog' },
  { number: '4010', name: 'Foder och utsäde', type: 'Kostnad', category: 'Växtodling' },
  { number: '4020', name: 'Gödsel och växtskydd', type: 'Kostnad', category: 'Växtodling' },
  { number: '5010', name: 'Maskinkostnader', type: 'Kostnad', category: 'Maskiner' },
  { number: '7010', name: 'Löner', type: 'Kostnad', category: 'Personal' },
]

const TYPE_COLORS: Record<AccountType, string> = {
  'Intäkt': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Kostnad': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'Tillgång': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Skuld': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const EMPTY_FORM = { number: '', name: '', type: 'Kostnad' as AccountType, category: 'Övrigt' as AccountCategory }

export function JordbrukskontoplanWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<AccountType | 'all'>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Account | null>(null)

  const saveAccounts = useCallback(async (items: Account[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'accounts', config_value: items },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'accounts').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setAccounts(data.config_value as Account[])
    } else {
      setAccounts(DEFAULT_ACCOUNTS)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'accounts', config_value: DEFAULT_ACCOUNTS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const filtered = useMemo(() => {
    let r = accounts
    if (filterType !== 'all') r = r.filter(a => a.type === filterType)
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter(a => a.number.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)) }
    return r.sort((a, b) => a.number.localeCompare(b.number))
  }, [accounts, filterType, searchQuery])

  const typeCounts = useMemo(() => { const c: Record<string, number> = {}; ACCOUNT_TYPES.forEach(t => { c[t] = accounts.filter(a => a.type === t).length }); return c }, [accounts])

  function openNew() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true) }
  function openEdit(a: Account) { setEditing(a); setForm({ number: a.number, name: a.name, type: a.type, category: a.category }); setDialogOpen(true) }
  async function handleSave() {
    const entry: Account = { number: form.number.trim(), name: form.name.trim(), type: form.type, category: form.category }
    let updated: Account[]
    if (editing) { updated = accounts.map(a => a.number === editing.number ? entry : a) } else { if (accounts.some(a => a.number === entry.number)) return; updated = [...accounts, entry] }
    setAccounts(updated); setDialogOpen(false); await saveAccounts(updated)
  }
  async function handleDelete() { if (!toDelete) return; const updated = accounts.filter(a => a.number !== toDelete.number); setAccounts(updated); setDeleteDialogOpen(false); setToDelete(null); await saveAccounts(updated) }

  return (
    <>
      <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}
        actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nytt konto</Button>}>
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold">{accounts.length}</span></CardContent></Card>
              {ACCOUNT_TYPES.map(t => <Card key={t}><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t}</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold">{typeCounts[t]}</span><span className="text-sm text-muted-foreground ml-1.5">konton</span></CardContent></Card>)}
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Sök konto..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" /></div>
              <Select value={filterType} onValueChange={v => setFilterType(v as AccountType | 'all')}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filtrera typ" /></SelectTrigger><SelectContent><SelectItem value="all">Alla typer</SelectItem>{ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
              {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
            </div>
            {filtered.length === 0 ? <EmptyModuleState icon={FileSpreadsheet} title="Inga konton" description={searchQuery || filterType !== 'all' ? 'Inga konton matchar sökningen.' : 'Lägg till konton.'} actionLabel={!searchQuery && filterType === 'all' ? 'Nytt konto' : undefined} onAction={!searchQuery && filterType === 'all' ? openNew : undefined} /> : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table><TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Kontonr</TableHead><TableHead className="font-medium">Kontonamn</TableHead><TableHead className="font-medium">Typ</TableHead><TableHead className="font-medium">Kategori</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                  <TableBody>{filtered.map(a => (
                    <TableRow key={a.number}><TableCell className="font-mono font-medium">{a.number}</TableCell><TableCell>{a.name}</TableCell><TableCell><Badge variant="secondary" className={TYPE_COLORS[a.type]}>{a.type}</Badge></TableCell><TableCell><Badge variant="outline">{a.category}</Badge></TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setToDelete(a); setDeleteDialogOpen(true) }}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>
                  ))}</TableBody></Table></div>
            )}
          </div>
        )}
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{editing ? 'Redigera konto' : 'Nytt konto'}</DialogTitle><DialogDescription>{editing ? 'Uppdatera kontot.' : 'Fyll i kontouppgifter.'}</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Kontonummer *</Label><Input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} placeholder="4010" maxLength={6} disabled={!!editing} /></div><div className="grid gap-2"><Label>Kontonamn *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div></div>
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Typ *</Label><Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as AccountType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Kategori *</Label><Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as AccountCategory }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACCOUNT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button><Button onClick={handleSave} disabled={!form.number.trim() || !form.name.trim()}>{editing ? 'Uppdatera' : 'Skapa'}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Ta bort konto</DialogTitle><DialogDescription>Ta bort konto {toDelete?.number} ({toDelete?.name})?</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter></DialogContent></Dialog>
    </>
  )
}
