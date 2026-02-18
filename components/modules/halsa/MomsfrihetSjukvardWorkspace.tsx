'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
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
import { Switch } from '@/components/ui/switch'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type VatStatus = 'momsfri' | 'momsbelagd'
type ServiceCategory = 'Sjukvård' | 'Tandvård' | 'Sjukgymnastik' | 'Laboratorium' | 'Estetisk' | 'Konsultation' | 'Utbildning' | 'Övrigt'

interface ServiceRule {
  id: string
  serviceName: string
  category: ServiceCategory
  vatStatus: VatStatus
  vatRate: number
  autoAssess: boolean
  notes: string
}

const SERVICE_CATEGORIES: ServiceCategory[] = ['Sjukvård', 'Tandvård', 'Sjukgymnastik', 'Laboratorium', 'Estetisk', 'Konsultation', 'Utbildning', 'Övrigt']

const DEFAULT_RULES: ServiceRule[] = [
  { id: '1', serviceName: 'Läkarbesök', category: 'Sjukvård', vatStatus: 'momsfri', vatRate: 0, autoAssess: true, notes: 'Momsfri sjukvård enligt ML 3 kap 4-5 §§' },
  { id: '2', serviceName: 'Tandvårdsbehandling', category: 'Tandvård', vatStatus: 'momsfri', vatRate: 0, autoAssess: true, notes: 'Momsfri tandvård enligt ML 3 kap 6 §' },
  { id: '3', serviceName: 'Sjukgymnastik', category: 'Sjukgymnastik', vatStatus: 'momsfri', vatRate: 0, autoAssess: true, notes: 'Momsfri legitimerad sjukvård' },
  { id: '4', serviceName: 'Estetisk kirurgi', category: 'Estetisk', vatStatus: 'momsbelagd', vatRate: 25, autoAssess: true, notes: 'Ej sjukvård - moms 25%' },
  { id: '5', serviceName: 'Hälsointyg', category: 'Konsultation', vatStatus: 'momsbelagd', vatRate: 25, autoAssess: true, notes: 'Intyg utan sjukvårdssyfte - moms 25%' },
  { id: '6', serviceName: 'Företagshälsovård', category: 'Konsultation', vatStatus: 'momsbelagd', vatRate: 25, autoAssess: true, notes: 'Momsbelagd tjänst om ej sjukvård' },
  { id: '7', serviceName: 'Vaccinationer (reseråd)', category: 'Övrigt', vatStatus: 'momsbelagd', vatRate: 25, autoAssess: true, notes: 'Ej förebyggande sjukvård' },
  { id: '8', serviceName: 'Laboratorieanalyser (klinisk)', category: 'Laboratorium', vatStatus: 'momsfri', vatRate: 0, autoAssess: true, notes: 'Momsfri om del av sjukvård' },
]

