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
  Upload,
  FileText,
  CheckCircle,
  XCircle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type DecisionStatus = 'pending' | 'approved' | 'denied'
type BookingStatus = 'unbooked' | 'booked' | 'written_off'

interface InsuranceDecision {
  id: string
  importDate: string
  decisionDate: string
  insurer: string
  patientRef: string
  caseRef: string
  claimedAmount: number
  approvedAmount: number
  decisionStatus: DecisionStatus
  bookingStatus: BookingStatus
  revenueAccount: string
  receivableAccount: string
  writeOffAccount: string
  notes: string
}

const INSURERS = ['Folksam', 'Trygg-Hansa', 'If', 'Länsförsäkringar', 'Skandia', 'Euro Accident', 'Övrigt']

const DECISION_LABELS: Record<DecisionStatus, string> = {
  pending: 'Väntande',
  approved: 'Godkänd',
  denied: 'Nekad',
}

const DECISION_COLORS: Record<DecisionStatus, string> = {
  pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  denied: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const BOOKING_LABELS: Record<BookingStatus, string> = {
  unbooked: 'Ej bokförd',
  booked: 'Bokförd',
  written_off: 'Avskriven',
}

const BOOKING_COLORS: Record<BookingStatus, string> = {
  unbooked: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  booked: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  written_off: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
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

export function ForsakringsrapportImportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [decisions, setDecisions] = useState<InsuranceDecision[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterDecision, setFilterDecision] = useState<DecisionStatus | 'all'>('all')
  const [filterBooking, setFilterBooking] = useState<BookingStatus | 'all'>('all')

  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importText, setImportText] = useState('')

  const [manualDialogOpen, setManualDialogOpen] = useState(false)
  const [decisionForm, setDecisionForm] = useState({
    decisionDate: todayStr(),
    insurer: 'Folksam',
    patientRef: '',
    caseRef: '',
    claimedAmount: 0,
    approvedAmount: 0,
    decisionStatus: 'approved' as DecisionStatus,
    revenueAccount: '3030',
    receivableAccount: '1520',
    writeOffAccount: '6350',
    notes: '',
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [decisionToDelete, setDecisionToDelete] = useState<InsuranceDecision | null>(null)

  const saveDecisions = useCallback(async (newDecisions: InsuranceDecision[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'insurance_decisions',
        config_value: newDecisions,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchDecisions = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'insurance_decisions')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setDecisions(data.config_value as InsuranceDecision[])
    } else {
      setDecisions([])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchDecisions() }, [fetchDecisions])

  const filteredDecisions = useMemo(() => {
    let result = decisions
    if (filterDecision !== 'all') {
      result = result.filter((d) => d.decisionStatus === filterDecision)
    }
    if (filterBooking !== 'all') {
      result = result.filter((d) => d.bookingStatus === filterBooking)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (d) =>
          d.patientRef.toLowerCase().includes(q) ||
          d.caseRef.toLowerCase().includes(q) ||
          d.insurer.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.decisionDate.localeCompare(a.decisionDate))
  }, [decisions, filterDecision, filterBooking, searchQuery])

  const stats = useMemo(() => {
    const totalClaimed = decisions.reduce((s, d) => s + d.claimedAmount, 0)
    const totalApproved = decisions.filter((d) => d.decisionStatus === 'approved').reduce((s, d) => s + d.approvedAmount, 0)
    const totalDenied = decisions.filter((d) => d.decisionStatus === 'denied').reduce((s, d) => s + d.claimedAmount, 0)
    const unbooked = decisions.filter((d) => d.bookingStatus === 'unbooked').length
    const booked = decisions.filter((d) => d.bookingStatus === 'booked').length
    return { totalClaimed, totalApproved, totalDenied, unbooked, booked, total: decisions.length }
  }, [decisions])

  function handleImportPaste() {
    const lines = importText.trim().split('\n').filter((l) => l.trim())
    const newDecisions: InsuranceDecision[] = lines.map((line) => {
      const parts = line.split('\t')
      const status = (parts[4] || '').trim().toLowerCase()
      const decisionStatus: DecisionStatus = status === 'godkänd' || status === 'approved' ? 'approved' : status === 'nekad' || status === 'denied' ? 'denied' : 'pending'
      const claimed = parseFloat(parts[3] || '0') || 0
      const approved = decisionStatus === 'approved' ? (parseFloat(parts[5] || parts[3] || '0') || 0) : 0

      return {
        id: generateId(),
        importDate: todayStr(),
        decisionDate: (parts[0] || todayStr()).trim(),
        insurer: (parts[1] || '').trim(),
        patientRef: (parts[2] || '').trim(),
        caseRef: `FK-${generateId()}`,
        claimedAmount: claimed,
        approvedAmount: approved,
        decisionStatus,
        bookingStatus: 'unbooked' as BookingStatus,
        revenueAccount: '3030',
        receivableAccount: '1520',
        writeOffAccount: '6350',
        notes: '',
      }
    })

    const updated = [...decisions, ...newDecisions]
    setDecisions(updated)
    setImportDialogOpen(false)
    setImportText('')
    saveDecisions(updated)
  }

  function openManualEntry() {
    setDecisionForm({
      decisionDate: todayStr(),
      insurer: 'Folksam',
      patientRef: '',
      caseRef: '',
      claimedAmount: 0,
      approvedAmount: 0,
      decisionStatus: 'approved',
      revenueAccount: '3030',
      receivableAccount: '1520',
      writeOffAccount: '6350',
      notes: '',
    })
    setManualDialogOpen(true)
  }

  async function handleSaveManual() {
    const newDecision: InsuranceDecision = {
      id: generateId(),
      importDate: todayStr(),
      decisionDate: decisionForm.decisionDate,
      insurer: decisionForm.insurer,
      patientRef: decisionForm.patientRef.trim(),
      caseRef: decisionForm.caseRef.trim() || `FK-${generateId()}`,
      claimedAmount: decisionForm.claimedAmount,
      approvedAmount: decisionForm.decisionStatus === 'approved' ? decisionForm.approvedAmount : 0,
      decisionStatus: decisionForm.decisionStatus,
      bookingStatus: 'unbooked',
      revenueAccount: decisionForm.revenueAccount,
      receivableAccount: decisionForm.receivableAccount,
      writeOffAccount: decisionForm.writeOffAccount,
      notes: decisionForm.notes.trim(),
    }

    const updated = [...decisions, newDecision]
    setDecisions(updated)
    setManualDialogOpen(false)
    await saveDecisions(updated)
  }

  async function handleAutoBook(decision: InsuranceDecision) {
    let newBookingStatus: BookingStatus
    if (decision.decisionStatus === 'approved') {
      newBookingStatus = 'booked'
    } else if (decision.decisionStatus === 'denied') {
      newBookingStatus = 'written_off'
    } else {
      return
    }

    const updated = decisions.map((d) =>
      d.id === decision.id ? { ...d, bookingStatus: newBookingStatus } : d
    )
    setDecisions(updated)
    await saveDecisions(updated)
  }

  async function handleAutoBookAll() {
    const updated = decisions.map((d) => {
      if (d.bookingStatus !== 'unbooked') return d
      if (d.decisionStatus === 'approved') return { ...d, bookingStatus: 'booked' as BookingStatus }
      if (d.decisionStatus === 'denied') return { ...d, bookingStatus: 'written_off' as BookingStatus }
      return d
    })
    setDecisions(updated)
    await saveDecisions(updated)
  }

  function openDeleteConfirmation(decision: InsuranceDecision) {
    setDecisionToDelete(decision)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteDecision() {
    if (!decisionToDelete) return
    const updated = decisions.filter((d) => d.id !== decisionToDelete.id)
    setDecisions(updated)
    setDeleteDialogOpen(false)
    setDecisionToDelete(null)
    await saveDecisions(updated)
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
              Importera beslut
            </Button>
            <Button onClick={openManualEntry}>
              <Plus className="mr-2 h-4 w-4" />
              Manuellt beslut
            </Button>
          </div>
        }
      >
        <Tabs defaultValue="beslut" className="space-y-6">
          <TabsList>
            <TabsTrigger value="beslut">Beslut</TabsTrigger>
            <TabsTrigger value="bokforing">Autobokföring</TabsTrigger>
          </TabsList>

          <TabsContent value="beslut" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <KPICard label="Totalt ansökt" value={fmt(stats.totalClaimed)} unit="kr" />
                  <KPICard label="Godkänt" value={fmt(stats.totalApproved)} unit="kr" />
                  <KPICard label="Nekat" value={fmt(stats.totalDenied)} unit="kr" />
                  <KPICard label="Ej bokförda" value={stats.unbooked.toString()} trend={stats.unbooked > 0 ? 'down' : 'up'} />
                  <KPICard label="Bokförda" value={stats.booked.toString()} />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök patient, ärende, bolag..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterDecision} onValueChange={(val) => setFilterDecision(val as DecisionStatus | 'all')}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Beslut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla beslut</SelectItem>
                      <SelectItem value="approved">Godkänd</SelectItem>
                      <SelectItem value="denied">Nekad</SelectItem>
                      <SelectItem value="pending">Väntande</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterBooking} onValueChange={(val) => setFilterBooking(val as BookingStatus | 'all')}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Bokföring" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All bokföring</SelectItem>
                      <SelectItem value="unbooked">Ej bokförd</SelectItem>
                      <SelectItem value="booked">Bokförd</SelectItem>
                      <SelectItem value="written_off">Avskriven</SelectItem>
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredDecisions.length === 0 ? (
                  <EmptyModuleState
                    icon={FileText}
                    title="Inga försäkringsbeslut"
                    description="Importera eller registrera försäkringsbeslut för att komma igång."
                    actionLabel="Importera beslut"
                    onAction={() => setImportDialogOpen(true)}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium">Bolag</TableHead>
                          <TableHead className="font-medium">Patient</TableHead>
                          <TableHead className="font-medium text-right">Ansökt</TableHead>
                          <TableHead className="font-medium text-right">Godkänt</TableHead>
                          <TableHead className="font-medium">Beslut</TableHead>
                          <TableHead className="font-medium">Bokföring</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDecisions.map((decision) => (
                          <TableRow key={decision.id}>
                            <TableCell className="text-sm">{decision.decisionDate}</TableCell>
                            <TableCell>{decision.insurer}</TableCell>
                            <TableCell className="font-medium">{decision.patientRef}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{fmt(decision.claimedAmount)} kr</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{decision.decisionStatus === 'approved' ? `${fmt(decision.approvedAmount)} kr` : '-'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={DECISION_COLORS[decision.decisionStatus]}>
                                {DECISION_LABELS[decision.decisionStatus]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={BOOKING_COLORS[decision.bookingStatus]}>
                                {BOOKING_LABELS[decision.bookingStatus]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {decision.bookingStatus === 'unbooked' && decision.decisionStatus !== 'pending' && (
                                  <Button variant="ghost" size="icon" onClick={() => handleAutoBook(decision)} title="Autobokför">
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(decision)} title="Ta bort">
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
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-4">
              <h3 className="text-sm font-semibold">Automatisk bokföring</h3>
              <p className="text-sm text-muted-foreground">
                Bokför alla ej bokförda beslut automatiskt. Godkända ärenden bokförs som intäkt, nekade ärenden skrivs av.
              </p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>Godkänt: Debet 1520 (fordran) / Kredit 3030 (intäkt)</p>
                <p>Nekat: Debet 6350 (avskrivning) / Kredit 1520 (fordran)</p>
              </div>
              <Button onClick={handleAutoBookAll} disabled={saving || stats.unbooked === 0}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Bokför alla ({stats.unbooked} ej bokförda)
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importera försäkringsbeslut</DialogTitle>
            <DialogDescription>
              Klistra in tabbseparerad data: Datum, Bolag, Patient, Ansökt belopp, Status, Godkänt belopp.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'2024-01-15\tFolksam\tP-001\t15000\tGodkänd\t15000'}
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
            <DialogTitle>Manuellt försäkringsbeslut</DialogTitle>
            <DialogDescription>Registrera ett försäkringsbeslut manuellt.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dec-date">Beslutsdatum *</Label>
                <Input id="dec-date" type="date" value={decisionForm.decisionDate} onChange={(e) => setDecisionForm((f) => ({ ...f, decisionDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dec-insurer">Försäkringsbolag *</Label>
                <Select value={decisionForm.insurer} onValueChange={(val) => setDecisionForm((f) => ({ ...f, insurer: val }))}>
                  <SelectTrigger id="dec-insurer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INSURERS.map((ins) => <SelectItem key={ins} value={ins}>{ins}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dec-patient">Patientreferens *</Label>
                <Input id="dec-patient" value={decisionForm.patientRef} onChange={(e) => setDecisionForm((f) => ({ ...f, patientRef: e.target.value }))} placeholder="P-001" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dec-case">Ärendenummer</Label>
                <Input id="dec-case" value={decisionForm.caseRef} onChange={(e) => setDecisionForm((f) => ({ ...f, caseRef: e.target.value }))} placeholder="FK-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dec-claimed">Ansökt belopp (kr) *</Label>
                <Input id="dec-claimed" type="number" min={0} value={decisionForm.claimedAmount} onChange={(e) => setDecisionForm((f) => ({ ...f, claimedAmount: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dec-status">Beslut *</Label>
                <Select value={decisionForm.decisionStatus} onValueChange={(val) => setDecisionForm((f) => ({ ...f, decisionStatus: val as DecisionStatus }))}>
                  <SelectTrigger id="dec-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Godkänd</SelectItem>
                    <SelectItem value="denied">Nekad</SelectItem>
                    <SelectItem value="pending">Väntande</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {decisionForm.decisionStatus === 'approved' && (
              <div className="grid gap-2">
                <Label htmlFor="dec-approved">Godkänt belopp (kr)</Label>
                <Input id="dec-approved" type="number" min={0} value={decisionForm.approvedAmount} onChange={(e) => setDecisionForm((f) => ({ ...f, approvedAmount: Number(e.target.value) }))} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="dec-notes">Anteckning</Label>
              <Input id="dec-notes" value={decisionForm.notes} onChange={(e) => setDecisionForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Eventuella noteringar..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveManual} disabled={!decisionForm.patientRef.trim() || decisionForm.claimedAmount <= 0}>
              Spara beslut
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort beslut</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort beslutet för{' '}
              <span className="font-semibold">{decisionToDelete?.patientRef}</span>? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteDecision}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
