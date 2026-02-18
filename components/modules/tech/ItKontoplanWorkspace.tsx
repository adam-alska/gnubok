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
  FileSpreadsheet,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type AccountType = 'Intakt' | 'Kostnad' | 'Tillgang' | 'Skuld'
type AccountCategory =
  | 'Konsultintakt'
  | 'Licensintakt'
  | 'SaaS MRR'
  | 'Hosting'
  | 'Mjukvara'
  | 'Personal'
  | 'Avskrivning'
  | 'Ovrigt'

interface Account {
  number: string
  name: string
  type: AccountType
  category: AccountCategory
}

const ACCOUNT_TYPES: AccountType[] = ['Intakt', 'Kostnad', 'Tillgang', 'Skuld']
const ACCOUNT_CATEGORIES: AccountCategory[] = [
  'Konsultintakt',
  'Licensintakt',
  'SaaS MRR',
  'Hosting',
  'Mjukvara',
  'Personal',
  'Avskrivning',
  'Ovrigt',
]

const DEFAULT_ACCOUNTS: Account[] = [
  { number: '3010', name: 'Konsultintakter', type: 'Intakt', category: 'Konsultintakt' },
  { number: '3020', name: 'Licensintakter', type: 'Intakt', category: 'Licensintakt' },
  { number: '3030', name: 'SaaS-abonnemang (MRR)', type: 'Intakt', category: 'SaaS MRR' },
  { number: '3040', name: 'Supportintakter', type: 'Intakt', category: 'Konsultintakt' },
  { number: '4010', name: 'Underleverantorer konsult', type: 'Kostnad', category: 'Konsultintakt' },
  { number: '4020', name: 'Inkopta molntjanster', type: 'Kostnad', category: 'Hosting' },
  { number: '4030', name: 'Mjukvarulicenser', type: 'Kostnad', category: 'Mjukvara' },
  { number: '5010', name: 'Lokalkostnader', type: 'Kostnad', category: 'Ovrigt' },
  { number: '6200', name: 'Serverhosting & molntjanster', type: 'Kostnad', category: 'Hosting' },
  { number: '7010', name: 'Loner IT-personal', type: 'Kostnad', category: 'Personal' },
  { number: '7510', name: 'Sociala avgifter', type: 'Kostnad', category: 'Personal' },
  { number: '7832', name: 'Avskrivning mjukvara', type: 'Kostnad', category: 'Avskrivning' },
  { number: '1010', name: 'Egenutvecklad mjukvara', type: 'Tillgang', category: 'Mjukvara' },
  { number: '1020', name: 'Forvarv mjukvarulicenser', type: 'Tillgang', category: 'Mjukvara' },
  { number: '1470', name: 'Pagaende projekt (WIP)', type: 'Tillgang', category: 'Ovrigt' },
  { number: '2440', name: 'Leverantorsskulder', type: 'Skuld', category: 'Ovrigt' },
]

