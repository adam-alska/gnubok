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
import { Progress } from '@/components/ui/progress'
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
  CreditCard,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type PlatformName = 'Shopify' | 'Stripe' | 'Klarna' | 'PayPal' | 'Swish' | 'Övrigt'

interface FeeEntry {
  id: string
  date: string
  platform: PlatformName
  orderId: string
  grossAmount: number
  feeAmount: number
  feePercent: number
  netPayout: number
  account: string
}

interface PlatformSummary {
  platform: PlatformName
  totalGross: number
  totalFees: number
  totalNet: number
  avgFeePercent: number
  transactionCount: number
}

interface Settings {
  accounts: Record<PlatformName, string>
}

const PLATFORM_NAMES: PlatformName[] = ['Shopify', 'Stripe', 'Klarna', 'PayPal', 'Swish', 'Övrigt']

const DEFAULT_ACCOUNTS: Record<PlatformName, string> = {
  'Shopify': '6591',
  'Stripe': '6592',
  'Klarna': '6593',
  'PayPal': '6594',
  'Swish': '6595',
  'Övrigt': '6590',
}

const DEFAULT_ENTRIES: FeeEntry[] = [
  { id: '1', date: '2025-01-15', platform: 'Shopify', orderId: 'SH-4501', grossAmount: 1299, feeAmount: 33.57, feePercent: 2.58, netPayout: 1265.43, account: '6591' },
  { id: '2', date: '2025-01-15', platform: 'Stripe', orderId: 'ST-8823', grossAmount: 899, feeAmount: 25.17, feePercent: 2.80, netPayout: 873.83, account: '6592' },
  { id: '3', date: '2025-01-14', platform: 'Klarna', orderId: 'KL-1205', grossAmount: 2499, feeAmount: 74.97, feePercent: 3.00, netPayout: 2424.03, account: '6593' },
  { id: '4', date: '2025-01-14', platform: 'Shopify', orderId: 'SH-4502', grossAmount: 599, feeAmount: 15.45, feePercent: 2.58, netPayout: 583.55, account: '6591' },
  { id: '5', date: '2025-01-13', platform: 'Stripe', orderId: 'ST-8824', grossAmount: 1799, feeAmount: 50.37, feePercent: 2.80, netPayout: 1748.63, account: '6592' },
  { id: '6', date: '2025-01-13', platform: 'Klarna', orderId: 'KL-1206', grossAmount: 449, feeAmount: 13.47, feePercent: 3.00, netPayout: 435.53, account: '6593' },
  { id: '7', date: '2025-01-12', platform: 'PayPal', orderId: 'PP-3301', grossAmount: 349, feeAmount: 14.31, feePercent: 4.10, netPayout: 334.69, account: '6594' },
  { id: '8', date: '2025-01-12', platform: 'Swish', orderId: 'SW-7701', grossAmount: 199, feeAmount: 3.98, feePercent: 2.00, netPayout: 195.02, account: '6595' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(2) : '0.00'
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

const PLATFORM_COLORS: Record<PlatformName, string> = {
  'Shopify': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'Stripe': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Klarna': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  'PayPal': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Swish': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Övrigt': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

const EMPTY_FORM = {
  platform: 'Shopify' as PlatformName,
  orderId: '',
  grossAmount: '',
  feePercent: '2.58',
}

export function PlattformsavgifterWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<FeeEntry[]>([])
  const [settings, setSettings] = useState<Settings>({ accounts: DEFAULT_ACCOUNTS })

  const [searchQuery, setSearchQuery] = useState('')
  const [filterPlatform, setFilterPlatform] = useState<PlatformName | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [entryToDelete, setEntryToDelete] = useState<FeeEntry | null>(null)

  const saveEntries = useCallback(async (newEntries: FeeEntry[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'fee_entries', config_value: newEntries },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveSettingsToDb = useCallback(async (newSettings: Settings) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'settings', config_value: newSettings },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: entriesData } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'fee_entries').maybeSingle()

    if (entriesData?.config_value && Array.isArray(entriesData.config_value) && entriesData.config_value.length > 0) {
      setEntries(entriesData.config_value as FeeEntry[])
    } else {
      setEntries(DEFAULT_ENTRIES)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'fee_entries', config_value: DEFAULT_ENTRIES },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: settingsData } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'settings').maybeSingle()

    if (settingsData?.config_value) {
      setSettings(settingsData.config_value as Settings)
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredEntries = useMemo(() => {
    let result = entries
    if (filterPlatform !== 'all') result = result.filter((e) => e.platform === filterPlatform)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) => e.orderId.toLowerCase().includes(q) || e.platform.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, filterPlatform, searchQuery])

  const platformSummaries = useMemo((): PlatformSummary[] => {
    const map: Record<string, { gross: number; fees: number; net: number; count: number }> = {}
    for (const e of entries) {
      if (!map[e.platform]) map[e.platform] = { gross: 0, fees: 0, net: 0, count: 0 }
      map[e.platform].gross += e.grossAmount
      map[e.platform].fees += e.feeAmount
      map[e.platform].net += e.netPayout
      map[e.platform].count++
    }
    return Object.entries(map).map(([platform, data]) => ({
      platform: platform as PlatformName,
      totalGross: data.gross,
      totalFees: data.fees,
      totalNet: data.net,
      avgFeePercent: data.gross > 0 ? (data.fees / data.gross) * 100 : 0,
      transactionCount: data.count,
    })).sort((a, b) => b.totalFees - a.totalFees)
  }, [entries])

  const totalGross = useMemo(() => entries.reduce((s, e) => s + e.grossAmount, 0), [entries])
  const totalFees = useMemo(() => entries.reduce((s, e) => s + e.feeAmount, 0), [entries])
  const totalNet = useMemo(() => entries.reduce((s, e) => s + e.netPayout, 0), [entries])
  const avgFeePercent = useMemo(() => totalGross > 0 ? (totalFees / totalGross) * 100 : 0, [totalGross, totalFees])

  async function handleAddEntry() {
    const grossAmount = parseFloat(form.grossAmount)
    const feePercent = parseFloat(form.feePercent)
    if (!form.orderId.trim() || isNaN(grossAmount) || isNaN(feePercent)) return

    const feeAmount = grossAmount * (feePercent / 100)
    const netPayout = grossAmount - feeAmount
    const today = new Date().toISOString().slice(0, 10)

    const newEntry: FeeEntry = {
      id: generateId(),
      date: today,
      platform: form.platform,
      orderId: form.orderId.trim(),
      grossAmount,
      feeAmount,
      feePercent,
      netPayout,
      account: settings.accounts[form.platform] ?? '6590',
    }

    const updated = [newEntry, ...entries]
    setEntries(updated)
    setDialogOpen(false)
    setForm(EMPTY_FORM)
    await saveEntries(updated)
  }

  async function handleDeleteEntry() {
    if (!entryToDelete) return
    const updated = entries.filter((e) => e.id !== entryToDelete.id)
    setEntries(updated)
    setDeleteDialogOpen(false)
    setEntryToDelete(null)
    await saveEntries(updated)
  }

  async function handleSaveAccountSettings(platform: PlatformName, account: string) {
    const newSettings: Settings = {
      ...settings,
      accounts: { ...settings.accounts, [platform]: account },
    }
    setSettings(newSettings)
    await saveSettingsToDb(newSettings)
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
            Ny avgift
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="transaktioner">Transaktioner</TabsTrigger>
            <TabsTrigger value="installningar">Inställningar</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Brutto totalt" value={fmt(totalGross)} unit="kr" />
                  <KPICard label="Totala avgifter" value={fmt(totalFees)} unit="kr" trend="down" trendLabel={`${fmtPct(avgFeePercent)}% avg`} />
                  <KPICard label="Netto utbetalat" value={fmt(totalNet)} unit="kr" />
                  <KPICard label="Snitt avgift" value={fmtPct(avgFeePercent)} unit="%" />
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Per plattform</h3>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Plattform</TableHead>
                          <TableHead className="font-medium text-right">Brutto</TableHead>
                          <TableHead className="font-medium text-right">Avgifter</TableHead>
                          <TableHead className="font-medium text-right">Netto</TableHead>
                          <TableHead className="font-medium text-right">Snitt %</TableHead>
                          <TableHead className="font-medium text-right">Antal</TableHead>
                          <TableHead className="font-medium">Andel av avgifter</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {platformSummaries.map((ps) => (
                          <TableRow key={ps.platform}>
                            <TableCell>
                              <Badge variant="secondary" className={PLATFORM_COLORS[ps.platform]}>{ps.platform}</Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(ps.totalGross)} kr</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(ps.totalFees)} kr</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(ps.totalNet)} kr</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtPct(ps.avgFeePercent)}%</TableCell>
                            <TableCell className="text-right tabular-nums">{ps.transactionCount}</TableCell>
                            <TableCell>
                              <Progress value={totalFees > 0 ? (ps.totalFees / totalFees) * 100 : 0} className="h-2" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="transaktioner" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Sök order-ID eller plattform..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                  <Select value={filterPlatform} onValueChange={(v) => setFilterPlatform(v as PlatformName | 'all')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrera plattform" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla plattformar</SelectItem>
                      {PLATFORM_NAMES.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredEntries.length === 0 ? (
                  <EmptyModuleState
                    icon={CreditCard}
                    title="Inga avgifter"
                    description={searchQuery || filterPlatform !== 'all' ? 'Inga poster matchar filtret.' : 'Registrera plattformsavgifter.'}
                    actionLabel={!searchQuery && filterPlatform === 'all' ? 'Ny avgift' : undefined}
                    onAction={!searchQuery && filterPlatform === 'all' ? () => setDialogOpen(true) : undefined}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Plattform</TableHead>
                          <TableHead className="font-medium">Order-ID</TableHead>
                          <TableHead className="font-medium text-right">Brutto</TableHead>
                          <TableHead className="font-medium text-right">Avgift</TableHead>
                          <TableHead className="font-medium text-right">%</TableHead>
                          <TableHead className="font-medium text-right">Netto</TableHead>
                          <TableHead className="font-medium">Konto</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntries.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="text-muted-foreground">{e.date}</TableCell>
                            <TableCell><Badge variant="secondary" className={PLATFORM_COLORS[e.platform]}>{e.platform}</Badge></TableCell>
                            <TableCell className="font-mono">{e.orderId}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(e.grossAmount)} kr</TableCell>
                            <TableCell className="text-right tabular-nums text-red-600">{fmt(e.feeAmount)} kr</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtPct(e.feePercent)}%</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fmt(e.netPayout)} kr</TableCell>
                            <TableCell className="font-mono">{e.account}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setEntryToDelete(e); setDeleteDialogOpen(true) }}>
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

          <TabsContent value="installningar" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-4">
              <h3 className="text-sm font-semibold">Avgiftskonton per plattform</h3>
              <p className="text-xs text-muted-foreground">
                Ange BAS-konto för varje plattformsavgift. Konto 6590 = generella plattformsavgifter.
              </p>
              <div className="grid gap-3">
                {PLATFORM_NAMES.map((platform) => (
                  <div key={platform} className="flex items-center gap-3">
                    <Badge variant="secondary" className={`${PLATFORM_COLORS[platform]} w-24 justify-center`}>{platform}</Badge>
                    <Input
                      defaultValue={settings.accounts[platform] ?? '6590'}
                      className="h-8 w-24 font-mono"
                      onBlur={(e) => handleSaveAccountSettings(platform, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny plattformsavgift</DialogTitle>
            <DialogDescription>Registrera brutto, avgift beräknas automatiskt.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Plattform *</Label>
                <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v as PlatformName }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORM_NAMES.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Order-ID *</Label>
                <Input value={form.orderId} onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))} placeholder="SH-4501" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Bruttobelopp (kr) *</Label>
                <Input type="number" min={0} step="0.01" value={form.grossAmount} onChange={(e) => setForm((f) => ({ ...f, grossAmount: e.target.value }))} placeholder="1299" />
              </div>
              <div className="grid gap-2">
                <Label>Avgift (%)</Label>
                <Input type="number" min={0} step="0.01" value={form.feePercent} onChange={(e) => setForm((f) => ({ ...f, feePercent: e.target.value }))} placeholder="2.58" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleAddEntry} disabled={!form.orderId.trim() || !form.grossAmount}>
              Lägg till
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort avgift</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort avgiften för{' '}
              <span className="font-mono font-semibold">{entryToDelete?.orderId}</span>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteEntry}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
