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
  ShieldCheck,
  Save,
  AlertTriangle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface PatientFrikort {
  id: string
  patientRef: string
  patientName: string
  totalPaid: number
  frikortIssued: boolean
  frikortDate: string
  visits: VisitEntry[]
}

interface VisitEntry {
  date: string
  amount: number
  provider: string
}

interface FrikortSettings {
  highCostLimit: number
  periodMonths: number
  regionCode: string
}

const DEFAULT_SETTINGS: FrikortSettings = {
  highCostLimit: 1300,
  periodMonths: 12,
  regionCode: '',
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

export function FrikortHogkostnadsskyddWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [patients, setPatients] = useState<PatientFrikort[]>([])
  const [settings, setSettings] = useState<FrikortSettings>(DEFAULT_SETTINGS)
  const [settingsForm, setSettingsForm] = useState<FrikortSettings>(DEFAULT_SETTINGS)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterFrikort, setFilterFrikort] = useState<'all' | 'issued' | 'not_issued'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPatient, setEditingPatient] = useState<PatientFrikort | null>(null)
  const [patientForm, setPatientForm] = useState({
    patientRef: '',
    patientName: '',
    visitDate: todayStr(),
    visitAmount: 0,
    visitProvider: '',
  })

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [patientToDelete, setPatientToDelete] = useState<PatientFrikort | null>(null)

  const savePatients = useCallback(async (newPatients: PatientFrikort[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'patients',
        config_value: newPatients,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveSettings = useCallback(async (newSettings: FrikortSettings) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'frikort_settings',
        config_value: newSettings,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSettings(newSettings)
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
      .eq('config_key', 'patients')
      .maybeSingle()

    if (pData?.config_value && Array.isArray(pData.config_value)) {
      setPatients(pData.config_value as PatientFrikort[])
    }

    const { data: sData } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'frikort_settings')
      .maybeSingle()

    if (sData?.config_value && typeof sData.config_value === 'object') {
      const s = sData.config_value as FrikortSettings
      setSettings(s)
      setSettingsForm(s)
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredPatients = useMemo(() => {
    let result = patients
    if (filterFrikort === 'issued') {
      result = result.filter((p) => p.frikortIssued)
    } else if (filterFrikort === 'not_issued') {
      result = result.filter((p) => !p.frikortIssued)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.patientRef.toLowerCase().includes(q) ||
          p.patientName.toLowerCase().includes(q)
      )
    }
    return result.sort((a, b) => b.totalPaid - a.totalPaid)
  }, [patients, filterFrikort, searchQuery])

  const stats = useMemo(() => ({
    totalPatients: patients.length,
    frikortIssued: patients.filter((p) => p.frikortIssued).length,
    nearLimit: patients.filter((p) => !p.frikortIssued && p.totalPaid >= settings.highCostLimit * 0.8).length,
    avgPaid: patients.length > 0 ? patients.reduce((s, p) => s + p.totalPaid, 0) / patients.length : 0,
  }), [patients, settings.highCostLimit])

  function openAddVisit(patient?: PatientFrikort) {
    if (patient) {
      setEditingPatient(patient)
      setPatientForm({
        patientRef: patient.patientRef,
        patientName: patient.patientName,
        visitDate: todayStr(),
        visitAmount: 0,
        visitProvider: '',
      })
    } else {
      setEditingPatient(null)
      setPatientForm({
        patientRef: '',
        patientName: '',
        visitDate: todayStr(),
        visitAmount: 0,
        visitProvider: '',
      })
    }
    setDialogOpen(true)
  }

  async function handleSaveVisit() {
    const visit: VisitEntry = {
      date: patientForm.visitDate,
      amount: patientForm.visitAmount,
      provider: patientForm.visitProvider.trim(),
    }

    let updated: PatientFrikort[]

    if (editingPatient) {
      updated = patients.map((p) => {
        if (p.id !== editingPatient.id) return p
        const newVisits = [...p.visits, visit]
        const newTotal = newVisits.reduce((s, v) => s + v.amount, 0)
        const reachedLimit = newTotal >= settings.highCostLimit
        return {
          ...p,
          visits: newVisits,
          totalPaid: newTotal,
          frikortIssued: p.frikortIssued || reachedLimit,
          frikortDate: p.frikortIssued ? p.frikortDate : (reachedLimit ? todayStr() : ''),
        }
      })
    } else {
      const newTotal = visit.amount
      const reachedLimit = newTotal >= settings.highCostLimit
      const newPatient: PatientFrikort = {
        id: generateId(),
        patientRef: patientForm.patientRef.trim(),
        patientName: patientForm.patientName.trim(),
        totalPaid: newTotal,
        frikortIssued: reachedLimit,
        frikortDate: reachedLimit ? todayStr() : '',
        visits: [visit],
      }
      updated = [...patients, newPatient]
    }

    setPatients(updated)
    setDialogOpen(false)
    await savePatients(updated)
  }

  function openDeleteConfirmation(patient: PatientFrikort) {
    setPatientToDelete(patient)
    setDeleteDialogOpen(true)
  }

  async function handleDeletePatient() {
    if (!patientToDelete) return
    const updated = patients.filter((p) => p.id !== patientToDelete.id)
    setPatients(updated)
    setDeleteDialogOpen(false)
    setPatientToDelete(null)
    await savePatients(updated)
  }

  async function handleSaveSettings() {
    await saveSettings(settingsForm)
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
          <Button onClick={() => openAddVisit()}>
            <Plus className="mr-2 h-4 w-4" />
            Registrera besök
          </Button>
        }
      >
        <Tabs defaultValue="oversikt" className="space-y-6">
          <TabsList>
            <TabsTrigger value="oversikt">Översikt</TabsTrigger>
            <TabsTrigger value="patienter">Patienter</TabsTrigger>
            <TabsTrigger value="installningar">Inställningar</TabsTrigger>
          </TabsList>

          <TabsContent value="oversikt" className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Registrerade patienter" value={stats.totalPatients.toString()} />
                <KPICard label="Utfärdade frikort" value={stats.frikortIssued.toString()} />
                <KPICard
                  label="Nära gräns"
                  value={stats.nearLimit.toString()}
                  trend={stats.nearLimit > 0 ? 'neutral' : undefined}
                  trendLabel={stats.nearLimit > 0 ? 'Snart frikort' : undefined}
                />
                <KPICard label="Snitt betalt" value={fmt(stats.avgPaid)} unit="kr" />
              </div>
            )}
          </TabsContent>

          <TabsContent value="patienter" className="space-y-6">
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
                      placeholder="Sök patient..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex gap-2">
                    {(['all', 'issued', 'not_issued'] as const).map((f) => (
                      <Button
                        key={f}
                        variant={filterFrikort === f ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setFilterFrikort(f)}
                      >
                        {f === 'all' ? 'Alla' : f === 'issued' ? 'Frikort' : 'Utan frikort'}
                      </Button>
                    ))}
                  </div>
                  {saving && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sparar...
                    </div>
                  )}
                </div>

                {filteredPatients.length === 0 ? (
                  <EmptyModuleState
                    icon={CreditCard}
                    title="Inga patienter registrerade"
                    description="Registrera patientbesök för att spåra högkostnadsskyddet."
                    actionLabel="Registrera besök"
                    onAction={() => openAddVisit()}
                  />
                ) : (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-medium">Patient</TableHead>
                          <TableHead className="font-medium">Referens</TableHead>
                          <TableHead className="font-medium text-right">Betalt</TableHead>
                          <TableHead className="font-medium">Framsteg</TableHead>
                          <TableHead className="font-medium">Frikort</TableHead>
                          <TableHead className="font-medium">Besök</TableHead>
                          <TableHead className="font-medium text-right">Åtgärder</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPatients.map((patient) => {
                          const pct = Math.min((patient.totalPaid / settings.highCostLimit) * 100, 100)
                          return (
                            <TableRow key={patient.id}>
                              <TableCell className="font-medium">{patient.patientName}</TableCell>
                              <TableCell className="font-mono text-sm">{patient.patientRef}</TableCell>
                              <TableCell className="text-right font-mono tabular-nums">{fmt(patient.totalPaid)} kr</TableCell>
                              <TableCell className="min-w-[120px]">
                                <div className="flex items-center gap-2">
                                  <Progress value={pct} className="h-2 flex-1" />
                                  <span className="text-xs text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {patient.frikortIssued ? (
                                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    <ShieldCheck className="mr-1 h-3 w-3" />
                                    Utfärdat {patient.frikortDate}
                                  </Badge>
                                ) : pct >= 80 ? (
                                  <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                    <AlertTriangle className="mr-1 h-3 w-3" />
                                    Nära gräns
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm">{patient.visits.length} st</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openAddVisit(patient)} title="Lägg till besök">
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(patient)} title="Ta bort">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="installningar" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
              <h3 className="text-sm font-semibold">Högkostnadsskydd</h3>
              <p className="text-xs text-muted-foreground">
                Ange gränsvärdet för högkostnadsskyddet. Nationellt tak är 1 300 kr under en 12-månadersperiod.
              </p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Takbelopp (kr)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settingsForm.highCostLimit}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, highCostLimit: Number(e.target.value) }))}
                    className="h-9 w-40"
                    placeholder="1300"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Period (månader)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={settingsForm.periodMonths}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, periodMonths: Number(e.target.value) }))}
                    className="h-9 w-40"
                    placeholder="12"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Regionkod</Label>
                  <Input
                    value={settingsForm.regionCode}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, regionCode: e.target.value }))}
                    className="h-9 w-40"
                    placeholder="01"
                  />
                </div>
                <Button size="sm" onClick={handleSaveSettings} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-3.5 w-3.5" />
                  )}
                  Spara inställningar
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ModuleWorkspaceShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPatient ? `Nytt besök - ${editingPatient.patientName}` : 'Registrera besök'}</DialogTitle>
            <DialogDescription>
              {editingPatient
                ? `Lägg till ett besök för patienten. Nuvarande total: ${fmt(editingPatient.totalPaid)} kr av ${fmt(settings.highCostLimit)} kr.`
                : 'Registrera en ny patient och dess första besök.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {!editingPatient && (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="pat-ref">Patientreferens *</Label>
                  <Input
                    id="pat-ref"
                    value={patientForm.patientRef}
                    onChange={(e) => setPatientForm((f) => ({ ...f, patientRef: e.target.value }))}
                    placeholder="P-2024-001"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pat-name">Patientnamn *</Label>
                  <Input
                    id="pat-name"
                    value={patientForm.patientName}
                    onChange={(e) => setPatientForm((f) => ({ ...f, patientName: e.target.value }))}
                    placeholder="Anna Andersson"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="visit-date">Besöksdatum *</Label>
                <Input
                  id="visit-date"
                  type="date"
                  value={patientForm.visitDate}
                  onChange={(e) => setPatientForm((f) => ({ ...f, visitDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="visit-amount">Belopp (kr) *</Label>
                <Input
                  id="visit-amount"
                  type="number"
                  min={0}
                  value={patientForm.visitAmount}
                  onChange={(e) => setPatientForm((f) => ({ ...f, visitAmount: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="visit-provider">Vårdgivare</Label>
              <Input
                id="visit-provider"
                value={patientForm.visitProvider}
                onChange={(e) => setPatientForm((f) => ({ ...f, visitProvider: e.target.value }))}
                placeholder="Dr. Svensson"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveVisit}
              disabled={
                (!editingPatient && (!patientForm.patientRef.trim() || !patientForm.patientName.trim())) ||
                patientForm.visitAmount <= 0
              }
            >
              Registrera besök
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort patient</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort{' '}
              <span className="font-semibold">{patientToDelete?.patientName}</span> och alla dess besök? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={handleDeletePatient}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
