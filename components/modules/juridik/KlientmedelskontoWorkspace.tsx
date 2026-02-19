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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Pencil,
  Trash2,
  Loader2,
  Search,
  Landmark,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type FundStatus = 'Aktiv' | 'Avslutad' | 'Spärrad'

interface ClientFund {
  id: string
  clientName: string
  caseRef: string
  account1690: number
  account2890: number
  status: FundStatus
  lastReconciled: string
  note: string
}

const FUND_STATUSES: FundStatus[] = ['Aktiv', 'Avslutad', 'Spärrad']

const STATUS_COLORS: Record<FundStatus, string> = {
  'Aktiv': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Avslutad': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  'Spärrad': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const EMPTY_FUND_FORM = {
  clientName: '',
  caseRef: '',
  account1690: 0,
  account2890: 0,
  status: 'Aktiv' as FundStatus,
  note: '',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function KlientmedelskontoWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [funds, setFunds] = useState<ClientFund[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<FundStatus | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingFund, setEditingFund] = useState<ClientFund | null>(null)
  const [fundForm, setFundForm] = useState(EMPTY_FUND_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fundToDelete, setFundToDelete] = useState<ClientFund | null>(null)

  const saveFunds = useCallback(async (newFunds: ClientFund[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'client_funds',
        config_value: newFunds,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchFunds = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'client_funds')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setFunds(data.config_value as ClientFund[])
    } else {
      setFunds([])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchFunds() }, [fetchFunds])

  const filteredFunds = useMemo(() => {
    let result = funds
    if (filterStatus !== 'all') {
      result = result.filter((f) => f.status === filterStatus)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (f) =>
          f.clientName.toLowerCase().includes(q) ||
          f.caseRef.toLowerCase().includes(q)
      )
    }
    return result
  }, [funds, filterStatus, searchQuery])

  const summary = useMemo(() => {
    const activeFunds = funds.filter((f) => f.status === 'Aktiv')
    const total1690 = activeFunds.reduce((s, f) => s + f.account1690, 0)
    const total2890 = activeFunds.reduce((s, f) => s + f.account2890, 0)
    const diff = total1690 - total2890
    const unreconciled = activeFunds.filter((f) => {
      if (!f.lastReconciled) return true
      const d = new Date(f.lastReconciled)
      const now = new Date()
      const daysDiff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
      return daysDiff > 30
    }).length
    return { total1690, total2890, diff, activeFunds: activeFunds.length, unreconciled }
  }, [funds])

  function openNewFund() {
    setEditingFund(null)
    setFundForm({ ...EMPTY_FUND_FORM })
    setDialogOpen(true)
  }

  function openEditFund(fund: ClientFund) {
    setEditingFund(fund)
    setFundForm({
      clientName: fund.clientName,
      caseRef: fund.caseRef,
      account1690: fund.account1690,
      account2890: fund.account2890,
      status: fund.status,
      note: fund.note,
    })
    setDialogOpen(true)
  }

  async function handleSaveFund() {
    const today = new Date().toISOString().slice(0, 10)

    let updated: ClientFund[]
    if (editingFund) {
      updated = funds.map((f) =>
        f.id === editingFund.id
          ? {
              ...f,
              clientName: fundForm.clientName.trim(),
              caseRef: fundForm.caseRef.trim(),
              account1690: fundForm.account1690,
              account2890: fundForm.account2890,
              status: fundForm.status,
              note: fundForm.note.trim(),
            }
          : f
      )
    } else {
      const newFund: ClientFund = {
        id: generateId(),
        clientName: fundForm.clientName.trim(),
        caseRef: fundForm.caseRef.trim(),
        account1690: fundForm.account1690,
        account2890: fundForm.account2890,
        status: fundForm.status,
        lastReconciled: today,
        note: fundForm.note.trim(),
      }
      updated = [...funds, newFund]
    }

    setFunds(updated)
    setDialogOpen(false)
    await saveFunds(updated)
  }

  async function handleReconcile(fund: ClientFund) {
    const today = new Date().toISOString().slice(0, 10)
    const updated = funds.map((f) =>
      f.id === fund.id ? { ...f, lastReconciled: today } : f
    )
    setFunds(updated)
    await saveFunds(updated)
  }

  function openDeleteConfirmation(fund: ClientFund) {
    setFundToDelete(fund)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteFund() {
    if (!fundToDelete) return
    const updated = funds.filter((f) => f.id !== fundToDelete.id)
    setFunds(updated)
    setDeleteDialogOpen(false)
    setFundToDelete(null)
    await saveFunds(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Juridik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewFund}>
            <Plus className="mr-2 h-4 w-4" />
            Ny klientmedelspost
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="klientlista">Klientlista</TabsTrigger>
            <TabsTrigger value="avstamning">Avstamning</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <KPICard label="Konto 1690 (Ford.)" value={fmt(summary.total1690)} unit="kr" />
                <KPICard label="Konto 2890 (Skuld)" value={fmt(summary.total2890)} unit="kr" />
                <KPICard
                  label="Differens"
                  value={fmt(summary.diff)}
                  unit="kr"
                  trend={summary.diff === 0 ? 'neutral' : 'down'}
                  trendLabel={summary.diff === 0 ? 'Balanserar' : 'Obalans'}
                />
                <KPICard label="Aktiva klienter" value={String(summary.activeFunds)} />
                <KPICard
                  label="Ej avstämda (>30d)"
                  value={String(summary.unreconciled)}
                  trend={summary.unreconciled > 0 ? 'down' : 'up'}
                  trendLabel={summary.unreconciled > 0 ? 'Kräver åtgärd' : 'OK'}
                />
              </div>
            )}
          </TabsContent>

          {/* Client list */}
          <TabsContent value="klientlista" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök klient eller ärende..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select
                    value={filterStatus}
                    onValueChange={(val) => setFilterStatus(val as FundStatus | 'all')}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrera status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      {FUND_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
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

                {filteredFunds.length === 0 ? (
                  <EmptyModuleState
                    icon={Landmark}
                    title="Inga klientmedel"
                    description="Lägg till klientmedel för att börja hantera klientmedelsredovisningen."
                    actionLabel="Ny klientmedelspost"
                    onAction={openNewFund}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Klient</TableHead>
                          <TableHead className="font-medium">Ärende</TableHead>
                          <TableHead className="font-medium text-right">1690 (kr)</TableHead>
                          <TableHead className="font-medium text-right">2890 (kr)</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium">Senast avstämd</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredFunds.map((fund) => (
                          <TableRow key={fund.id}>
                            <TableCell className="font-medium">{fund.clientName}</TableCell>
                            <TableCell className="font-mono text-sm">{fund.caseRef}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(fund.account1690)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(fund.account2890)}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={STATUS_COLORS[fund.status]}>
                                {fund.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{fund.lastReconciled || '-'}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditFund(fund)}
                                  title="Redigera"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => openDeleteConfirmation(fund)}
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
              </>
            )}
          </TabsContent>

          {/* Reconciliation */}
          <TabsContent value="avstamning" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Disciplinnämndsregler</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>Klientmedel ska hållas avskilda från byråns egna medel (konto 1690/2890).</p>
                    <p>Månatlig avstämning krävs enligt Advokatsamfundets regler.</p>
                    <p>Differens mellan 1690 och 2890 ska alltid vara noll.</p>
                  </CardContent>
                </Card>

                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Klient</TableHead>
                        <TableHead className="font-medium text-right">Differens (kr)</TableHead>
                        <TableHead className="font-medium">Senast avstämd</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                        <TableHead className="font-medium text-right">Åtgärd</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {funds.filter((f) => f.status === 'Aktiv').map((fund) => {
                        const diff = fund.account1690 - fund.account2890
                        const daysAgo = fund.lastReconciled
                          ? Math.floor((new Date().getTime() - new Date(fund.lastReconciled).getTime()) / (1000 * 60 * 60 * 24))
                          : 999
                        const needsReconciliation = daysAgo > 30

                        return (
                          <TableRow key={fund.id}>
                            <TableCell className="font-medium">{fund.clientName}</TableCell>
                            <TableCell className={cn('text-right tabular-nums font-medium', diff !== 0 && 'text-red-600')}>
                              {fmt(diff)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {fund.lastReconciled || 'Aldrig'}
                              {needsReconciliation && (
                                <span className="ml-2 text-amber-600 text-xs">({daysAgo}d sedan)</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {diff === 0 && !needsReconciliation ? (
                                <div className="flex items-center gap-1.5 text-emerald-600 text-sm">
                                  <CheckCircle className="h-4 w-4" />
                                  OK
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-amber-600 text-sm">
                                  <AlertTriangle className="h-4 w-4" />
                                  {diff !== 0 ? 'Obalans' : 'Förfallen'}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReconcile(fund)}
                              >
                                Markera avstämd
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Add/Edit Fund Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingFund ? 'Redigera klientmedel' : 'Ny klientmedelspost'}</DialogTitle>
            <DialogDescription>
              {editingFund
                ? 'Uppdatera klientmedelsuppgifterna nedan.'
                : 'Registrera en ny klientmedelspost.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="fund-client">Klientnamn *</Label>
                <Input
                  id="fund-client"
                  value={fundForm.clientName}
                  onChange={(e) => setFundForm((f) => ({ ...f, clientName: e.target.value }))}
                  placeholder="Klient AB"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fund-case">Ärendereferens *</Label>
                <Input
                  id="fund-case"
                  value={fundForm.caseRef}
                  onChange={(e) => setFundForm((f) => ({ ...f, caseRef: e.target.value }))}
                  placeholder="2024-001"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="fund-1690">Konto 1690 (kr)</Label>
                <Input
                  id="fund-1690"
                  type="number"
                  value={fundForm.account1690}
                  onChange={(e) => setFundForm((f) => ({ ...f, account1690: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fund-2890">Konto 2890 (kr)</Label>
                <Input
                  id="fund-2890"
                  type="number"
                  value={fundForm.account2890}
                  onChange={(e) => setFundForm((f) => ({ ...f, account2890: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fund-status">Status</Label>
              <Select
                value={fundForm.status}
                onValueChange={(val) => setFundForm((f) => ({ ...f, status: val as FundStatus }))}
              >
                <SelectTrigger id="fund-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUND_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fund-note">Anteckning</Label>
              <Input
                id="fund-note"
                value={fundForm.note}
                onChange={(e) => setFundForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Frivillig anteckning..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveFund}
              disabled={!fundForm.clientName.trim() || !fundForm.caseRef.trim()}
            >
              {editingFund ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort klientmedel</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort klientmedel för{' '}
              <span className="font-semibold">{fundToDelete?.clientName}</span>?
              Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={handleDeleteFund}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
