'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  CreditCard,
  Banknote,
  ShieldCheck,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type PaymentMethod = 'Kort' | 'Swish' | 'Kontant' | 'Faktura' | 'Frikort'
type FeeCategory = 'Läkarbesök' | 'Sjuksköterskebesök' | 'Specialistbesök' | 'Akutbesök' | 'Vaccination' | 'Provtagning' | 'Recept' | 'Intyg' | 'Övrigt'

interface PaymentTransaction {
  id: string
  date: string
  time: string
  patientRef: string
  patientName: string
  feeCategory: FeeCategory
  amount: number
  paymentMethod: PaymentMethod
  frikortUsed: boolean
  frikortVerified: boolean
  receiptNumber: string
  practitioner: string
  notes: string
}

interface FeeCategoryConfig {
  category: FeeCategory
  defaultAmount: number
  active: boolean
}

const FEE_CATEGORIES: FeeCategory[] = ['Läkarbesök', 'Sjuksköterskebesök', 'Specialistbesök', 'Akutbesök', 'Vaccination', 'Provtagning', 'Recept', 'Intyg', 'Övrigt']
const PAYMENT_METHODS: PaymentMethod[] = ['Kort', 'Swish', 'Kontant', 'Faktura', 'Frikort']

const PAYMENT_METHOD_COLORS: Record<PaymentMethod, string> = {
  'Kort': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Swish': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Kontant': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Faktura': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Frikort': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
}

const DEFAULT_FEE_CONFIG: FeeCategoryConfig[] = [
  { category: 'Läkarbesök', defaultAmount: 300, active: true },
  { category: 'Sjuksköterskebesök', defaultAmount: 200, active: true },
  { category: 'Specialistbesök', defaultAmount: 400, active: true },
  { category: 'Akutbesök', defaultAmount: 400, active: true },
  { category: 'Vaccination', defaultAmount: 250, active: true },
  { category: 'Provtagning', defaultAmount: 100, active: true },
  { category: 'Recept', defaultAmount: 0, active: true },
  { category: 'Intyg', defaultAmount: 500, active: true },
  { category: 'Övrigt', defaultAmount: 0, active: true },
]

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateReceipt(): string {
  return `KV-${Date.now().toString(36).toUpperCase()}`
}

export function KassasystemPatientavgifterWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([])
  const [feeConfig, setFeeConfig] = useState<FeeCategoryConfig[]>(DEFAULT_FEE_CONFIG)
  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterMethod, setFilterMethod] = useState<PaymentMethod | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [txForm, setTxForm] = useState({
    patientRef: '',
    patientName: '',
    date: todayStr(),
    time: nowTime(),
    feeCategory: 'Läkarbesök' as FeeCategory,
    amount: 300,
    paymentMethod: 'Kort' as PaymentMethod,
    frikortUsed: false,
    frikortVerified: false,
    practitioner: '',
    notes: '',
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [txToDelete, setTxToDelete] = useState<PaymentTransaction | null>(null)

  const saveTransactions = useCallback(async (newTx: PaymentTransaction[]) => {
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

  const saveFeeConfig = useCallback(async (newConfig: FeeCategoryConfig[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'fee_config',
        config_value: newConfig,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
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

    if (txData?.config_value && Array.isArray(txData.config_value)) {
      setTransactions(txData.config_value as PaymentTransaction[])
    }

    const { data: feeData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'fee_config')
      .maybeSingle()

    if (feeData?.config_value && Array.isArray(feeData.config_value) && feeData.config_value.length > 0) {
      setFeeConfig(feeData.config_value as FeeCategoryConfig[])
    } else {
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'fee_config',
          config_value: DEFAULT_FEE_CONFIG,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredTransactions = useMemo(() => {
    let result = transactions.filter((t) => t.date >= from && t.date <= to)
    if (filterMethod !== 'all') {
      result = result.filter((t) => t.paymentMethod === filterMethod)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (t) =>
          t.patientName.toLowerCase().includes(q) ||
          t.patientRef.toLowerCase().includes(q) ||
          t.receiptNumber.toLowerCase().includes(q) ||
          t.practitioner.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
  }, [transactions, from, to, filterMethod, searchQuery])

  const stats = useMemo(() => {
    const periodTx = transactions.filter((t) => t.date >= from && t.date <= to)
    const totalRevenue = periodTx.reduce((s, t) => s + t.amount, 0)
    const methodBreakdown: Record<PaymentMethod, number> = {
      Kort: 0, Swish: 0, Kontant: 0, Faktura: 0, Frikort: 0,
    }
    for (const t of periodTx) {
      methodBreakdown[t.paymentMethod] += t.amount
    }
    const frikortCount = periodTx.filter((t) => t.frikortUsed).length
    const avgPerTransaction = periodTx.length > 0 ? totalRevenue / periodTx.length : 0

    return { totalRevenue, totalTransactions: periodTx.length, methodBreakdown, frikortCount, avgPerTransaction }
  }, [transactions, from, to])

  function openNewTransaction() {
    const defaultFee = feeConfig.find((f) => f.category === 'Läkarbesök')
    setTxForm({
      patientRef: '',
      patientName: '',
      date: todayStr(),
      time: nowTime(),
      feeCategory: 'Läkarbesök',
      amount: defaultFee?.defaultAmount ?? 300,
      paymentMethod: 'Kort',
      frikortUsed: false,
      frikortVerified: false,
      practitioner: '',
      notes: '',
    })
    setDialogOpen(true)
  }

  async function handleSaveTransaction() {
    const newTx: PaymentTransaction = {
      id: generateId(),
      date: txForm.date,
      time: txForm.time,
      patientRef: txForm.patientRef.trim(),
      patientName: txForm.patientName.trim(),
      feeCategory: txForm.feeCategory,
      amount: txForm.frikortUsed ? 0 : txForm.amount,
      paymentMethod: txForm.frikortUsed ? 'Frikort' : txForm.paymentMethod,
      frikortUsed: txForm.frikortUsed,
      frikortVerified: txForm.frikortVerified,
      receiptNumber: generateReceipt(),
      practitioner: txForm.practitioner.trim(),
      notes: txForm.notes.trim(),
    }

    const updated = [...transactions, newTx]
    setTransactions(updated)
    setDialogOpen(false)
    await saveTransactions(updated)
  }

  function openDeleteConfirmation(tx: PaymentTransaction) {
    setTxToDelete(tx)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteTransaction() {
    if (!txToDelete) return
    const updated = transactions.filter((t) => t.id !== txToDelete.id)
    setTransactions(updated)
    setDeleteDialogOpen(false)
    setTxToDelete(null)
    await saveTransactions(updated)
  }

  async function handleSaveFeeConfig() {
    await saveFeeConfig(feeConfig)
  }

  function updateFeeConfigAmount(category: FeeCategory, amount: number) {
    setFeeConfig((prev) => prev.map((f) => f.category === category ? { ...f, defaultAmount: amount } : f))
  }

  function updateFeeConfigActive(category: FeeCategory, active: boolean) {
    setFeeConfig((prev) => prev.map((f) => f.category === category ? { ...f, active } : f))
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Hälsa & Sjukvård"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        }
      >
        <Tabs defaultValue="kassa" className="space-y-6">
          <TabsList>
            <TabsTrigger value="kassa">Kassa</TabsTrigger>
            <TabsTrigger value="transaktioner">Transaktioner</TabsTrigger>
            <TabsTrigger value="avgifter">Avgiftskategorier</TabsTrigger>
          </TabsList>

          <TabsContent value="kassa" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <KPICard label="Total omsättning" value={fmt(stats.totalRevenue)} unit="kr" />
                  <KPICard label="Antal transaktioner" value={stats.totalTransactions.toString()} />
                  <KPICard label="Snitt per transaktion" value={fmt(stats.avgPerTransaction)} unit="kr" />
                  <KPICard label="Frikort använda" value={stats.frikortCount.toString()} />
                  <KPICard label="Kortbetalning" value={fmt(stats.methodBreakdown.Kort)} unit="kr" />
                </div>

                <div className="flex items-center gap-3">
                  <Button size="lg" onClick={openNewTransaction}>
                    <CreditCard className="mr-2 h-5 w-5" />
                    Ny betalning
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {PAYMENT_METHODS.map((method) => (
                    <div key={method} className="rounded-xl border border-border bg-card p-4 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{method}</p>
                      <p className="text-lg font-semibold">{fmt(stats.methodBreakdown[method])} kr</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="transaktioner" className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök patient, kvittonummer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterMethod} onValueChange={(val) => setFilterMethod(val as PaymentMethod | 'all')}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Betalmetod" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla metoder</SelectItem>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={openNewTransaction}>
                <Plus className="mr-2 h-4 w-4" />
                Ny betalning
              </Button>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredTransactions.length === 0 ? (
              <EmptyModuleState
                icon={Banknote}
                title="Inga transaktioner"
                description="Registrera patientbetalningar för att se transaktionshistorik."
                actionLabel="Ny betalning"
                onAction={openNewTransaction}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum/Tid</TableHead>
                      <TableHead className="font-medium">Kvitto</TableHead>
                      <TableHead className="font-medium">Patient</TableHead>
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium text-right">Belopp</TableHead>
                      <TableHead className="font-medium">Betalmetod</TableHead>
                      <TableHead className="font-medium">Frikort</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-sm">
                          <div>{tx.date}</div>
                          <div className="text-xs text-muted-foreground">{tx.time}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{tx.receiptNumber}</TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{tx.patientName}</span>
                            <span className="text-xs text-muted-foreground ml-2">{tx.patientRef}</span>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{tx.feeCategory}</Badge></TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{fmt(tx.amount)} kr</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={PAYMENT_METHOD_COLORS[tx.paymentMethod]}>
                            {tx.paymentMethod}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {tx.frikortUsed ? (
                            <div className="flex items-center gap-1">
                              <ShieldCheck className="h-4 w-4 text-emerald-600" />
                              {tx.frikortVerified && <span className="text-xs text-emerald-600">Verifierat</span>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(tx)} title="Ta bort">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="avgifter" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-4">
              <h3 className="text-sm font-semibold">Avgiftskategorier</h3>
              <p className="text-xs text-muted-foreground">
                Konfigurera standardbelopp och aktiva avgiftskategorier.
              </p>
              <div className="space-y-3">
                {feeConfig.map((fee) => (
                  <div key={fee.category} className="flex items-center gap-4">
                    <Switch
                      checked={fee.active}
                      onCheckedChange={(c) => updateFeeConfigActive(fee.category, c)}
                    />
                    <span className="text-sm font-medium w-40">{fee.category}</span>
                    <Input
                      type="number"
                      min={0}
                      value={fee.defaultAmount}
                      onChange={(e) => updateFeeConfigAmount(fee.category, Number(e.target.value))}
                      className="h-9 w-24"
                      disabled={!fee.active}
                    />
                    <span className="text-xs text-muted-foreground">kr</span>
                  </div>
                ))}
              </div>
              <Button size="sm" onClick={handleSaveFeeConfig} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-2 h-3.5 w-3.5" />
                )}
                Spara avgifter
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ny betalning</DialogTitle>
            <DialogDescription>Registrera en patientbetalning.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tx-name">Patientnamn *</Label>
                <Input id="tx-name" value={txForm.patientName} onChange={(e) => setTxForm((f) => ({ ...f, patientName: e.target.value }))} placeholder="Anna Andersson" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tx-ref">Patientreferens</Label>
                <Input id="tx-ref" value={txForm.patientRef} onChange={(e) => setTxForm((f) => ({ ...f, patientRef: e.target.value }))} placeholder="P-001" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tx-cat">Avgiftskategori *</Label>
                <Select
                  value={txForm.feeCategory}
                  onValueChange={(val) => {
                    const cat = val as FeeCategory
                    const cfg = feeConfig.find((f) => f.category === cat)
                    setTxForm((f) => ({ ...f, feeCategory: cat, amount: cfg?.defaultAmount ?? f.amount }))
                  }}
                >
                  <SelectTrigger id="tx-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {feeConfig.filter((f) => f.active).map((f) => (
                      <SelectItem key={f.category} value={f.category}>{f.category} ({f.defaultAmount} kr)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tx-amount">Belopp (kr) *</Label>
                <Input id="tx-amount" type="number" min={0} value={txForm.amount} onChange={(e) => setTxForm((f) => ({ ...f, amount: Number(e.target.value) }))} disabled={txForm.frikortUsed} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="tx-method">Betalmetod *</Label>
                <Select
                  value={txForm.paymentMethod}
                  onValueChange={(val) => setTxForm((f) => ({ ...f, paymentMethod: val as PaymentMethod }))}
                  disabled={txForm.frikortUsed}
                >
                  <SelectTrigger id="tx-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.filter((m) => m !== 'Frikort').map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tx-pract">Behandlare</Label>
                <Input id="tx-pract" value={txForm.practitioner} onChange={(e) => setTxForm((f) => ({ ...f, practitioner: e.target.value }))} placeholder="Dr. Svensson" />
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/30">
              <div className="flex items-center gap-3">
                <Switch
                  checked={txForm.frikortUsed}
                  onCheckedChange={(c) => setTxForm((f) => ({ ...f, frikortUsed: c, frikortVerified: false }))}
                />
                <Label className="text-sm font-medium">Patient har frikort</Label>
              </div>
              {txForm.frikortUsed && (
                <div className="flex items-center gap-3 pl-12">
                  <Switch
                    checked={txForm.frikortVerified}
                    onCheckedChange={(c) => setTxForm((f) => ({ ...f, frikortVerified: c }))}
                  />
                  <Label className="text-sm">Frikort verifierat i register</Label>
                </div>
              )}
              {txForm.frikortUsed && (
                <p className="text-xs text-muted-foreground pl-12">
                  Betalning sätts till 0 kr. Frikort gäller {txForm.frikortVerified ? '(verifierat)' : '(ej verifierat - kontrollera manuellt)'}.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tx-notes">Anteckning</Label>
              <Input id="tx-notes" value={txForm.notes} onChange={(e) => setTxForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Eventuella noteringar..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveTransaction} disabled={!txForm.patientName.trim()}>
              <CreditCard className="mr-2 h-4 w-4" />
              Registrera betalning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort transaktion</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort transaktionen{' '}
              <span className="font-mono font-semibold">{txToDelete?.receiptNumber}</span> ({txToDelete?.patientName})? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteTransaction}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