const VAT_STATUS_COLORS: Record<VatStatus, string> = {
  momsfri: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  momsbelagd: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

const EMPTY_RULE_FORM = {
  serviceName: '',
  category: 'Sjukvård' as ServiceCategory,
  vatStatus: 'momsfri' as VatStatus,
  vatRate: 0,
  autoAssess: true,
  notes: '',
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function MomsfrihetSjukvardWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rules, setRules] = useState<ServiceRule[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<VatStatus | 'all'>('all')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<ServiceRule | null>(null)
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<ServiceRule | null>(null)

  const saveRules = useCallback(async (newRules: ServiceRule[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: 'vat_rules',
        config_value: newRules,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchRules = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'vat_rules')
      .maybeSingle()

    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setRules(data.config_value as ServiceRule[])
    } else {
      setRules(DEFAULT_RULES)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'vat_rules',
          config_value: DEFAULT_RULES,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchRules() }, [fetchRules])

  const filteredRules = useMemo(() => {
    let result = rules
    if (filterStatus !== 'all') {
      result = result.filter((r) => r.vatStatus === filterStatus)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (r) =>
          r.serviceName.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.notes.toLowerCase().includes(q)
      )
    }
    return result
  }, [rules, filterStatus, searchQuery])

  const statusCounts = useMemo(() => ({
    momsfri: rules.filter((r) => r.vatStatus === 'momsfri').length,
    momsbelagd: rules.filter((r) => r.vatStatus === 'momsbelagd').length,
    autoAssess: rules.filter((r) => r.autoAssess).length,
  }), [rules])

  function openNewRule() {
    setEditingRule(null)
    setRuleForm({ ...EMPTY_RULE_FORM })
    setDialogOpen(true)
  }

  function openEditRule(rule: ServiceRule) {
    setEditingRule(rule)
    setRuleForm({
      serviceName: rule.serviceName,
      category: rule.category,
      vatStatus: rule.vatStatus,
      vatRate: rule.vatRate,
      autoAssess: rule.autoAssess,
      notes: rule.notes,
    })
    setDialogOpen(true)
  }

  async function handleSaveRule() {
    const newRule: ServiceRule = {
      id: editingRule ? editingRule.id : generateId(),
      serviceName: ruleForm.serviceName.trim(),
      category: ruleForm.category,
      vatStatus: ruleForm.vatStatus,
      vatRate: ruleForm.vatStatus === 'momsfri' ? 0 : ruleForm.vatRate,
      autoAssess: ruleForm.autoAssess,
      notes: ruleForm.notes.trim(),
    }

    let updated: ServiceRule[]
    if (editingRule) {
      updated = rules.map((r) => r.id === editingRule.id ? newRule : r)
    } else {
      updated = [...rules, newRule]
    }

    setRules(updated)
    setDialogOpen(false)
    await saveRules(updated)
  }

  function openDeleteConfirmation(rule: ServiceRule) {
    setRuleToDelete(rule)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteRule() {
    if (!ruleToDelete) return
    const updated = rules.filter((r) => r.id !== ruleToDelete.id)
    setRules(updated)
    setDeleteDialogOpen(false)
    setRuleToDelete(null)
    await saveRules(updated)
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
          <Button onClick={openNewRule}>
            <Plus className="mr-2 h-4 w-4" />
            Ny tjänsteregel
          </Button>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Totalt antal regler
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{rules.length}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Momsfria tjänster
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight text-emerald-600">{statusCounts.momsfri}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Momsbelagda tjänster
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight text-amber-600">{statusCounts.momsbelagd}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Autobedömning aktiv
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tracking-tight">{statusCounts.autoAssess}</span>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök tjänst eller anteckning..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={filterStatus}
                onValueChange={(val) => setFilterStatus(val as VatStatus | 'all')}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrera momsstatus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  <SelectItem value="momsfri">Momsfri</SelectItem>
                  <SelectItem value="momsbelagd">Momsbelagd</SelectItem>
                </SelectContent>
              </Select>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
            </div>

            {filteredRules.length === 0 ? (
              <EmptyModuleState
                icon={ShieldCheck}
                title="Inga momsregler hittades"
                description={
                  searchQuery || filterStatus !== 'all'
                    ? 'Inga regler matchar dina sökkriterier.'
                    : 'Lägg till tjänsteregler för automatisk momsbedömning.'
                }
                actionLabel={!searchQuery && filterStatus === 'all' ? 'Ny tjänsteregel' : undefined}
                onAction={!searchQuery && filterStatus === 'all' ? openNewRule : undefined}
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Tjänst</TableHead>
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium">Momsstatus</TableHead>
                      <TableHead className="font-medium">Momssats</TableHead>
                      <TableHead className="font-medium">Auto</TableHead>
                      <TableHead className="font-medium">Anteckning</TableHead>
                      <TableHead className="font-medium text-right">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.serviceName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={VAT_STATUS_COLORS[rule.vatStatus]}>
                            {rule.vatStatus === 'momsfri' ? 'Momsfri' : 'Momsbelagd'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">{rule.vatRate}%</TableCell>
                        <TableCell>
                          {rule.autoAssess ? (
                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{rule.notes}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditRule(rule)} title="Redigera">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteConfirmation(rule)} title="Ta bort">
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Redigera tjänsteregel' : 'Ny tjänsteregel'}</DialogTitle>
            <DialogDescription>
              {editingRule
                ? 'Uppdatera momsregelns uppgifter nedan.'
                : 'Definiera en ny tjänst och dess momsstatus.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rule-name">Tjänstnamn *</Label>
              <Input
                id="rule-name"
                value={ruleForm.serviceName}
                onChange={(e) => setRuleForm((f) => ({ ...f, serviceName: e.target.value }))}
                placeholder="Läkarbesök"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rule-cat">Kategori *</Label>
                <Select
                  value={ruleForm.category}
                  onValueChange={(val) => setRuleForm((f) => ({ ...f, category: val as ServiceCategory }))}
                >
                  <SelectTrigger id="rule-cat">
                    <SelectValue placeholder="Välj kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rule-status">Momsstatus *</Label>
                <Select
                  value={ruleForm.vatStatus}
                  onValueChange={(val) => {
                    const status = val as VatStatus
                    setRuleForm((f) => ({
                      ...f,
                      vatStatus: status,
                      vatRate: status === 'momsfri' ? 0 : 25,
                    }))
                  }}
                >
                  <SelectTrigger id="rule-status">
                    <SelectValue placeholder="Välj status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="momsfri">Momsfri</SelectItem>
                    <SelectItem value="momsbelagd">Momsbelagd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {ruleForm.vatStatus === 'momsbelagd' && (
              <div className="grid gap-2">
                <Label htmlFor="rule-rate">Momssats (%)</Label>
                <Input
                  id="rule-rate"
                  type="number"
                  min={0}
                  max={100}
                  value={ruleForm.vatRate}
                  onChange={(e) => setRuleForm((f) => ({ ...f, vatRate: Number(e.target.value) }))}
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch
                checked={ruleForm.autoAssess}
                onCheckedChange={(checked) => setRuleForm((f) => ({ ...f, autoAssess: checked }))}
              />
              <Label>Automatisk momsbedömning</Label>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rule-notes">Anteckning</Label>
              <Input
                id="rule-notes"
                value={ruleForm.notes}
                onChange={(e) => setRuleForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Lagstöd eller notering..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveRule}
              disabled={!ruleForm.serviceName.trim()}
            >
              {editingRule ? 'Uppdatera' : 'Skapa regel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort tjänsteregel</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort regeln för{' '}
              <span className="font-semibold">{ruleToDelete?.serviceName}</span>? Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={handleDeleteRule}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
