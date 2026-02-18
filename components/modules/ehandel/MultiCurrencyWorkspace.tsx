'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
  Coins,
  Save,
  RefreshCw,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface CurrencyTransaction {
  id: string
  date: string
  description: string
  currency: string
  foreignAmount: number
  exchangeRate: number
  sekAmount: number
  bookedRate: number
  exchangeDiff: number
  diffAccount: string
}

interface ExchangeRate {
  currency: string
  rate: number
  date: string
}

interface Settings {
  gainAccount: string
  lossAccount: string
  baseCurrency: string
}

const DEFAULT_SETTINGS: Settings = {
  gainAccount: '3960',
  lossAccount: '7960',
  baseCurrency: 'SEK',
}

const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'NOK', 'DKK']

const DEFAULT_RATES: ExchangeRate[] = [
  { currency: 'EUR', rate: 11.25, date: '2025-01-15' },
  { currency: 'USD', rate: 10.52, date: '2025-01-15' },
  { currency: 'GBP', rate: 13.28, date: '2025-01-15' },
  { currency: 'NOK', rate: 0.96, date: '2025-01-15' },
  { currency: 'DKK', rate: 1.51, date: '2025-01-15' },
]

const DEFAULT_TRANSACTIONS: CurrencyTransaction[] = [
  { id: '1', date: '2025-01-15', description: 'Beställning DE-4501', currency: 'EUR', foreignAmount: 89.99, exchangeRate: 11.25, sekAmount: 1012.39, bookedRate: 11.30, exchangeDiff: -4.50, diffAccount: '7960' },
  { id: '2', date: '2025-01-14', description: 'Beställning US-1203', currency: 'USD', foreignAmount: 149.00, exchangeRate: 10.52, sekAmount: 1567.48, bookedRate: 10.45, exchangeDiff: 10.43, diffAccount: '3960' },
  { id: '3', date: '2025-01-12', description: 'Beställning UK-887', currency: 'GBP', foreignAmount: 59.99, exchangeRate: 13.28, sekAmount: 796.67, bookedRate: 13.35, exchangeDiff: -4.20, diffAccount: '7960' },
  { id: '4', date: '2025-01-10', description: 'Beställning NO-2244', currency: 'NOK', foreignAmount: 799.00, exchangeRate: 0.96, sekAmount: 767.04, bookedRate: 0.95, exchangeDiff: 7.99, diffAccount: '3960' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

const EMPTY_FORM = {
  description: '',
  currency: 'EUR',
  foreignAmount: '',
  exchangeRate: '',
  bookedRate: '',
}

export function MultiCurrencyWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [transactions, setTransactions] = useState<CurrencyTransaction[]>([])
  const [rates, setRates] = useState<ExchangeRate[]>(DEFAULT_RATES)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterCurrency, setFilterCurrency] = useState<string>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [txToDelete, setTxToDelete] = useState<CurrencyTransaction | null>(null)

  const [gainAccountInput, setGainAccountInput] = useState(DEFAULT_SETTINGS.gainAccount)
  const [lossAccountInput, setLossAccountInput] = useState(DEFAULT_SETTINGS.lossAccount)

  const saveTransactions = useCallback(async (newTx: CurrencyTransaction[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'transactions',
        config_value: newTx,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveRates = useCallback(async (newRates: ExchangeRate[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'exchange_rates',
        config_value: newRates,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const saveSettingsToDb = useCallback(async (newSettings: Settings) => {
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

    const { data: txData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'transactions')
      .maybeSingle()

    if (txData?.config_value && Array.isArray(txData.config_value) && txData.config_value.length > 0) {
      setTransactions(txData.config_value as CurrencyTransaction[])
    } else {
      setTransactions(DEFAULT_TRANSACTIONS)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'transactions', config_value: DEFAULT_TRANSACTIONS },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: ratesData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'exchange_rates')
      .maybeSingle()

    if (ratesData?.config_value && Array.isArray(ratesData.config_value)) {
      setRates(ratesData.config_value as ExchangeRate[])
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
      setGainAccountInput(s.gainAccount)
      setLossAccountInput(s.lossAccount)
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredTx = useMemo(() => {
    let result = transactions
    if (filterCurrency !== 'all') {
      result = result.filter((t) => t.currency === filterCurrency)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((t) => t.description.toLowerCase().includes(q) || t.currency.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, filterCurrency, searchQuery])

  const totalGain = useMemo(() => transactions.filter((t) => t.exchangeDiff > 0).reduce((s, t) => s + t.exchangeDiff, 0), [transactions])
  const totalLoss = useMemo(() => transactions.filter((t) => t.exchangeDiff < 0).reduce((s, t) => s + Math.abs(t.exchangeDiff), 0), [transactions])
  const netDiff = useMemo(() => totalGain - totalLoss, [totalGain, totalLoss])
  const totalSekVolume = useMemo(() => transactions.reduce((s, t) => s + t.sekAmount, 0), [transactions])

  function getRateForCurrency(currency: string): number {
    const found = rates.find((r) => r.currency === currency)
    return found?.rate ?? 1
  }

  async function handleAddTransaction() {
    const foreignAmount = parseFloat(form.foreignAmount)
    const exchangeRate = parseFloat(form.exchangeRate)
    const bookedRate = parseFloat(form.bookedRate)
    if (!form.description.trim() || isNaN(foreignAmount) || isNaN(exchangeRate) || isNaN(bookedRate)) return

    const sekAmount = foreignAmount * exchangeRate
    const exchangeDiff = foreignAmount * (exchangeRate - bookedRate)
    const diffAccount = exchangeDiff >= 0 ? settings.gainAccount : settings.lossAccount
    const today = new Date().toISOString().slice(0, 10)

    const newTx: CurrencyTransaction = {
      id: generateId(),
      date: today,
      description: form.description.trim(),
      currency: form.currency,
      foreignAmount,
      exchangeRate,
      sekAmount,
      bookedRate,
      exchangeDiff,
      diffAccount,
    }

    const updated = [newTx, ...transactions]
    setTransactions(updated)
    setDialogOpen(false)
    setForm(EMPTY_FORM)
    await saveTransactions(updated)
  }

  async function handleDeleteTx() {
    if (!txToDelete) return
    const updated = transactions.filter((t) => t.id !== txToDelete.id)
    setTransactions(updated)
    setDeleteDialogOpen(false)
    setTxToDelete(null)
    await saveTransactions(updated)
  }

  async function handleUpdateRate(currency: string, newRate: string) {
    const rate = parseFloat(newRate)
    if (isNaN(rate)) return
    const today = new Date().toISOString().slice(0, 10)
    const updated = rates.map((r) => r.currency === currency ? { ...r, rate, date: today } : r)
    setRates(updated)
    await saveRates(updated)
  }

  async function handleSaveSettings() {
    setSaving(true)
    const newSettings: Settings = {
      ...settings,
      gainAccount: gainAccountInput,
      lossAccount: lossAccountInput,
    }
    setSettings(newSettings)
    await saveSettingsToDb(newSettings)
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
          <Button onClick={() => { setForm({ ...EMPTY_FORM, exchangeRate: String(getRateForCurrency('EUR')) }); setDialogOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" />
            Ny transaktion
          </Button>
        }
      >
        <Tabs defaultValue="transaktioner" className="space-y-6">
          <TabsList>
            <TabsTrigger value="transaktioner">Transaktioner</TabsTrigger>
            <TabsTrigger value="kurser">Växelkurser</TabsTrigger>
            <TabsTrigger value="installningar">Inställningar</TabsTrigger>
          </TabsList>

          <TabsContent value="transaktioner" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Total volym (SEK)" value={fmt(totalSekVolume)} unit="kr" />
                  <KPICard label="Kursvinst" value={fmt(totalGain)} unit="kr" trend="up" trendLabel={`Konto ${settings.gainAccount}`} />
                  <KPICard label="Kursförlust" value={fmt(totalLoss)} unit="kr" trend="down" trendLabel={`Konto ${settings.lossAccount}`} />
                  <KPICard
                    label="Netto kursdiff"
                    value={`${netDiff >= 0 ? '+' : ''}${fmt(netDiff)}`}
                    unit="kr"
                    trend={netDiff > 0 ? 'up' : netDiff < 0 ? 'down' : 'neutral'}
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Sök beskrivning eller valuta..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={filterCurrency} onValueChange={setFilterCurrency}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Filtrera valuta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla valutor</SelectItem>
                      {COMMON_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
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

                {filteredTx.length === 0 ? (
                  <EmptyModuleState
                    icon={Coins}
                    title="Inga transaktioner"
                    description={searchQuery || filterCurrency !== 'all' ? 'Inga transaktioner matchar filtret.' : 'Registrera valutatransaktioner för kursdifferensberäkning.'}
                    actionLabel={!searchQuery && filterCurrency === 'all' ? 'Ny transaktion' : undefined}
                    onAction={!searchQuery && filterCurrency === 'all' ? () => setDialogOpen(true) : undefined}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Beskrivning</TableHead>
                          <TableHead className="font-medium">Valuta</TableHead>
                          <TableHead className="font-medium text-right">Utländskt belopp</TableHead>
                          <TableHead className="font-medium text-right">Kurs</TableHead>
                          <TableHead className="font-medium text-right">SEK-belopp</TableHead>
                          <TableHead className="font-medium text-right">Kursdiff</TableHead>
                          <TableHead className="font-medium">Konto</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTx.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="text-muted-foreground">{tx.date}</TableCell>
                            <TableCell>{tx.description}</TableCell>
                            <TableCell><Badge variant="outline">{tx.currency}</Badge></TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(tx.foreignAmount)}</TableCell>
                            <TableCell className="text-right tabular-nums">{tx.exchangeRate.toFixed(4)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(tx.sekAmount)} kr</TableCell>
                            <TableCell className={`text-right tabular-nums font-medium ${tx.exchangeDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {tx.exchangeDiff >= 0 ? '+' : ''}{fmt(tx.exchangeDiff)} kr
                            </TableCell>
                            <TableCell className="font-mono">{tx.diffAccount}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setTxToDelete(tx); setDeleteDialogOpen(true) }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
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

          <TabsContent value="kurser" className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold">Riksbanken-kurser</h3>
                <Badge variant="secondary" className="text-xs">Manuell uppdatering</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Uppdatera dagskurser enligt Riksbanken. Kurserna används som standard vid nya transaktioner.
              </p>
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Valuta</TableHead>
                      <TableHead className="font-medium text-right">Kurs (1 enhet = SEK)</TableHead>
                      <TableHead className="font-medium">Senast uppdaterad</TableHead>
                      <TableHead className="font-medium text-right">Uppdatera</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map((r) => (
                      <TableRow key={r.currency}>
                        <TableCell className="font-medium">{r.currency}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.0001"
                            min={0}
                            defaultValue={r.rate}
                            className="h-8 w-28 text-right ml-auto"
                            onBlur={(e) => handleUpdateRate(r.currency, e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.date}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" title="Uppdatera" onClick={() => handleUpdateRate(r.currency, String(r.rate))}>
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="installningar" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
              <h3 className="text-sm font-semibold">Kursdifferenskonton</h3>
              <p className="text-xs text-muted-foreground">
                Konto 3960 (kursvinst) och 7960 (kursförlust) enligt BAS-kontoplan.
              </p>
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Kursvinst (konto)</Label>
                  <Input value={gainAccountInput} onChange={(e) => setGainAccountInput(e.target.value)} className="h-9 w-32" placeholder="3960" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Kursförlust (konto)</Label>
                  <Input value={lossAccountInput} onChange={(e) => setLossAccountInput(e.target.value)} className="h-9 w-32" placeholder="7960" />
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
            <DialogTitle>Ny valutatransaktion</DialogTitle>
            <DialogDescription>Registrera en utländsk transaktion med kursdifferens.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Beskrivning *</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Beställning DE-4501" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Valuta *</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v, exchangeRate: String(getRateForCurrency(v)) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMMON_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Utländskt belopp *</Label>
                <Input type="number" min={0} step="0.01" value={form.foreignAmount} onChange={(e) => setForm((f) => ({ ...f, foreignAmount: e.target.value }))} placeholder="89.99" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Dagskurs (Riksbanken)</Label>
                <Input type="number" min={0} step="0.0001" value={form.exchangeRate} onChange={(e) => setForm((f) => ({ ...f, exchangeRate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Bokförd kurs *</Label>
                <Input type="number" min={0} step="0.0001" value={form.bookedRate} onChange={(e) => setForm((f) => ({ ...f, bookedRate: e.target.value }))} placeholder="11.30" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleAddTransaction} disabled={!form.description.trim() || !form.foreignAmount || !form.exchangeRate || !form.bookedRate}>
              Registrera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort transaktion</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort{' '}
              <span className="font-semibold">{txToDelete?.description}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteTx}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
