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
import { Textarea } from '@/components/ui/textarea'
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
  Send,
  ArrowRightLeft,
  Clock,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type ReferralStatus = 'draft' | 'sent' | 'received_by_recipient' | 'response_received' | 'completed' | 'expired'
type ReferralDirection = 'outgoing' | 'incoming'
type ReferralPriority = 'normal' | 'skyndsam' | 'akut'

interface Referral {
  id: string
  direction: ReferralDirection
  patientRef: string
  patientName: string
  fromClinic: string
  toClinic: string
  specialty: string
  priority: ReferralPriority
  status: ReferralStatus
  sentDate: string
  responseDate: string
  reasonForReferral: string
  responseContent: string
  diagnosisCode: string
  practitioner: string
  notes: string
}

const REFERRAL_STATUSES: ReferralStatus[] = ['draft', 'sent', 'received_by_recipient', 'response_received', 'completed', 'expired']

const STATUS_LABELS: Record<ReferralStatus, string> = {
  draft: 'Utkast',
  sent: 'Skickad',
  received_by_recipient: 'Mottagen',
  response_received: 'Svar mottaget',
  completed: 'Avslutad',
  expired: 'Utgången',
}

const STATUS_COLORS: Record<ReferralStatus, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  received_by_recipient: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  response_received: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const PRIORITY_COLORS: Record<ReferralPriority, string> = {
  normal: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  skyndsam: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  akut: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const SPECIALTIES = ['Allmänmedicin', 'Ortopedi', 'Kardiologi', 'Dermatologi', 'Neurologi', 'Psykiatri', 'Onkologi', 'Urologi', 'Gynekologi', 'Ögon', 'ÖNH', 'Röntgen', 'Övrigt']

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function RemisshanteringWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [referrals, setReferrals] = useState<Referral[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<ReferralStatus | 'all'>('all')
  const [filterDirection, setFilterDirection] = useState<ReferralDirection | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingReferral, setEditingReferral] = useState<Referral | null>(null)
  const [referralForm, setReferralForm] = useState({
    direction: 'outgoing' as ReferralDirection,
    patientRef: '',
    patientName: '',
    fromClinic: '',
    toClinic: '',
    specialty: 'Allmänmedicin',
    priority: 'normal' as ReferralPriority,
    status: 'draft' as ReferralStatus,
    sentDate: todayStr(),
    responseDate: '',
    reasonForReferral: '',
    responseContent: '',
    diagnosisCode: '',
    practitioner: '',
    notes: '',
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [referralToDelete, setReferralToDelete] = useState<Referral | null>(null)

  const saveReferrals = useCallback(async (newReferrals: Referral[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'referrals',
        config_value: newReferrals,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchReferrals = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'referrals')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value)) {
      setReferrals(data.config_value as Referral[])
    } else {
      setReferrals([])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchReferrals() }, [fetchReferrals])

  const filteredReferrals = useMemo(() => {
    let result = referrals
    if (filterStatus !== 'all') {
      result = result.filter((r) => r.status === filterStatus)
    }
    if (filterDirection !== 'all') {
      result = result.filter((r) => r.direction === filterDirection)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (r) =>
          r.patientName.toLowerCase().includes(q) ||
          r.patientRef.toLowerCase().includes(q) ||
          r.toClinic.toLowerCase().includes(q) ||
          r.fromClinic.toLowerCase().includes(q) ||
          r.specialty.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.sentDate.localeCompare(a.sentDate))
  }, [referrals, filterStatus, filterDirection, searchQuery])

  const stats = useMemo(() => {
    const outgoing = referrals.filter((r) => r.direction === 'outgoing')
    const incoming = referrals.filter((r) => r.direction === 'incoming')
    const awaitingResponse = referrals.filter((r) => r.status === 'sent' || r.status === 'received_by_recipient').length
    const completed = referrals.filter((r) => r.status === 'completed').length
    const expired = referrals.filter((r) => r.status === 'expired').length

    const withResponse = referrals.filter((r) => r.responseDate && r.sentDate)
    const avgDays = withResponse.length > 0
      ? withResponse.reduce((sum, r) => {
          const sent = new Date(r.sentDate).getTime()
          const resp = new Date(r.responseDate).getTime()
          return sum + ((resp - sent) / (1000 * 60 * 60 * 24))
        }, 0) / withResponse.length
      : 0

    return {
      total: referrals.length,
      outgoing: outgoing.length,
      incoming: incoming.length,
      awaitingResponse,
      completed,
      expired,
      avgResponseDays: Math.round(avgDays),
    }
  }, [referrals])

  function openNewReferral() {
    setEditingReferral(null)
    setReferralForm({
      direction: 'outgoing',
      patientRef: '',
      patientName: '',
      fromClinic: '',
      toClinic: '',
      specialty: 'Allmänmedicin',
      priority: 'normal',
      status: 'draft',
      sentDate: todayStr(),
      responseDate: '',
      reasonForReferral: '',
      responseContent: '',
      diagnosisCode: '',
      practitioner: '',
      notes: '',
    })
    setDialogOpen(true)
  }

  function openEditReferral(referral: Referral) {
    setEditingReferral(referral)
    setReferralForm({
      direction: referral.direction,
      patientRef: referral.patientRef,
      patientName: referral.patientName,
      fromClinic: referral.fromClinic,
      toClinic: referral.toClinic,
      specialty: referral.specialty,
      priority: referral.priority,
      status: referral.status,
      sentDate: referral.sentDate,
      responseDate: referral.responseDate,
      reasonForReferral: referral.reasonForReferral,
      responseContent: referral.responseContent,
      diagnosisCode: referral.diagnosisCode,
      practitioner: referral.practitioner,
      notes: referral.notes,
    })
    setDialogOpen(true)
  }

  async function handleSaveReferral() {
    const newReferral: Referral = {
      id: editingReferral ? editingReferral.id : generateId(),
      direction: referralForm.direction,
      patientRef: referralForm.patientRef.trim(),
      patientName: referralForm.patientName.trim(),
      fromClinic: referralForm.fromClinic.trim(),
      toClinic: referralForm.toClinic.trim(),
      specialty: referralForm.specialty,
      priority: referralForm.priority,
      status: referralForm.status,
      sentDate: referralForm.sentDate,
      responseDate: referralForm.responseDate,
      reasonForReferral: referralForm.reasonForReferral.trim(),
      responseContent: referralForm.responseContent.trim(),
      diagnosisCode: referralForm.diagnosisCode.trim(),
      practitioner: referralForm.practitioner.trim(),
      notes: referralForm.notes.trim(),
    }

    let updated: Referral[]
    if (editingReferral) {
      updated = referrals.map((r) => r.id === editingReferral.id ? newReferral : r)
    } else {
      updated = [...referrals, newReferral]
    }

    setReferrals(updated)
    setDialogOpen(false)
    await saveReferrals(updated)
  }

  function openDeleteConfirmation(referral: Referral) {
    setReferralToDelete(referral)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteReferral() {
    if (!referralToDelete) return
    const updated = referrals.filter((r) => r.id !== referralToDelete.id)
    setReferrals(updated)
    setDeleteDialogOpen(false)
    setReferralToDelete(null)
    await saveReferrals(updated)
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
          <Button onClick={openNewReferral}>
            <Plus className="mr-2 h-4 w-4" />
            Ny remiss
          </Button>
        }
      >
        <Tabs defaultValue="remisser" className="space-y-6">
          <TabsList>
            <TabsTrigger value="remisser">Remisser</TabsTrigger>
            <TabsTrigger value="uppfoljning">Uppföljning</TabsTrigger>
          </TabsList>

          <TabsContent value="remisser" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <KPICard label="Totalt remisser" value={stats.total.toString()} />
                  <KPICard label="Väntar på svar" value={stats.awaitingResponse.toString()} trend={stats.awaitingResponse > 5 ? 'down' : 'neutral'} />
                  <KPICard label="Avslutade" value={stats.completed.toString()} />
                  <KPICard label="Snitt svarstid" value={stats.avgResponseDays.toString()} unit="dagar" />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök patient, klinik, specialitet..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val as ReferralStatus | 'all')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filtrera status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      {REFERRAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filterDirection} onValueChange={(val) => setFilterDirection(val as ReferralDirection | 'all')}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Riktning" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla</SelectItem>
                      <SelectItem value="outgoing">Utgående</SelectItem>
                      <SelectItem value="incoming">Inkommande</SelectItem>
                    </SelectContent>
                  </Select>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredReferrals.length === 0 ? (
                  <EmptyModuleState
                    icon={Send}
                    title="Inga remisser"
                    description={
                      searchQuery || filterStatus !== 'all' || filterDirection !== 'all'
                        ? 'Inga remisser matchar dina sökkriterier.'
                        : 'Skapa en remiss för att komma igång.'
                    }
                    actionLabel={!searchQuery && filterStatus === 'all' ? 'Ny remiss' : undefined}
                    onAction={!searchQuery && filterStatus === 'all' ? openNewReferral : undefined}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Riktning</TableHead>
                          <TableHead className="font-medium">Patient</TableHead>
                          <TableHead className="font-medium">Från / Till</TableHead>
                          <TableHead className="font-medium">Specialitet</TableHead>
                          <TableHead className="font-medium">Prioritet</TableHead>
                          <TableHead className="font-medium">Status</TableHead>
                          <TableHead className="font-medium">Datum</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredReferrals.map((referral) => (
                          <TableRow key={referral.id}>
                            <TableCell>
                              <Badge variant="outline">
                                {referral.direction === 'outgoing' ? 'Utgående' : 'Inkommande'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div>
                                <span className="font-medium">{referral.patientName}</span>
                                <span className="text-xs text-muted-foreground ml-2">{referral.patientRef}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-1">
                                <span className="truncate max-w-[80px]">{referral.fromClinic}</span>
                                <ArrowRightLeft className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span className="truncate max-w-[80px]">{referral.toClinic}</span>
                              </div>
                            </TableCell>
                            <TableCell>{referral.specialty}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={PRIORITY_COLORS[referral.priority]}>
                                {referral.priority.charAt(0).toUpperCase() + referral.priority.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={STATUS_COLORS[referral.status]}>
                                {STATUS_LABELS[referral.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{referral.sentDate}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditReferral(referral)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(referral)} title="Ta bort">
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

          <TabsContent value="uppfoljning" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <KPICard
                label="Väntar på svar"
                value={stats.awaitingResponse.toString()}
                trend={stats.awaitingResponse > 0 ? 'neutral' : 'up'}
                trendLabel={stats.awaitingResponse > 0 ? 'Kräver bevakning' : 'Alla besvarade'}
              />
              <KPICard label="Utgångna" value={stats.expired.toString()} trend={stats.expired > 0 ? 'down' : 'up'} />
              <KPICard label="Snitt svarstid" value={stats.avgResponseDays.toString()} unit="dagar" />
            </div>

            {referrals.filter((r) => r.status === 'sent' || r.status === 'received_by_recipient').length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 border-b border-border">
                  <h3 className="text-sm font-semibold">Remisser som väntar på svar</h3>
                </div>
                <div className="divide-y divide-border">
                  {referrals
                    .filter((r) => r.status === 'sent' || r.status === 'received_by_recipient')
                    .sort((a, b) => a.sentDate.localeCompare(b.sentDate))
                    .map((r) => {
                      const daysSinceSent = Math.round((Date.now() - new Date(r.sentDate).getTime()) / (1000 * 60 * 60 * 24))
                      return (
                        <div key={r.id} className="flex items-center gap-4 px-4 py-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{r.patientName} - {r.specialty}</p>
                            <p className="text-xs text-muted-foreground">Till: {r.toClinic} | Skickad: {r.sentDate}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {daysSinceSent > 30 ? (
                              <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                {daysSinceSent} dagar
                              </Badge>
                            ) : daysSinceSent > 14 ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                <Clock className="mr-1 h-3 w-3" />
                                {daysSinceSent} dagar
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                <Clock className="mr-1 h-3 w-3" />
                                {daysSinceSent} dagar
                              </Badge>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingReferral ? 'Redigera remiss' : 'Ny remiss'}</DialogTitle>
            <DialogDescription>
              {editingReferral ? 'Uppdatera remissens uppgifter.' : 'Skapa en ny remiss.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Riktning *</Label>
                <Select value={referralForm.direction} onValueChange={(val) => setReferralForm((f) => ({ ...f, direction: val as ReferralDirection }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="outgoing">Utgående</SelectItem>
                    <SelectItem value="incoming">Inkommande</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Prioritet *</Label>
                <Select value={referralForm.priority} onValueChange={(val) => setReferralForm((f) => ({ ...f, priority: val as ReferralPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="skyndsam">Skyndsam</SelectItem>
                    <SelectItem value="akut">Akut</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Patientnamn *</Label>
                <Input value={referralForm.patientName} onChange={(e) => setReferralForm((f) => ({ ...f, patientName: e.target.value }))} placeholder="Anna Andersson" />
              </div>
              <div className="grid gap-2">
                <Label>Patientreferens</Label>
                <Input value={referralForm.patientRef} onChange={(e) => setReferralForm((f) => ({ ...f, patientRef: e.target.value }))} placeholder="P-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Från klinik *</Label>
                <Input value={referralForm.fromClinic} onChange={(e) => setReferralForm((f) => ({ ...f, fromClinic: e.target.value }))} placeholder="Vårdcentralen" />
              </div>
              <div className="grid gap-2">
                <Label>Till klinik *</Label>
                <Input value={referralForm.toClinic} onChange={(e) => setReferralForm((f) => ({ ...f, toClinic: e.target.value }))} placeholder="Ortopedkliniken" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Specialitet</Label>
                <Select value={referralForm.specialty} onValueChange={(val) => setReferralForm((f) => ({ ...f, specialty: val }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={referralForm.status} onValueChange={(val) => setReferralForm((f) => ({ ...f, status: val as ReferralStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REFERRAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Diagnoskod</Label>
                <Input value={referralForm.diagnosisCode} onChange={(e) => setReferralForm((f) => ({ ...f, diagnosisCode: e.target.value }))} placeholder="M54.5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Skickad datum</Label>
                <Input type="date" value={referralForm.sentDate} onChange={(e) => setReferralForm((f) => ({ ...f, sentDate: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Behandlare</Label>
                <Input value={referralForm.practitioner} onChange={(e) => setReferralForm((f) => ({ ...f, practitioner: e.target.value }))} placeholder="Dr. Svensson" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Remissorsak *</Label>
              <Textarea value={referralForm.reasonForReferral} onChange={(e) => setReferralForm((f) => ({ ...f, reasonForReferral: e.target.value }))} placeholder="Anledning till remiss..." className="min-h-[80px]" />
            </div>
            {referralForm.status === 'response_received' || referralForm.status === 'completed' ? (
              <div className="grid gap-2">
                <Label>Remissvar</Label>
                <Textarea value={referralForm.responseContent} onChange={(e) => setReferralForm((f) => ({ ...f, responseContent: e.target.value }))} placeholder="Svar från mottagaren..." className="min-h-[80px]" />
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveReferral} disabled={!referralForm.patientName.trim() || !referralForm.fromClinic.trim() || !referralForm.toClinic.trim()}>
              {editingReferral ? 'Uppdatera' : 'Skapa remiss'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort remiss</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort remissen för{' '}
              <span className="font-semibold">{referralToDelete?.patientName}</span>? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteReferral}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
