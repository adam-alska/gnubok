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
  Trash2,
  Loader2,
  Search,
  RotateCcw,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ReturnStatus = 'Mottagen' | 'Krediterad' | 'Lager återställd' | 'Avvisad'

interface ReturnEntry {
  id: string
  orderId: string
  date: string
  product: string
  qty: number
  amount: number
  vatAmount: number
  vatRate: number
  status: ReturnStatus
  stockRestored: boolean
  creditAccount: string
  reason: string
}

interface Settings {
  defaultCreditAccount: string
  autoRestoreStock: boolean
  defaultVatRate: number
}

const DEFAULT_SETTINGS: Settings = {
  defaultCreditAccount: '3740',
  autoRestoreStock: true,
  defaultVatRate: 25,
}

const DEFAULT_RETURNS: ReturnEntry[] = [
  { id: '1', orderId: 'ORD-2401', date: '2025-01-15', product: 'T-shirt Basic', qty: 2, amount: 398, vatAmount: 79.60, vatRate: 25, status: 'Krediterad', stockRestored: true, creditAccount: '3740', reason: 'Fel storlek' },
  { id: '2', orderId: 'ORD-2389', date: '2025-01-14', product: 'Hoodie Premium', qty: 1, amount: 499, vatAmount: 99.80, vatRate: 25, status: 'Mottagen', stockRestored: false, creditAccount: '3740', reason: 'Defekt vara' },
  { id: '3', orderId: 'ORD-2350', date: '2025-01-10', product: 'Ryggsäck 25L', qty: 1, amount: 599, vatAmount: 119.80, vatRate: 25, status: 'Lager återställd', stockRestored: true, creditAccount: '3740', reason: 'Ångerrätt' },
  { id: '4', orderId: 'ORD-2310', date: '2025-01-08', product: 'Solglasögon Sport', qty: 1, amount: 299, vatAmount: 59.80, vatRate: 25, status: 'Avvisad', stockRestored: false, creditAccount: '3740', reason: 'Använd vara' },
]

