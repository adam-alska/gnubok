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
type ProductCategory =
  | 'Livsmedel'
  | 'Dryck'
  | 'Frukt & Gront'
  | 'Mejeri'
  | 'Kott & Chark'
  | 'Non-food'
  | 'Personal'
  | 'Lokal'
  | 'Ovrigt'

interface Account {
  number: string
  name: string
  type: AccountType
  category: ProductCategory
  vatRate: number
}

const ACCOUNT_TYPES: AccountType[] = ['Intakt', 'Kostnad', 'Tillgang', 'Skuld']
const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Livsmedel',
  'Dryck',
  'Frukt & Gront',
  'Mejeri',
  'Kott & Chark',
  'Non-food',
  'Personal',
  'Lokal',
  'Ovrigt',
]
const VAT_RATES = [0, 6, 12, 25]

const DEFAULT_ACCOUNTS: Account[] = [
  { number: '3001', name: 'Forsaljning livsmedel 12%', type: 'Intakt', category: 'Livsmedel', vatRate: 12 },
  { number: '3002', name: 'Forsaljning dryck 12%', type: 'Intakt', category: 'Dryck', vatRate: 12 },
  { number: '3003', name: 'Forsaljning frukt & gront 12%', type: 'Intakt', category: 'Frukt & Gront', vatRate: 12 },
  { number: '3004', name: 'Forsaljning mejeri 12%', type: 'Intakt', category: 'Mejeri', vatRate: 12 },
  { number: '3005', name: 'Forsaljning kott & chark 12%', type: 'Intakt', category: 'Kott & Chark', vatRate: 12 },
  { number: '3010', name: 'Forsaljning non-food 25%', type: 'Intakt', category: 'Non-food', vatRate: 25 },
  { number: '4010', name: 'Inkop livsmedel', type: 'Kostnad', category: 'Livsmedel', vatRate: 12 },
  { number: '4020', name: 'Inkop dryck', type: 'Kostnad', category: 'Dryck', vatRate: 12 },
  { number: '4030', name: 'Inkop frukt & gront', type: 'Kostnad', category: 'Frukt & Gront', vatRate: 12 },
  { number: '4040', name: 'Inkop mejeri', type: 'Kostnad', category: 'Mejeri', vatRate: 12 },
  { number: '4050', name: 'Inkop kott & chark', type: 'Kostnad', category: 'Kott & Chark', vatRate: 12 },
  { number: '4060', name: 'Inkop non-food', type: 'Kostnad', category: 'Non-food', vatRate: 25 },
  { number: '1400', name: 'Lager', type: 'Tillgang', category: 'Ovrigt', vatRate: 0 },
  { number: '5010', name: 'Lokalkostnader', type: 'Kostnad', category: 'Lokal', vatRate: 25 },
  { number: '7010', name: 'Loner', type: 'Kostnad', category: 'Personal', vatRate: 0 },
  { number: '7510', name: 'Sociala avgifter', type: 'Kostnad', category: 'Personal', vatRate: 0 },
]

const TYPE_COLORS: Record<AccountType, string> = {
  'Intakt': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Kostnad': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'Tillgang': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Skuld': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const EMPTY_ACCOUNT_FORM = {
  number: '',
  name: '',
  type: 'Kostnad' as AccountType,
  category: 'Ovrigt' as ProductCategory,
  vatRate: 12,
}

export function DetaljhandelskontoplanWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
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
      vatRate: account.vatRate,
    })
    setDialogOpen(true)
  }

  async function handleSaveAccount() {
    const newAccount: Account = {
      number: accountForm.number.trim(),
      name: accountForm.name.trim(),
      type: accountForm.type,
      category: accountForm.category,
      vatRate: accountForm.vatRate,
    }

    let updated: Account[]
    if (editingAccount) {
      updated = accounts.map((a) =>
        a.number === editingAccount.number ? newAccount : a
      )
    } else {
      if (accounts.some((a) => a.number === newAccount.number)) return
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
        sectorName="Detaljhandel"
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
                  placeholder="Sok konto (nummer, namn, kategori)..."
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
                    ? 'Inga konton matchar dina sokkriterier. Prova att andra filter.'
                    : 'Lagg till konton for att bygga upp din kontoplan.'
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
                      <TableHead className="font-medium">Moms</TableHead>
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
                            {account.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{account.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{account.vatRate}%</Badge>
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
                  placeholder="4010"
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
                  placeholder="Inkop livsmedel"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
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
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="acct-category">Kategori *</Label>
                <Select
                  value={accountForm.category}
                  onValueChange={(val) => setAccountForm((f) => ({ ...f, category: val as ProductCategory }))}
                >
                  <SelectTrigger id="acct-category">
                    <SelectValue placeholder="Valj kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="acct-vat">Momssats *</Label>
                <Select
                  value={String(accountForm.vatRate)}
                  onValueChange={(val) => setAccountForm((f) => ({ ...f, vatRate: Number(val) }))}
                >
                  <SelectTrigger id="acct-vat">
                    <SelectValue placeholder="Moms" />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_RATES.map((r) => (
                      <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
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
