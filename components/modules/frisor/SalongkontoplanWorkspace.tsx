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

type AccountType = 'Intäkt' | 'Kostnad' | 'Tillgång' | 'Skuld'
type AccountCategory = 'Behandling' | 'Produktförsäljning' | 'Presentkort' | 'Personal' | 'Lokal' | 'Material' | 'Övrigt'

interface Account {
  number: string
  name: string
  type: AccountType
  category: AccountCategory
}

const ACCOUNT_TYPES: AccountType[] = ['Intäkt', 'Kostnad', 'Tillgång', 'Skuld']
const ACCOUNT_CATEGORIES: AccountCategory[] = ['Behandling', 'Produktförsäljning', 'Presentkort', 'Personal', 'Lokal', 'Material', 'Övrigt']

const DEFAULT_ACCOUNTS: Account[] = [
  { number: '3010', name: 'Behandlingsintäkter', type: 'Intäkt', category: 'Behandling' },
  { number: '3020', name: 'Produktförsäljning', type: 'Intäkt', category: 'Produktförsäljning' },
  { number: '3030', name: 'Tilläggsbehandlingar', type: 'Intäkt', category: 'Behandling' },
  { number: '2420', name: 'Presentkortsskuld', type: 'Skuld', category: 'Presentkort' },
  { number: '4010', name: 'Inköp hårvårdsprodukter', type: 'Kostnad', category: 'Material' },
  { number: '4020', name: 'Inköp salongsförbrukningsmat.', type: 'Kostnad', category: 'Material' },
  { number: '5010', name: 'Lokalkostnader', type: 'Kostnad', category: 'Lokal' },
  { number: '7010', name: 'Löner', type: 'Kostnad', category: 'Personal' },
  { number: '7210', name: 'Provisioner', type: 'Kostnad', category: 'Personal' },
  { number: '7510', name: 'Sociala avgifter', type: 'Kostnad', category: 'Personal' },
]

const TYPE_COLORS: Record<AccountType, string> = {
  'Intäkt': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Kostnad': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'Tillgång': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Skuld': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const EMPTY_ACCOUNT_FORM = {
  number: '',
  name: '',
  type: 'Kostnad' as AccountType,
  category: 'Övrigt' as AccountCategory,
}

export function SalongkontoplanWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
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
        sectorName="Frisör & Skönhet"
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
                      {t}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-semibold tracking-tight">{typeCounts[t]}</span>
                    <span className="text-sm text-muted-foreground ml-1.5">konton</span>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök konto (nummer eller namn)..."
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
                    <SelectItem key={t} value={t}>{t}</SelectItem>
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

            {filteredAccounts.length === 0 ? (
              <EmptyModuleState
                icon={FileSpreadsheet}
                title="Inga konton hittades"
                description={
                  searchQuery || filterType !== 'all'
                    ? 'Inga konton matchar dina sökkriterier. Prova att ändra filter.'
                    : 'Lägg till konton för att bygga upp din salongskontoplan.'
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
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account) => (
                      <TableRow key={account.number}>
                        <TableCell className="font-mono font-medium">{account.number}</TableCell>
                        <TableCell>{account.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={TYPE_COLORS[account.type]}>
                            {account.type}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAccount ? 'Redigera konto' : 'Nytt konto'}</DialogTitle>
            <DialogDescription>
              {editingAccount
                ? 'Uppdatera kontots uppgifter nedan.'
                : 'Fyll i uppgifterna för det nya kontot.'}
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
                  placeholder="Behandlingsintäkter"
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
                    <SelectValue placeholder="Välj typ" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
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
                    <SelectValue placeholder="Välj kategori" />
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

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort konto</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort konto{' '}
              <span className="font-mono font-semibold">{accountToDelete?.number}</span>{' '}
              ({accountToDelete?.name})? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