const STATUS_VARIANTS: Record<ReturnStatus, 'info' | 'success' | 'warning' | 'danger'> = {
  'Mottagen': 'info',
  'Krediterad': 'success',
  'Lager återställd': 'warning',
  'Avvisad': 'danger',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

const EMPTY_FORM = {
  orderId: '',
  product: '',
  qty: '1',
  amount: '',
  vatRate: '25',
  reason: '',
}

export function ReturbokforingWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [returns, setReturns] = useState<ReturnEntry[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<ReturnStatus | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<ReturnEntry | null>(null)

  const [creditAccountInput, setCreditAccountInput] = useState(DEFAULT_SETTINGS.defaultCreditAccount)
  const [vatRateInput, setVatRateInput] = useState(String(DEFAULT_SETTINGS.defaultVatRate))

  const saveReturns = useCallback(async (newReturns: ReturnEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'returns',
        config_value: newReturns,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveSettings = useCallback(async (newSettings: Settings) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'settings',
        config_value: newSettings,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: returnsData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'returns')
      .maybeSingle()

    if (returnsData?.config_value && Array.isArray(returnsData.config_value) && returnsData.config_value.length > 0) {
      setReturns(returnsData.config_value as ReturnEntry[])
    } else {
      setReturns(DEFAULT_RETURNS)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'returns',
          config_value: DEFAULT_RETURNS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: settingsData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'settings')
      .maybeSingle()

    if (settingsData?.config_value) {
      const s = settingsData.config_value as Settings
      setSettings(s)
      setCreditAccountInput(s.defaultCreditAccount)
      setVatRateInput(String(s.defaultVatRate))
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredReturns = useMemo(() => {
    let result = returns
    if (filterStatus !== 'all') {
      result = result.filter((r) => r.status === filterStatus)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (r) =>
          r.orderId.toLowerCase().includes(q) ||
          r.product.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [returns, filterStatus, searchQuery])

  const totalCredited = useMemo(() => returns.filter((r) => r.status === 'Krediterad' || r.status === 'Lager återställd').reduce((s, r) => s + r.amount, 0), [returns])
  const totalVatCorrection = useMemo(() => returns.filter((r) => r.status === 'Krediterad' || r.status === 'Lager återställd').reduce((s, r) => s + r.vatAmount, 0), [returns])
  const pendingCount = useMemo(() => returns.filter((r) => r.status === 'Mottagen').length, [returns])
  const restoredCount = useMemo(() => returns.filter((r) => r.stockRestored).length, [returns])

  async function handleAddReturn() {
    const amount = parseFloat(form.amount)
    const vatRate = parseFloat(form.vatRate)
    const qty = parseInt(form.qty, 10)
    if (!form.orderId.trim() || !form.product.trim() || isNaN(amount) || isNaN(qty)) return

    const vatAmount = amount * (vatRate / (100 + vatRate))
    const today = new Date().toISOString().slice(0, 10)

    const newEntry: ReturnEntry = {
      id: generateId(),
      orderId: form.orderId.trim(),
      date: today,
      product: form.product.trim(),
      qty,
      amount,
      vatAmount,
      vatRate,
      status: 'Mottagen',
      stockRestored: false,
      creditAccount: settings.defaultCreditAccount,
      reason: form.reason.trim() || 'Ej angiven',
    }

    const updated = [newEntry, ...returns]
    setReturns(updated)
    setDialogOpen(false)
    setForm(EMPTY_FORM)
    await saveReturns(updated)
  }

  async function handleUpdateStatus(id: string, newStatus: ReturnStatus) {
    const updated = returns.map((r) => {
      if (r.id !== id) return r
      return {
        ...r,
        status: newStatus,
        stockRestored: newStatus === 'Lager återställd' ? true : r.stockRestored,
      }
    })
    setReturns(updated)
    await saveReturns(updated)
  }

  async function handleDeleteReturn() {
    if (!entryToDelete) return
    const updated = returns.filter((r) => r.id !== entryToDelete.id)
    setReturns(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveReturns(updated)
  }

  async function handleSaveSettings() {
    setSaving(true)
    const newSettings: Settings = {
      ...settings,
      defaultCreditAccount: creditAccountInput,
      defaultVatRate: parseFloat(vatRateInput) || 25,
    }
    setSettings(newSettings)
    await saveSettings(newSettings)
    setSaving(false)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="E-handel"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={() => { setForm(EMPTY_FORM); setDialogOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            Ny retur
          </Button>
        }
      >
        <Tabs defaultValue="returer" className="space-y-6">
          <TabsList>
            <TabsTrigger value="returer">Returer</TabsTrigger>
            <TabsTrigger value="bokforing">Bokföringsvy</TabsTrigger>
            <TabsTrigger value="installningar">Inställningar</TabsTrigger>
          </TabsList>

          <TabsContent value="returer" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Totalt krediterat" value={fmt(totalCredited)} unit="kr" />
                  <KPICard label="Momskorrigering" value={fmt(totalVatCorrection)} unit="kr" />
                  <KPICard label="Väntar behandling" value={String(pendingCount)} unit="st" trend={pendingCount > 5 ? 'down' : 'neutral'} />
                  <KPICard label="Lager återställt" value={String(restoredCount)} unit="st" />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök order-ID, produkt eller orsak..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as ReturnStatus | 'all')}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Filtrera status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      <SelectItem value="Mottagen">Mottagen</SelectItem>
                      <SelectItem value="Krediterad">Krediterad</SelectItem>
                      <SelectItem value="Lager återställd">Lager återställd</SelectItem>
                      <SelectItem value="Avvisad">Avvisad</SelectItem>
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredReturns.length === 0 ? (
                  <EmptyModuleState
                    icon={RotateCcw}
                    title="Inga returer hittades"
                    description={
                      searchQuery || filterStatus !== 'all'
                        ? 'Inga returer matchar filtret.'
                        : 'Registrera returer för att börja returbokföring.'
                    }
                    actionLabel={!searchQuery && filterStatus === 'all' ? 'Ny retur' : undefined}
                    onAction={!searchQuery && filterStatus === 'all' ? () => { setForm(EMPTY_FORM); setDialogOpen(true) } : undefined}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Order-ID</TableHead>
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Produkt</TableHead>
                          <TableHead className="font-medium text-right">Antal</TableHead>
                          <TableHead className="font-medium text-right">Belopp</TableHead>
                          <TableHead className="font-medium text-right">Moms</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium">Orsak</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredReturns.map((ret) => (
                          <TableRow key={ret.id}>
                            <TableCell className="font-mono font-medium">{ret.orderId}</TableCell>
                            <TableCell className="text-muted-foreground">{ret.date}</TableCell>
                            <TableCell>{ret.product}</TableCell>
                            <TableCell className="text-right tabular-nums">{ret.qty}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(ret.amount)} kr</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(ret.vatAmount)} kr</TableCell>
                            <TableCell>
                              <StatusBadge label={ret.status} variant={STATUS_VARIANTS[ret.status]} />
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{ret.reason}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {ret.status === 'Mottagen' && (
                                  <>
                                    <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(ret.id, 'Krediterad')} title="Kreditera">
                                      Kreditera
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(ret.id, 'Avvisad')} title="Avvisa" className="text-red-600">
                                      Avvisa
                                    </Button>
                                  </>
                                )}
                                {ret.status === 'Krediterad' && !ret.stockRestored && (
                                  <Button variant="ghost" size="sm" onClick={() => handleUpdateStatus(ret.id, 'Lager återställd')} title="Återställ lager">
                                    Återställ lager
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(ret); setDeleteDialogOpen(true) }} title="Ta bort">
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
              </>
            )}
          </TabsContent>

          <TabsContent value="bokforing" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Genererade verifikationer</h3>
                <p className="text-xs text-muted-foreground">Kreditnotor bokförs automatiskt mot konto {settings.defaultCreditAccount} med momskorrigering.</p>
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Order-ID</TableHead>
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Konto</TableHead>
                        <TableHead className="font-medium text-right">Debet</TableHead>
                        <TableHead className="font-medium text-right">Kredit</TableHead>
                        <TableHead className="font-medium">Beskrivning</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returns
                        .filter((r) => r.status === 'Krediterad' || r.status === 'Lager återställd')
                        .flatMap((r) => [
                          { key: `${r.id}-credit`, orderId: r.orderId, date: r.date, account: r.creditAccount, debit: r.amount - r.vatAmount, credit: 0, desc: `Kreditnota ${r.product}` },
                          { key: `${r.id}-vat`, orderId: r.orderId, date: r.date, account: r.vatRate === 25 ? '2610' : r.vatRate === 12 ? '2620' : '2630', debit: r.vatAmount, credit: 0, desc: `Momskorrigering ${r.vatRate}%` },
                          { key: `${r.id}-bank`, orderId: r.orderId, date: r.date, account: '1930', debit: 0, credit: r.amount, desc: `Återbetalning kund` },
                        ])
                        .map((line) => (
                          <TableRow key={line.key}>
                            <TableCell className="font-mono">{line.orderId}</TableCell>
                            <TableCell className="text-muted-foreground">{line.date}</TableCell>
                            <TableCell className="font-mono">{line.account}</TableCell>
                            <TableCell className="text-right tabular-nums">{line.debit > 0 ? fmt(line.debit) : ''}</TableCell>
                            <TableCell className="text-right tabular-nums">{line.credit > 0 ? fmt(line.credit) : ''}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{line.desc}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="installningar" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
              <h3 className="text-sm font-semibold">Returbokföring</h3>
              <p className="text-xs text-muted-foreground">
                Kreditkonto för returer (standard BAS 3740) samt standard-momssats.
              </p>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Kreditkonto</Label>
                  <Input value={creditAccountInput} onChange={(e) => setCreditAccountInput(e.target.value)} className="h-9 w-32" placeholder="3740" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Standard-momssats (%)</Label>
                  <Select value={vatRateInput} onValueChange={setVatRateInput}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25%</SelectItem>
                      <SelectItem value="12">12%</SelectItem>
                      <SelectItem value="6">6%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button size="sm" onClick={handleSaveSettings} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                Spara
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny retur</DialogTitle>
            <DialogDescription>Registrera en ny retur med automatisk kreditering.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Order-ID *</Label>
                <Input value={form.orderId} onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))} placeholder="ORD-2401" />
              </div>
              <div className="grid gap-2">
                <Label>Produkt *</Label>
                <Input value={form.product} onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))} placeholder="T-shirt Basic" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Antal</Label>
                <Input type="number" min={1} value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Belopp (inkl. moms) *</Label>
                <Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="398" />
              </div>
              <div className="grid gap-2">
                <Label>Moms %</Label>
                <Select value={form.vatRate} onValueChange={(v) => setForm((f) => ({ ...f, vatRate: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25%</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="6">6%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Orsak</Label>
              <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Fel storlek, defekt, ångerrätt..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleAddReturn} disabled={!form.orderId.trim() || !form.product.trim() || !form.amount}>
              Registrera retur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort retur</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort returen för order{' '}
              <span className="font-mono font-semibold">{entryToDelete?.orderId}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteReturn}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
