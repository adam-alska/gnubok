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
import { Textarea } from '@/components/ui/textarea'
import {
  Plus,
  Trash2,
  Loader2,
  Search,
  Download,
  Upload,
  CheckCircle,
  AlertTriangle,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ImportStatus = 'imported' | 'periodized' | 'reconciled' | 'error'

interface RegionPayment {
  id: string
  importDate: string
  paymentDate: string
  regionCode: string
  description: string
  grossAmount: number
  netAmount: number
  accountNumber: string
  period: string
  status: ImportStatus
  notes: string
}

interface AccountMapping {
  regionCode: string
  description: string
  accountNumber: string
}

const STATUS_LABELS: Record<ImportStatus, string> = {
  imported: 'Importerad',
  periodized: 'Periodiserad',
  reconciled: 'Avstämd',
  error: 'Fel',
}

const STATUS_COLORS: Record<ImportStatus, string> = {
  imported: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  periodized: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  reconciled: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const DEFAULT_MAPPINGS: AccountMapping[] = [
  { regionCode: 'REG-01', description: 'Kapiteringsersättning', accountNumber: '3010' },
  { regionCode: 'REG-02', description: 'Besöksersättning', accountNumber: '3011' },
  { regionCode: 'REG-03', description: 'Målrelaterad ersättning', accountNumber: '3012' },
  { regionCode: 'REG-04', description: 'Tilläggsersättning', accountNumber: '3013' },
]

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

export function RegionersattningsimportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [payments, setPayments] = useState<RegionPayment[]>([])
  const [mappings, setMappings] = useState<AccountMapping[]>(DEFAULT_MAPPINGS)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<ImportStatus | 'all'>('all')

  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importText, setImportText] = useState('')

  const [manualDialogOpen, setManualDialogOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: todayStr(),
    regionCode: 'REG-01',
    description: '',
    grossAmount: 0,
    netAmount: 0,
    accountNumber: '3010',
    period: todayStr().slice(0, 7),
    notes: '',
  })

  const [mappingDialogOpen, setMappingDialogOpen] = useState(false)
  const [mappingForm, setMappingForm] = useState({ regionCode: '', description: '', accountNumber: '' })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [paymentToDelete, setPaymentToDelete] = useState<RegionPayment | null>(null)

  const savePayments = useCallback(async (newPayments: RegionPayment[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'region_payments',
        config_value: newPayments,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveMappings = useCallback(async (newMappings: AccountMapping[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'account_mappings',
        config_value: newMappings,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: pData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'region_payments')
      .maybeSingle()

    if (pData?.config_value && Array.isArray(pData.config_value)) {
      setPayments(pData.config_value as RegionPayment[])
    }

    const { data: mData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'account_mappings')
      .maybeSingle()

    if (mData?.config_value && Array.isArray(mData.config_value) && mData.config_value.length > 0) {
      setMappings(mData.config_value as AccountMapping[])
    } else {
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'account_mappings',
          config_value: DEFAULT_MAPPINGS,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredPayments = useMemo(() => {
    let result = payments
    if (filterStatus !== 'all') {
      result = result.filter((p) => p.status === filterStatus)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.description.toLowerCase().includes(q) ||
          p.regionCode.toLowerCase().includes(q) ||
          p.period.includes(q)
      )
    }
    return result.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
  }, [payments, filterStatus, searchQuery])

  const stats = useMemo(() => {
    const totalGross = payments.reduce((s, p) => s + p.grossAmount, 0)
    const totalNet = payments.reduce((s, p) => s + p.netAmount, 0)
    const reconciled = payments.filter((p) => p.status === 'reconciled').length
    const errors = payments.filter((p) => p.status === 'error').length
    return { totalGross, totalNet, reconciled, errors, total: payments.length }
  }, [payments])

  function handleImportPaste() {
    const lines = importText.trim().split('\n').filter((l) => l.trim())
    const newPayments: RegionPayment[] = lines.map((line) => {
      const parts = line.split('\t')
      const mapping = mappings.find((m) => m.regionCode === (parts[1] || '').trim())
      return {
        id: generateId(),
        importDate: todayStr(),
        paymentDate: (parts[0] || todayStr()).trim(),
        regionCode: (parts[1] || '').trim(),
        description: (parts[2] || '').trim(),
        grossAmount: parseFloat(parts[3] || '0') || 0,
        netAmount: parseFloat(parts[4] || parts[3] || '0') || 0,
        accountNumber: mapping?.accountNumber || '3010',
        period: (parts[0] || todayStr()).trim().slice(0, 7),
        status: 'imported' as ImportStatus,
        notes: '',
      }
    })

    const updated = [...payments, ...newPayments]
    setPayments(updated)
    setImportDialogOpen(false)
    setImportText('')
    savePayments(updated)
  }

  function openManualEntry() {
    setPaymentForm({
      paymentDate: todayStr(),
      regionCode: 'REG-01',
      description: '',
      grossAmount: 0,
      netAmount: 0,
      accountNumber: '3010',
      period: todayStr().slice(0, 7),
      notes: '',
    })
    setManualDialogOpen(true)
  }

  async function handleSaveManual() {
    const newPayment: RegionPayment = {
      id: generateId(),
      importDate: todayStr(),
      paymentDate: paymentForm.paymentDate,
      regionCode: paymentForm.regionCode,
      description: paymentForm.description.trim(),
      grossAmount: paymentForm.grossAmount,
      netAmount: paymentForm.netAmount,
      accountNumber: paymentForm.accountNumber,
      period: paymentForm.period,
      status: 'imported',
      notes: paymentForm.notes.trim(),
    }

    const updated = [...payments, newPayment]
    setPayments(updated)
    setManualDialogOpen(false)
    await savePayments(updated)
  }

  async function handleToggleReconciled(payment: RegionPayment) {
    const newStatus: ImportStatus = payment.status === 'reconciled' ? 'periodized' : 'reconciled'
    const updated = payments.map((p) => p.id === payment.id ? { ...p, status: newStatus } : p)
    setPayments(updated)
    await savePayments(updated)
  }

  function openDeleteConfirmation(payment: RegionPayment) {
    setPaymentToDelete(payment)
    setDeleteDialogOpen(true)
  }

  async function handleDeletePayment() {
    if (!paymentToDelete) return
    const updated = payments.filter((p) => p.id !== paymentToDelete.id)
    setPayments(updated)
    setDeleteDialogOpen(false)
    setPaymentToDelete(null)
    await savePayments(updated)
  }

  function openMappingDialog() {
    setMappingForm({ regionCode: '', description: '', accountNumber: '' })
    setMappingDialogOpen(true)
  }

  async function handleSaveMapping() {
    const updated = [...mappings, { ...mappingForm }]
    setMappings(updated)
    setMappingDialogOpen(false)
    await saveMappings(updated)
  }

  async function handleDeleteMapping(index: number) {
    const updated = mappings.filter((_, i) => i !== index)
    setMappings(updated)
    await saveMappings(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="import"
        sectorName="Hälsa & Sjukvård"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Importera
            </Button>
            <Button onClick={openManualEntry}>
              <Plus className="mr-2 h-4 w-4" />
              Manuell rad
            </Button>
          </div>
        }
      >
        <Tabs defaultValue="betalningar" className="space-y-6">
          <TabsList>
            <TabsTrigger value="betalningar">Betalningar</TabsTrigger>
            <TabsTrigger value="kontomappning">Kontomappning</TabsTrigger>
            <TabsTrigger value="avstamning">Avstämning</TabsTrigger>
          </TabsList>

          <TabsContent value="betalningar" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Totalt brutto" value={fmt(stats.totalGross)} unit="kr" />
                  <KPICard label="Totalt netto" value={fmt(stats.totalNet)} unit="kr" />
                  <KPICard label="Antal rader" value={stats.total.toString()} />
                  <KPICard
                    label="Avstämda"
                    value={stats.reconciled.toString()}
                    trend={stats.errors > 0 ? 'down' : stats.reconciled === stats.total ? 'up' : 'neutral'}
                    trendLabel={stats.errors > 0 ? `${stats.errors} fel` : undefined}
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök beskrivning, regionkod..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as ImportStatus | 'all')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrera status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      <SelectItem value="imported">Importerad</SelectItem>
                      <SelectItem value="periodized">Periodiserad</SelectItem>
                      <SelectItem value="reconciled">Avstämd</SelectItem>
                      <SelectItem value="error">Fel</SelectItem>
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredPayments.length === 0 ? (
                  <EmptyModuleState
                    icon={Download}
                    title="Inga importerade betalningar"
                    description="Importera regionersättningar eller lägg till manuellt."
                    actionLabel="Importera"
                    onAction={() => setImportDialogOpen(true)}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Regionkod</TableHead>
                          <TableHead className="font-medium">Beskrivning</TableHead>
                          <TableHead className="font-medium text-right">Brutto</TableHead>
                          <TableHead className="font-medium text-right">Netto</TableHead>
                          <TableHead className="font-medium">Konto</TableHead>
                          <TableHead className="font-medium">Period</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPayments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell className="text-sm">{payment.paymentDate}</TableCell>
                            <TableCell className="font-mono text-sm">{payment.regionCode}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{payment.description}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{fmt(payment.grossAmount)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{fmt(payment.netAmount)}</TableCell>
                            <TableCell className="font-mono text-sm">{payment.accountNumber}</TableCell>
                            <TableCell className="text-sm">{payment.period}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={STATUS_COLORS[payment.status]}>
                                {STATUS_LABELS[payment.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleToggleReconciled(payment)} title="Markera avstämd">
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(payment)} title="Ta bort">
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

          <TabsContent value="kontomappning" className="space-y-6">
            <div className="flex items-center gap-3">
              <Button onClick={openMappingDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Ny mappning
              </Button>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">Regionkod</TableHead>
                    <TableHead className="font-medium">Beskrivning</TableHead>
                    <TableHead className="font-medium">Konto</TableHead>
                    <TableHead className="font-medium text-right">Åtgärder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappings.map((mapping, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono font-medium">{mapping.regionCode}</TableCell>
                      <TableCell>{mapping.description}</TableCell>
                      <TableCell className="font-mono">{mapping.accountNumber}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDeleteMapping(index)} title="Ta bort">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="avstamning" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <KPICard
                    label="Avstämda"
                    value={stats.reconciled.toString()}
                    trend={stats.reconciled === stats.total ? 'up' : 'neutral'}
                    trendLabel={`av ${stats.total}`}
                  />
                  <KPICard
                    label="Ej avstämda"
                    value={(stats.total - stats.reconciled).toString()}
                    trend={(stats.total - stats.reconciled) > 0 ? 'down' : 'up'}
                  />
                  <KPICard
                    label="Felaktiga"
                    value={stats.errors.toString()}
                    trend={stats.errors > 0 ? 'down' : 'up'}
                    trendLabel={stats.errors > 0 ? 'Kräver åtgärd' : 'Inga fel'}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Klicka på bock-ikonen i betalningslistan för att markera en rad som avstämd.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importera regionersättningar</DialogTitle>
            <DialogDescription>
              Klistra in tabbseparerad data: Datum, Regionkod, Beskrivning, Brutto, Netto (en rad per betalning).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'2024-01-15\tREG-01\tKapiteringsersättning jan\t125000\t125000'}
              className="min-h-[160px] font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleImportPaste} disabled={!importText.trim()}>
              <Upload className="mr-2 h-4 w-4" />
              Importera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Entry Dialog */}
      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manuell betalningsrad</DialogTitle>
            <DialogDescription>Registrera en regionersättning manuellt.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pay-date">Betalningsdatum *</Label>
                <Input id="pay-date" type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pay-code">Regionkod</Label>
                <Input id="pay-code" value={paymentForm.regionCode} onChange={(e) => setPaymentForm((f) => ({ ...f, regionCode: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pay-desc">Beskrivning *</Label>
              <Input id="pay-desc" value={paymentForm.description} onChange={(e) => setPaymentForm((f) => ({ ...f, description: e.target.value }))} placeholder="Kapiteringsersättning" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pay-gross">Brutto (kr) *</Label>
                <Input id="pay-gross" type="number" min={0} value={paymentForm.grossAmount} onChange={(e) => setPaymentForm((f) => ({ ...f, grossAmount: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pay-net">Netto (kr)</Label>
                <Input id="pay-net" type="number" min={0} value={paymentForm.netAmount} onChange={(e) => setPaymentForm((f) => ({ ...f, netAmount: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="pay-acct">Konto</Label>
                <Input id="pay-acct" value={paymentForm.accountNumber} onChange={(e) => setPaymentForm((f) => ({ ...f, accountNumber: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pay-period">Period</Label>
                <Input id="pay-period" value={paymentForm.period} onChange={(e) => setPaymentForm((f) => ({ ...f, period: e.target.value }))} placeholder="2024-01" maxLength={7} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveManual} disabled={!paymentForm.description.trim() || paymentForm.grossAmount <= 0}>
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mapping Dialog */}
      <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ny kontomappning</DialogTitle>
            <DialogDescription>Mappa en regionkod till ett bokföringskonto.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Regionkod *</Label>
              <Input value={mappingForm.regionCode} onChange={(e) => setMappingForm((f) => ({ ...f, regionCode: e.target.value }))} placeholder="REG-05" />
            </div>
            <div className="grid gap-2">
              <Label>Beskrivning *</Label>
              <Input value={mappingForm.description} onChange={(e) => setMappingForm((f) => ({ ...f, description: e.target.value }))} placeholder="Typ av ersättning" />
            </div>
            <div className="grid gap-2">
              <Label>Kontonummer *</Label>
              <Input value={mappingForm.accountNumber} onChange={(e) => setMappingForm((f) => ({ ...f, accountNumber: e.target.value }))} placeholder="3010" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveMapping} disabled={!mappingForm.regionCode.trim() || !mappingForm.accountNumber.trim()}>
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort betalning</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort betalningen{' '}
              <span className="font-semibold">{paymentToDelete?.description}</span>? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeletePayment}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
