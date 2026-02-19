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
  Pencil,
  Trash2,
  Loader2,
  Search,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type PartyRole = 'Klient' | 'Motpart' | 'Vittne' | 'Ombud' | 'Myndighet' | 'Övrigt'
type ConflictResult = 'Ingen konflikt' | 'Potentiell konflikt' | 'Konflikt identifierad'

interface PartyEntry {
  id: string
  name: string
  orgNumber: string
  role: PartyRole
  caseRef: string
  lawyerName: string
  registeredDate: string
  note: string
}

interface ConflictCheck {
  id: string
  checkDate: string
  searchTerm: string
  performedBy: string
  result: ConflictResult
  matchedParties: string[]
  note: string
}

const PARTY_ROLES: PartyRole[] = ['Klient', 'Motpart', 'Vittne', 'Ombud', 'Myndighet', 'Övrigt']
const CONFLICT_RESULTS: ConflictResult[] = ['Ingen konflikt', 'Potentiell konflikt', 'Konflikt identifierad']

const RESULT_COLORS: Record<ConflictResult, string> = {
  'Ingen konflikt': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Potentiell konflikt': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Konflikt identifierad': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const ROLE_COLORS: Record<PartyRole, string> = {
  'Klient': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Motpart': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'Vittne': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  'Ombud': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Myndighet': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Övrigt': 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-500',
}

const EMPTY_PARTY_FORM = {
  name: '',
  orgNumber: '',
  role: 'Klient' as PartyRole,
  caseRef: '',
  lawyerName: '',
  note: '',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function IntressekonfliktskontrollWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [parties, setParties] = useState<PartyEntry[]>([])
  const [checks, setChecks] = useState<ConflictCheck[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState<PartyRole | 'all'>('all')

  // Party dialog
  const [partyDialogOpen, setPartyDialogOpen] = useState(false)
  const [editingParty, setEditingParty] = useState<PartyEntry | null>(null)
  const [partyForm, setPartyForm] = useState(EMPTY_PARTY_FORM)

  // Conflict check
  const [conflictSearchTerm, setConflictSearchTerm] = useState('')
  const [conflictPerformedBy, setConflictPerformedBy] = useState('')
  const [conflictResult, setConflictResult] = useState<ConflictResult | null>(null)
  const [conflictMatches, setConflictMatches] = useState<string[]>([])

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [partyToDelete, setPartyToDelete] = useState<PartyEntry | null>(null)

  const saveData = useCallback(async (newParties: PartyEntry[], newChecks: ConflictCheck[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await Promise.all([
      supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'parties',
          config_value: newParties,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'conflict_checks',
          config_value: newChecks,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
    ])
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [partiesRes, checksRes] = await Promise.all([
      supabase.from('module_configs').select('config_value')
        .eq('user_id', user.id).eq('sector_slug', sectorSlug)
        .eq('module_slug', mod.slug).eq('config_key', 'parties').maybeSingle(),
      supabase.from('module_configs').select('config_value')
        .eq('user_id', user.id).eq('sector_slug', sectorSlug)
        .eq('module_slug', mod.slug).eq('config_key', 'conflict_checks').maybeSingle(),
    ])

    if (partiesRes.data?.config_value && Array.isArray(partiesRes.data.config_value)) {
      setParties(partiesRes.data.config_value as PartyEntry[])
    }
    if (checksRes.data?.config_value && Array.isArray(checksRes.data.config_value)) {
      setChecks(checksRes.data.config_value as ConflictCheck[])
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredParties = useMemo(() => {
    let result = parties
    if (filterRole !== 'all') {
      result = result.filter((p) => p.role === filterRole)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.orgNumber.toLowerCase().includes(q) ||
          p.caseRef.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [parties, filterRole, searchQuery])

  const summary = useMemo(() => {
    const totalParties = parties.length
    const totalChecks = checks.length
    const conflicts = checks.filter((c) => c.result === 'Konflikt identifierad').length
    const potential = checks.filter((c) => c.result === 'Potentiell konflikt').length
    const clear = checks.filter((c) => c.result === 'Ingen konflikt').length
    return { totalParties, totalChecks, conflicts, potential, clear }
  }, [parties, checks])

  function openNewParty() {
    setEditingParty(null)
    setPartyForm({ ...EMPTY_PARTY_FORM })
    setPartyDialogOpen(true)
  }

  function openEditParty(p: PartyEntry) {
    setEditingParty(p)
    setPartyForm({
      name: p.name,
      orgNumber: p.orgNumber,
      role: p.role,
      caseRef: p.caseRef,
      lawyerName: p.lawyerName,
      note: p.note,
    })
    setPartyDialogOpen(true)
  }

  async function handleSaveParty() {
    const today = new Date().toISOString().slice(0, 10)

    let updatedParties: PartyEntry[]
    if (editingParty) {
      updatedParties = parties.map((p) =>
        p.id === editingParty.id
          ? { ...p, ...partyForm, name: partyForm.name.trim(), orgNumber: partyForm.orgNumber.trim(), caseRef: partyForm.caseRef.trim(), lawyerName: partyForm.lawyerName.trim(), note: partyForm.note.trim() }
          : p
      )
    } else {
      updatedParties = [
        ...parties,
        {
          id: generateId(),
          ...partyForm,
          name: partyForm.name.trim(),
          orgNumber: partyForm.orgNumber.trim(),
          caseRef: partyForm.caseRef.trim(),
          lawyerName: partyForm.lawyerName.trim(),
          note: partyForm.note.trim(),
          registeredDate: today,
        },
      ]
    }
    setParties(updatedParties)
    setPartyDialogOpen(false)
    await saveData(updatedParties, checks)
  }

  async function handleConflictCheck() {
    if (!conflictSearchTerm.trim()) return

    const term = conflictSearchTerm.toLowerCase()
    const matches = parties.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.orgNumber.toLowerCase().includes(term)
    )

    const matchNames = matches.map((m) => `${m.name} (${m.role}, ${m.caseRef})`)

    let result: ConflictResult
    if (matches.length === 0) {
      result = 'Ingen konflikt'
    } else {
      // Check if same name appears in opposing roles
      const hasClient = matches.some((m) => m.role === 'Klient')
      const hasMotpart = matches.some((m) => m.role === 'Motpart')
      if (hasClient && hasMotpart) {
        result = 'Konflikt identifierad'
      } else if (matches.length > 1) {
        result = 'Potentiell konflikt'
      } else {
        result = 'Potentiell konflikt'
      }
    }

    setConflictResult(result)
    setConflictMatches(matchNames)

    const today = new Date().toISOString().slice(0, 10)
    const newCheck: ConflictCheck = {
      id: generateId(),
      checkDate: today,
      searchTerm: conflictSearchTerm.trim(),
      performedBy: conflictPerformedBy.trim(),
      result,
      matchedParties: matchNames,
      note: '',
    }

    const updatedChecks = [newCheck, ...checks]
    setChecks(updatedChecks)
    await saveData(parties, updatedChecks)
  }

  function openDeleteConfirmation(p: PartyEntry) {
    setPartyToDelete(p)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteParty() {
    if (!partyToDelete) return
    const updatedParties = parties.filter((p) => p.id !== partyToDelete.id)
    setParties(updatedParties)
    setDeleteDialogOpen(false)
    setPartyToDelete(null)
    await saveData(updatedParties, checks)
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="operativ"
        sectorName="Juridik"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        actions={
          <Button onClick={openNewParty}>
            <Plus className="mr-2 h-4 w-4" />
            Ny part
          </Button>
        }
      >
        <Tabs defaultValue="kontroll" className="space-y-6">
          <TabsList>
            <TabsTrigger value="kontroll">Konfliktsökning</TabsTrigger>
            <TabsTrigger value="partregister">Partregister</TabsTrigger>
            <TabsTrigger value="granskningslogg">Granskningslogg</TabsTrigger>
          </TabsList>

          {/* Conflict check */}
          <TabsContent value="kontroll" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <KPICard label="Registrerade parter" value={String(summary.totalParties)} />
                  <KPICard label="Genomförda kontroller" value={String(summary.totalChecks)} />
                  <KPICard
                    label="Konflikter"
                    value={String(summary.conflicts)}
                    trend={summary.conflicts > 0 ? 'down' : 'up'}
                  />
                  <KPICard
                    label="Potentiella"
                    value={String(summary.potential)}
                    trend={summary.potential > 0 ? 'neutral' : 'up'}
                  />
                  <KPICard label="Fria" value={String(summary.clear)} />
                </div>

                <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-4">
                  <h3 className="text-sm font-semibold">Sök intressekonflikt</h3>
                  <p className="text-xs text-muted-foreground">
                    Sök på namn eller organisationsnummer för att kontrollera mot partregistret.
                  </p>
                  <div className="grid gap-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="conflict-search">Sökterm *</Label>
                        <Input
                          id="conflict-search"
                          value={conflictSearchTerm}
                          onChange={(e) => { setConflictSearchTerm(e.target.value); setConflictResult(null) }}
                          placeholder="Namn eller org.nr"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="conflict-by">Utförd av</Label>
                        <Input
                          id="conflict-by"
                          value={conflictPerformedBy}
                          onChange={(e) => setConflictPerformedBy(e.target.value)}
                          placeholder="Juristens namn"
                        />
                      </div>
                    </div>
                    <Button onClick={handleConflictCheck} disabled={!conflictSearchTerm.trim() || saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      Sök
                    </Button>
                  </div>

                  {conflictResult && (
                    <div className={cn(
                      'rounded-lg p-4 space-y-2',
                      conflictResult === 'Ingen konflikt' && 'bg-emerald-50 dark:bg-emerald-950/10',
                      conflictResult === 'Potentiell konflikt' && 'bg-amber-50 dark:bg-amber-950/10',
                      conflictResult === 'Konflikt identifierad' && 'bg-red-50 dark:bg-red-950/10',
                    )}>
                      <div className="flex items-center gap-2">
                        {conflictResult === 'Ingen konflikt' && <CheckCircle className="h-5 w-5 text-emerald-600" />}
                        {conflictResult === 'Potentiell konflikt' && <AlertTriangle className="h-5 w-5 text-amber-600" />}
                        {conflictResult === 'Konflikt identifierad' && <XCircle className="h-5 w-5 text-red-600" />}
                        <span className="font-medium text-sm">{conflictResult}</span>
                      </div>
                      {conflictMatches.length > 0 && (
                        <ul className="text-xs text-muted-foreground space-y-1 ml-7">
                          {conflictMatches.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      )}
                      {conflictMatches.length === 0 && (
                        <p className="text-xs text-muted-foreground ml-7">
                          Inga matchningar hittades i partregistret.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* Party register */}
          <TabsContent value="partregister" className="space-y-4">
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
                      placeholder="Sök part..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterRole} onValueChange={(val) => setFilterRole(val as PartyRole | 'all')}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Roll" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla roller</SelectItem>
                      {PARTY_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
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

                {filteredParties.length === 0 ? (
                  <EmptyModuleState
                    icon={Shield}
                    title="Inga parter registrerade"
                    description="Lägg till parter i registret för att kunna göra intressekonfliktskontroller."
                    actionLabel="Ny part"
                    onAction={openNewParty}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Namn</TableHead>
                          <TableHead className="font-medium">Org.nr</TableHead>
                          <TableHead className="font-medium">Roll</TableHead>
                          <TableHead className="font-medium">Ärende</TableHead>
                          <TableHead className="font-medium">Jurist</TableHead>
                          <TableHead className="font-medium">Registrerad</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredParties.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="font-mono text-sm">{p.orgNumber || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={ROLE_COLORS[p.role]}>{p.role}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{p.caseRef}</TableCell>
                            <TableCell>{p.lawyerName}</TableCell>
                            <TableCell className="text-sm">{p.registeredDate}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openEditParty(p)} title="Redigera">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(p)} title="Ta bort">
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

          {/* Audit log */}
          <TabsContent value="granskningslogg" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : checks.length === 0 ? (
              <EmptyModuleState
                icon={Shield}
                title="Ingen granskningslogg"
                description="Genomför en intressekonfliktskontroll för att börja logga."
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Datum</TableHead>
                      <TableHead className="font-medium">Sökterm</TableHead>
                      <TableHead className="font-medium">Utförd av</TableHead>
                      <TableHead className="font-medium">Resultat</TableHead>
                      <TableHead className="font-medium">Matchningar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checks.map((check) => (
                      <TableRow key={check.id}>
                        <TableCell>{check.checkDate}</TableCell>
                        <TableCell className="font-medium">{check.searchTerm}</TableCell>
                        <TableCell>{check.performedBy || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={RESULT_COLORS[check.result]}>
                            {check.result}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[300px]">
                          {check.matchedParties.length > 0 ? (
                            <ul className="space-y-0.5">
                              {check.matchedParties.map((m, i) => (
                                <li key={i} className="text-xs text-muted-foreground">{m}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-xs text-muted-foreground">Inga</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      {/* Add/Edit Party Dialog */}
      <Dialog open={partyDialogOpen} onOpenChange={setPartyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingParty ? 'Redigera part' : 'Ny part'}</DialogTitle>
            <DialogDescription>
              {editingParty ? 'Uppdatera partens uppgifter.' : 'Registrera en ny part i registret för intressekonfliktskontroll.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="party-name">Namn *</Label>
                <Input id="party-name" value={partyForm.name} onChange={(e) => setPartyForm((f) => ({ ...f, name: e.target.value }))} placeholder="Företag AB" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="party-org">Org.nr</Label>
                <Input id="party-org" value={partyForm.orgNumber} onChange={(e) => setPartyForm((f) => ({ ...f, orgNumber: e.target.value }))} placeholder="556xxx-xxxx" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="party-role">Roll *</Label>
                <Select value={partyForm.role} onValueChange={(val) => setPartyForm((f) => ({ ...f, role: val as PartyRole }))}>
                  <SelectTrigger id="party-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PARTY_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="party-case">Ärende</Label>
                <Input id="party-case" value={partyForm.caseRef} onChange={(e) => setPartyForm((f) => ({ ...f, caseRef: e.target.value }))} placeholder="2024-001" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-lawyer">Ansvarig jurist</Label>
              <Input id="party-lawyer" value={partyForm.lawyerName} onChange={(e) => setPartyForm((f) => ({ ...f, lawyerName: e.target.value }))} placeholder="Namn" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="party-note">Anteckning</Label>
              <Input id="party-note" value={partyForm.note} onChange={(e) => setPartyForm((f) => ({ ...f, note: e.target.value }))} placeholder="Frivillig anteckning..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPartyDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveParty} disabled={!partyForm.name.trim()}>
              {editingParty ? 'Uppdatera' : 'Registrera'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort part</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort{' '}
              <span className="font-semibold">{partyToDelete?.name}</span> från partregistret?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteParty}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
