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
  ShieldCheck,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ClaimStatus = 'pending' | 'approved' | 'denied' | 'written_off'

interface InsuranceClaim {
  id: string
  patientRef: string
  insurer: string
  claimAmount: number
  approvedAmount: number
  status: ClaimStatus
  submittedDate: string
  resolvedDate: string
  accountNumber: string
  notes: string
}

const INSURERS = ['Folksam', 'Trygg-Hansa', 'If', 'Länsförsäkringar', 'Skandia', 'Euro Accident', 'Övrigt']

const STATUS_LABELS: Record<ClaimStatus, string> = {
  pending: 'Väntande',
  approved: 'Godkänd',
  denied: 'Nekad',
  written_off: 'Avskriven',
}

const STATUS_COLORS: Record<ClaimStatus, string> = {
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  denied: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  written_off: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

const EMPTY_CLAIM_FORM = {
  patientRef: '',
  insurer: 'Folksam',
  claimAmount: 0,
  approvedAmount: 0,
  status: 'pending' as ClaimStatus,
  submittedDate: '',
  resolvedDate: '',
  accountNumber: '1520',
  notes: '',
}

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

export function ForsakringsersattningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [claims, setClaims] = useState<InsuranceClaim[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<ClaimStatus | 'all'>('all')
  const [filterInsurer, setFilterInsurer] = useState<string>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingClaim, setEditingClaim] = useState<InsuranceClaim | null>(null)
  const [claimForm, setClaimForm] = useState(EMPTY_CLAIM_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [claimToDelete, setClaimToDelete] = useState<InsuranceClaim | null>(null)

  const saveClaims = useCallback(async (newClaims: InsuranceClaim[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'claims',
        config_value: newClaims,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchClaims = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'claims')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setClaims(data.config_value as InsuranceClaim[])
    } else {
      setClaims([])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchClaims() }, [fetchClaims])

  const filteredClaims = useMemo(() => {
    let result = claims
    if (filterStatus !== 'all') {
      result = result.filter((c) => c.status === filterStatus)
    }
    if (filterInsurer !== 'all') {
      result = result.filter((c) => c.insurer === filterInsurer)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (c) =>
          c.patientRef.toLowerCase().includes(q) ||
          c.insurer.toLowerCase().includes(q) ||
          c.notes.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.submittedDate.localeCompare(a.submittedDate))
  }, [claims, filterStatus, filterInsurer, searchQuery])

  const stats = useMemo(() => {
    const totalClaimed = claims.reduce((s, c) => s + c.claimAmount, 0)
    const totalApproved = claims.filter((c) => c.status === 'approved').reduce((s, c) => s + c.approvedAmount, 0)
    const totalDenied = claims.filter((c) => c.status === 'denied').reduce((s, c) => s + c.claimAmount, 0)
    const totalPending = claims.filter((c) => c.status === 'pending').reduce((s, c) => s + c.claimAmount, 0)
    const approvalRate = claims.length > 0
      ? (claims.filter((c) => c.status === 'approved').length / claims.filter((c) => c.status !== 'pending').length) * 100
      : 0
    return { totalClaimed, totalApproved, totalDenied, totalPending, approvalRate: isFinite(approvalRate) ? approvalRate : 0 }
  }, [claims])

  function openNewClaim() {
    setEditingClaim(null)
    setClaimForm({ ...EMPTY_CLAIM_FORM, submittedDate: todayStr() })
    setDialogOpen(true)
  }

  function openEditClaim(claim: InsuranceClaim) {
    setEditingClaim(claim)
    setClaimForm({
      patientRef: claim.patientRef,
      insurer: claim.insurer,
      claimAmount: claim.claimAmount,
      approvedAmount: claim.approvedAmount,
      status: claim.status,
      submittedDate: claim.submittedDate,
      resolvedDate: claim.resolvedDate,
      accountNumber: claim.accountNumber,
      notes: claim.notes,
    })
    setDialogOpen(true)
  }

  async function handleSaveClaim() {
    const newClaim: InsuranceClaim = {
      id: editingClaim ? editingClaim.id : generateId(),
      patientRef: claimForm.patientRef.trim(),
      insurer: claimForm.insurer,
      claimAmount: claimForm.claimAmount,
      approvedAmount: claimForm.status === 'approved' ? claimForm.approvedAmount : 0,
      status: claimForm.status,
      submittedDate: claimForm.submittedDate,
      resolvedDate: claimForm.status !== 'pending' ? (claimForm.resolvedDate || todayStr()) : '',
      accountNumber: claimForm.accountNumber,
      notes: claimForm.notes.trim(),
    }

    let updated: InsuranceClaim[]
    if (editingClaim) {
      updated = claims.map((c) => c.id === editingClaim.id ? newClaim : c)
    } else {
      updated = [...claims, newClaim]
    }

    setClaims(updated)
    setDialogOpen(false)
    await saveClaims(updated)
  }

  function openDeleteConfirmation(claim: InsuranceClaim) {
    setClaimToDelete(claim)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteClaim() {
    if (!claimToDelete) return
    const updated = claims.filter((c) => c.id !== claimToDelete.id)
    setClaims(updated)
    setDeleteDialogOpen(false)
    setClaimToDelete(null)
    await saveClaims(updated)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Hälsa & Sjukvård"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewClaim}>
            <Plus className="mr-2 h-4 w-4" />
            Nytt ärende
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
              <KPICard label="Totalt ansökt" value={fmt(stats.totalClaimed)} unit="kr" />
              <KPICard label="Godkänt belopp" value={fmt(stats.totalApproved)} unit="kr" />
              <KPICard label="Nekat belopp" value={fmt(stats.totalDenied)} unit="kr" />
              <KPICard label="Väntande" value={fmt(stats.totalPending)} unit="kr" />
              <KPICard
                label="Godkännandegrad"
                value={stats.approvalRate.toFixed(1)}
                unit="%"
                trend={stats.approvalRate >= 80 ? 'up' : stats.approvalRate >= 50 ? 'neutral' : 'down'}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök patient eller försäkringsbolag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as ClaimStatus | 'all')}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrera status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  <SelectItem value="pending">Väntande</SelectItem>
                  <SelectItem value="approved">Godkänd</SelectItem>
                  <SelectItem value="denied">Nekad</SelectItem>
                  <SelectItem value="written_off">Avskriven</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterInsurer} onValueChange={setFilterInsurer}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Försäkringsbolag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla bolag</SelectItem>
                  {INSURERS.map((ins) => (
                    <SelectItem key={ins} value={ins}>{ins}</SelectItem>
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

            {filteredClaims.length === 0 ? (
              <EmptyModuleState
                icon={ShieldCheck}
                title="Inga försäkringsärenden"
                description={
                  searchQuery || filterStatus !== 'all' || filterInsurer !== 'all'
                    ? 'Inga ärenden matchar dina sökkriterier.'
                    : 'Registrera försäkringsärenden för att spåra ersättningar.'
                }
                actionLabel={!searchQuery && filterStatus === 'all' && filterInsurer === 'all' ? 'Nytt ärende' : undefined}
                onAction={!searchQuery && filterStatus === 'all' && filterInsurer === 'all' ? openNewClaim : undefined}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Patient</TableHead>
                      <TableHead className="font-medium">Bolag</TableHead>
                      <TableHead className="font-medium text-right">Ansökt</TableHead>
                      <TableHead className="font-medium text-right">Godkänt</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClaims.map((claim) => (
                      <TableRow key={claim.id}>
                        <TableCell className="font-medium">{claim.patientRef}</TableCell>
                        <TableCell>{claim.insurer}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{fmt(claim.claimAmount)} kr</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{claim.status === 'approved' ? `${fmt(claim.approvedAmount)} kr` : '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_COLORS[claim.status]}>
                            {STATUS_LABELS[claim.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{claim.submittedDate}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditClaim(claim)} title="Redigera">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(claim)} title="Ta bort">
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingClaim ? 'Redigera ärende' : 'Nytt försäkringsärende'}</DialogTitle>
            <DialogDescription>
              {editingClaim
                ? 'Uppdatera ärendets uppgifter nedan.'
                : 'Registrera ett nytt försäkringsersättningsärende.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="claim-patient">Patientreferens *</Label>
                <Input
                  id="claim-patient"
                  value={claimForm.patientRef}
                  onChange={(e) => setClaimForm((f) => ({ ...f, patientRef: e.target.value }))}
                  placeholder="P-2024-001"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="claim-insurer">Försäkringsbolag *</Label>
                <Select
                  value={claimForm.insurer}
                  onValueChange={(val) => setClaimForm((f) => ({ ...f, insurer: val }))}
                >
                  <SelectTrigger id="claim-insurer">
                    <SelectValue placeholder="Välj bolag" />
                  </SelectTrigger>
                  <SelectContent>
                    {INSURERS.map((ins) => (
                      <SelectItem key={ins} value={ins}>{ins}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="claim-amount">Ansökt belopp (kr) *</Label>
                <Input
                  id="claim-amount"
                  type="number"
                  min={0}
                  value={claimForm.claimAmount}
                  onChange={(e) => setClaimForm((f) => ({ ...f, claimAmount: Number(e.target.value) }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="claim-status">Status *</Label>
                <Select
                  value={claimForm.status}
                  onValueChange={(val) => setClaimForm((f) => ({ ...f, status: val as ClaimStatus }))}
                >
                  <SelectTrigger id="claim-status">
                    <SelectValue placeholder="Välj status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Väntande</SelectItem>
                    <SelectItem value="approved">Godkänd</SelectItem>
                    <SelectItem value="denied">Nekad</SelectItem>
                    <SelectItem value="written_off">Avskriven</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {claimForm.status === 'approved' && (
              <div className="grid gap-2">
                <Label htmlFor="claim-approved">Godkänt belopp (kr)</Label>
                <Input
                  id="claim-approved"
                  type="number"
                  min={0}
                  value={claimForm.approvedAmount}
                  onChange={(e) => setClaimForm((f) => ({ ...f, approvedAmount: Number(e.target.value) }))}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="claim-submitted">Inskickat datum</Label>
                <Input
                  id="claim-submitted"
                  type="date"
                  value={claimForm.submittedDate}
                  onChange={(e) => setClaimForm((f) => ({ ...f, submittedDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="claim-account">Konto</Label>
                <Input
                  id="claim-account"
                  value={claimForm.accountNumber}
                  onChange={(e) => setClaimForm((f) => ({ ...f, accountNumber: e.target.value }))}
                  placeholder="1520"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="claim-notes">Anteckning</Label>
              <Input
                id="claim-notes"
                value={claimForm.notes}
                onChange={(e) => setClaimForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Eventuella noteringar..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveClaim}
              disabled={!claimForm.patientRef.trim() || claimForm.claimAmount <= 0}
            >
              {editingClaim ? 'Uppdatera' : 'Skapa ärende'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort ärende</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort ärendet för{' '}
              <span className="font-semibold">{claimToDelete?.patientRef}</span> ({claimToDelete?.insurer})? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={handleDeleteClaim}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