const TYPE_COLORS: Record<AccountType, string> = {
  Intakt: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  Kostnad: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  Tillgang: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Skuld: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const TYPE_LABELS: Record<AccountType, string> = {
  Intakt: 'Intakt',
  Kostnad: 'Kostnad',
  Tillgang: 'Tillgang',
  Skuld: 'Skuld',
}

const EMPTY_ACCOUNT_FORM = {
  number: '',
  name: '',
  type: 'Kostnad' as AccountType,
  category: 'Ovrigt' as AccountCategory,
}

export function ItKontoplanWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<AccountType | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null)

  const saveAccounts = useCallback(async (newAccounts: Account[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'accounts',
        config_value: newAccounts,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'accounts')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setAccounts(data.config_value as Account[])
    } else {
      setAccounts(DEFAULT_ACCOUNTS)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'accounts',
          config_value: DEFAULT_ACCOUNTS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const filteredAccounts = useMemo(() => {
    let result = accounts
    if (filterType !== 'all') {
      result = result.filter((a) => a.type === filterType)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (a) =>
          a.number.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => a.number.localeCompare(b.number))
  }, [accounts, filterType, searchQuery])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of ACCOUNT_TYPES) {
      counts[t] = accounts.filter((a) => a.type === t).length
    }
    return counts
  }, [accounts])

  function openNewAccount() {
    setEditingAccount(null)
    setAccountForm({ ...EMPTY_ACCOUNT_FORM })
    setDialogOpen(true)
  }

  function openEditAccount(account: Account) {
    setEditingAccount(account)
    setAccountForm({
      number: account.number,
      name: account.name,
      type: account.type,
      category: account.category,
    })
    setDialogOpen(true)
  }

  async function handleSaveAccount() {
    const newAccount: Account = {
      number: accountForm.number.trim(),
      name: accountForm.name.trim(),
      type: accountForm.type,
      category: accountForm.category,
    }

    let updated: Account[]
    if (editingAccount) {
      updated = accounts.map((a) =>
        a.number === editingAccount.number ? newAccount : a
      )
    } else {
      if (accounts.some((a) => a.number === newAccount.number)) {
        return
      }
      updated = [...accounts, newAccount]
    }

    setAccounts(updated)
    setDialogOpen(false)
    await saveAccounts(updated)
  }

  function openDeleteConfirmation(account: Account) {
    setAccountToDelete(account)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteAccount() {
    if (!accountToDelete) return
    const updated = accounts.filter((a) => a.number !== accountToDelete.number)
    setAccounts(updated)
    setDeleteDialogOpen(false)
    setAccountToDelete(null)
    await saveAccounts(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Tech & IT"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewAccount}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt konto
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Totalt antal konton
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{accounts.length}</span>
                </CardContent>
              </Card>
              {ACCOUNT_TYPES.map((t) => (
                <Card key={t}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {TYPE_LABELS[t]}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">{typeCounts[t]}</span>
                    <span className="text-sm text-muted-foreground ml-1.5">konton</span>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sok konto (nummer eller namn)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={filterType}
                onValueChange={(val) => setFilterType(val as AccountType | 'all')}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrera typ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla typer</SelectItem>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </div>

            {/* Accounts table */}
            {filteredAccounts.length === 0 ? (
              <EmptyModuleState
                icon={FileSpreadsheet}
                title="Inga konton hittades"
                description={
                  searchQuery || filterType !== 'all'
                    ? 'Inga konton matchar dina sokkriterier. Prova att andra filter.'
                    : 'Lagg till konton for att bygga upp din IT-kontoplan.'
                }
                actionLabel={!searchQuery && filterType === 'all' ? 'Nytt konto' : undefined}
                onAction={!searchQuery && filterType === 'all' ? openNewAccount : undefined}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Kontonr</TableHead>
                      <TableHead className="font-medium">Kontonamn</TableHead>
                      <TableHead className="font-medium">Typ</TableHead>
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium text-right">Atgarder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account) => (
                      <TableRow key={account.number}>
                        <TableCell className="font-mono font-medium">{account.number}</TableCell>
                        <TableCell>{account.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={TYPE_COLORS[account.type]}>
                            {TYPE_LABELS[account.type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{account.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditAccount(account)}
                              title="Redigera"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => openDeleteConfirmation(account)}
                              title="Ta bort"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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

      {/* Add/Edit Account Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAccount ? 'Redigera konto' : 'Nytt konto'}</DialogTitle>
            <DialogDescription>
              {editingAccount
                ? 'Uppdatera kontots uppgifter nedan.'
                : 'Fyll i uppgifterna for det nya kontot.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="acct-number">Kontonummer *</Label>
                <Input
                  id="acct-number"
                  value={accountForm.number}
                  onChange={(e) => setAccountForm((f) => ({ ...f, number: e.target.value }))}
                  placeholder="3010"
                  maxLength={6}
                  disabled={!!editingAccount}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="acct-name">Kontonamn *</Label>
                <Input
                  id="acct-name"
                  value={accountForm.name}
                  onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Konsultintakter"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="acct-type">Kontotyp *</Label>
                <Select
                  value={accountForm.type}
                  onValueChange={(val) => setAccountForm((f) => ({ ...f, type: val as AccountType }))}
                >
                  <SelectTrigger id="acct-type">
                    <SelectValue placeholder="Valj typ" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="acct-category">Kategori *</Label>
                <Select
                  value={accountForm.category}
                  onValueChange={(val) => setAccountForm((f) => ({ ...f, category: val as AccountCategory }))}
                >
                  <SelectTrigger id="acct-category">
                    <SelectValue placeholder="Valj kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveAccount}
              disabled={!accountForm.number.trim() || !accountForm.name.trim()}
            >
              {editingAccount ? 'Uppdatera' : 'Skapa konto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort konto</DialogTitle>
            <DialogDescription>
              Ar du saker pa att du vill ta bort konto{' '}
              <span className="font-mono font-semibold">{accountToDelete?.number}</span>{' '}
              ({accountToDelete?.name})? Denna atgard kan inte angras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
