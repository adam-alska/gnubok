'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
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
  Calculator,
  Receipt,
  BarChart3,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface VatRule {
  id: string
  category: string
  rate: number
  description: string
}

interface MonthlyVatEntry {
  month: string
  totalOmsattning: number
  moms12: number
  moms25: number
  totalMoms: number
  breakdown: { category: string; amount: number; rate: number; vat: number }[]
}

interface CalcLine {
  category: string
  amount: string
  rate: number
}

interface CalcResult {
  lines: { category: string; amount: number; rate: number; net: number; vat: number }[]
  totalGross: number
  totalNet: number
  totalVat: number
  vat12: number
  vat25: number
  net12: number
  net25: number
}

const DEFAULT_VAT_RULES: VatRule[] = [
  { id: 'r1', category: 'Mat', rate: 12, description: 'Livsmedel och maträtter' },
  { id: 'r2', category: 'Alkoholfri dryck', rate: 12, description: 'Läsk, juice, kaffe, te' },
  { id: 'r3', category: 'Alkohol', rate: 25, description: 'Öl, vin, sprit' },
  { id: 'r4', category: 'Take-away mat', rate: 12, description: 'Mat för avhämtning' },
  { id: 'r5', category: 'Catering', rate: 25, description: 'Cateringtjänster' },
]

function generateId(): string {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentYear(): number {
  return new Date().getFullYear()
}

const EMPTY_RULE_FORM = {
  category: '',
  rate: '12',
  description: '',
}

const EMPTY_MONTH_FORM = {
  month: currentYearMonth(),
  lines: [] as { category: string; amount: string }[],
}

export function MomssplitWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  // Shared state
  const [activeTab, setActiveTab] = useState('regler')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // VAT rules state
  const [vatRules, setVatRules] = useState<VatRule[]>([])
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<VatRule | null>(null)
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM)
  const [deleteRuleDialogOpen, setDeleteRuleDialogOpen] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<VatRule | null>(null)

  // Calculator state
  const [calcLines, setCalcLines] = useState<CalcLine[]>([])
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)

  // Monthly overview state
  const [monthlyEntries, setMonthlyEntries] = useState<MonthlyVatEntry[]>([])
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [monthDialogOpen, setMonthDialogOpen] = useState(false)
  const [monthForm, setMonthForm] = useState(EMPTY_MONTH_FORM)
  const [savingMonth, setSavingMonth] = useState(false)
  const [deleteMonthDialogOpen, setDeleteMonthDialogOpen] = useState(false)
  const [monthToDelete, setMonthToDelete] = useState<string | null>(null)

  // ===== Persistence helpers =====
  const saveConfig = useCallback(async (key: string, value: unknown) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: mod.slug,
        config_key: key,
        config_value: value,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const deleteConfig = useCallback(async (key: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('module_configs')
      .delete()
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', key)
  }, [supabase, sectorSlug, mod.slug])

  // ===== Fetch VAT rules =====
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
      setVatRules(data.config_value as VatRule[])
    } else {
      // First load: seed with defaults
      setVatRules(DEFAULT_VAT_RULES)
      await supabase.from('module_configs').upsert(
        {
          user_id: user.id,
          sector_slug: sectorSlug,
          module_slug: mod.slug,
          config_key: 'vat_rules',
          config_value: DEFAULT_VAT_RULES,
        },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  // ===== Fetch monthly entries =====
  const fetchMonthlyEntries = useCallback(async () => {
    setMonthlyLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMonthlyLoading(false); return }

    const year = currentYear()
    const { data } = await supabase
      .from('module_configs')
      .select('config_key, config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .like('config_key', `vat_monthly_${year}-%`)
      .order('config_key', { ascending: true })

    const entries: MonthlyVatEntry[] = (data ?? []).map((row) => row.config_value as MonthlyVatEntry)
    setMonthlyEntries(entries)
    setMonthlyLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchRules() }, [fetchRules])

  useEffect(() => {
    if (activeTab === 'manadsversikt') {
      fetchMonthlyEntries()
    }
  }, [activeTab, fetchMonthlyEntries])

  // Initialize calc lines when rules change
  useEffect(() => {
    if (vatRules.length > 0 && calcLines.length === 0) {
      setCalcLines(vatRules.map((r) => ({ category: r.category, amount: '', rate: r.rate })))
    }
  }, [vatRules, calcLines.length])

  // ===== VAT Rules CRUD =====
  function openNewRule() {
    setEditingRule(null)
    setRuleForm({ ...EMPTY_RULE_FORM })
    setRuleDialogOpen(true)
  }

  function openEditRule(rule: VatRule) {
    setEditingRule(rule)
    setRuleForm({
      category: rule.category,
      rate: String(rule.rate),
      description: rule.description,
    })
    setRuleDialogOpen(true)
  }

  async function handleSaveRule() {
    setSaving(true)
    const newRule: VatRule = {
      id: editingRule?.id ?? generateId(),
      category: ruleForm.category.trim(),
      rate: parseFloat(ruleForm.rate) || 0,
      description: ruleForm.description.trim(),
    }

    let updated: VatRule[]
    if (editingRule) {
      updated = vatRules.map((r) => r.id === editingRule.id ? newRule : r)
    } else {
      updated = [...vatRules, newRule]
    }

    setVatRules(updated)
    setRuleDialogOpen(false)
    await saveConfig('vat_rules', updated)

    // Update calc lines with new rules
    setCalcLines(updated.map((r) => {
      const existing = calcLines.find((cl) => cl.category === r.category)
      return { category: r.category, amount: existing?.amount ?? '', rate: r.rate }
    }))

    setSaving(false)
  }

  function openDeleteRuleConfirmation(rule: VatRule) {
    setRuleToDelete(rule)
    setDeleteRuleDialogOpen(true)
  }

  async function handleDeleteRule() {
    if (!ruleToDelete) return
    setSaving(true)
    const updated = vatRules.filter((r) => r.id !== ruleToDelete.id)
    setVatRules(updated)
    setDeleteRuleDialogOpen(false)
    setRuleToDelete(null)
    await saveConfig('vat_rules', updated)

    // Update calc lines
    setCalcLines(updated.map((r) => {
      const existing = calcLines.find((cl) => cl.category === r.category)
      return { category: r.category, amount: existing?.amount ?? '', rate: r.rate }
    }))

    setSaving(false)
  }

  // ===== Calculator =====
  function updateCalcLine(index: number, amount: string) {
    setCalcLines((prev) => prev.map((line, i) => i === index ? { ...line, amount } : line))
  }

  function handleCalculate() {
    const lines = calcLines
      .filter((l) => l.amount && parseFloat(l.amount) > 0)
      .map((l) => {
        const gross = parseFloat(l.amount) || 0
        const rate = l.rate / 100
        // VAT is included in the gross amount: net = gross / (1 + rate), vat = gross - net
        const net = gross / (1 + rate)
        const vat = gross - net
        return {
          category: l.category,
          amount: gross,
          rate: l.rate,
          net: Math.round(net * 100) / 100,
          vat: Math.round(vat * 100) / 100,
        }
      })

    const totalGross = lines.reduce((s, l) => s + l.amount, 0)
    const totalNet = lines.reduce((s, l) => s + l.net, 0)
    const totalVat = lines.reduce((s, l) => s + l.vat, 0)
    const vat12 = lines.filter((l) => l.rate === 12).reduce((s, l) => s + l.vat, 0)
    const vat25 = lines.filter((l) => l.rate === 25).reduce((s, l) => s + l.vat, 0)
    const net12 = lines.filter((l) => l.rate === 12).reduce((s, l) => s + l.net, 0)
    const net25 = lines.filter((l) => l.rate === 25).reduce((s, l) => s + l.net, 0)

    setCalcResult({
      lines,
      totalGross,
      totalNet: Math.round(totalNet * 100) / 100,
      totalVat: Math.round(totalVat * 100) / 100,
      vat12: Math.round(vat12 * 100) / 100,
      vat25: Math.round(vat25 * 100) / 100,
      net12: Math.round(net12 * 100) / 100,
      net25: Math.round(net25 * 100) / 100,
    })
  }

  function handleClearCalc() {
    setCalcLines(vatRules.map((r) => ({ category: r.category, amount: '', rate: r.rate })))
    setCalcResult(null)
  }

  // ===== Monthly entries =====
  function openNewMonthEntry() {
    setMonthForm({
      month: currentYearMonth(),
      lines: vatRules.map((r) => ({ category: r.category, amount: '' })),
    })
    setMonthDialogOpen(true)
  }

  function updateMonthLine(index: number, amount: string) {
    setMonthForm((prev) => ({
      ...prev,
      lines: prev.lines.map((l, i) => i === index ? { ...l, amount } : l),
    }))
  }

  async function handleSaveMonthEntry() {
    setSavingMonth(true)
    const breakdown = monthForm.lines
      .filter((l) => l.amount && parseFloat(l.amount) > 0)
      .map((l) => {
        const rule = vatRules.find((r) => r.category === l.category)
        const gross = parseFloat(l.amount) || 0
        const rate = (rule?.rate ?? 25) / 100
        const net = gross / (1 + rate)
        const vat = gross - net
        return {
          category: l.category,
          amount: gross,
          rate: rule?.rate ?? 25,
          vat: Math.round(vat * 100) / 100,
        }
      })

    const totalOmsattning = breakdown.reduce((s, b) => s + b.amount, 0)
    const moms12 = breakdown.filter((b) => b.rate === 12).reduce((s, b) => s + b.vat, 0)
    const moms25 = breakdown.filter((b) => b.rate === 25).reduce((s, b) => s + b.vat, 0)
    const totalMoms = moms12 + moms25

    const entry: MonthlyVatEntry = {
      month: monthForm.month,
      totalOmsattning: Math.round(totalOmsattning * 100) / 100,
      moms12: Math.round(moms12 * 100) / 100,
      moms25: Math.round(moms25 * 100) / 100,
      totalMoms: Math.round(totalMoms * 100) / 100,
      breakdown,
    }

    await saveConfig(`vat_monthly_${monthForm.month}`, entry)

    setMonthDialogOpen(false)
    setSavingMonth(false)
    fetchMonthlyEntries()
  }

  function openDeleteMonthConfirmation(month: string) {
    setMonthToDelete(month)
    setDeleteMonthDialogOpen(true)
  }

  async function handleDeleteMonth() {
    if (!monthToDelete) return
    setSaving(true)
    await deleteConfig(`vat_monthly_${monthToDelete}`)
    setDeleteMonthDialogOpen(false)
    setMonthToDelete(null)
    setSaving(false)
    fetchMonthlyEntries()
  }

  // ===== Monthly summary =====
  const yearSummary = useMemo(() => {
    const totOms = monthlyEntries.reduce((s, e) => s + e.totalOmsattning, 0)
    const tot12 = monthlyEntries.reduce((s, e) => s + e.moms12, 0)
    const tot25 = monthlyEntries.reduce((s, e) => s + e.moms25, 0)
    const totMoms = monthlyEntries.reduce((s, e) => s + e.totalMoms, 0)
    return { totOms, tot12, tot25, totMoms }
  }, [monthlyEntries])

  // ===== Render =====
  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Restaurang"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        tabs={
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="regler">Regler</TabsTrigger>
              <TabsTrigger value="kalkylator">Kalkylator</TabsTrigger>
              <TabsTrigger value="manadsversikt">Månadsöversikt</TabsTrigger>
            </TabsList>

            {/* ===== Tab 1: Regler ===== */}
            <TabsContent value="regler" className="mt-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium">Momsregler</h2>
                    <div className="flex items-center gap-2">
                      {saving && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Sparar...
                        </div>
                      )}
                      <Button variant="outline" onClick={openNewRule}>
                        <Plus className="mr-2 h-4 w-4" />
                        Ny regel
                      </Button>
                    </div>
                  </div>

                  {vatRules.length === 0 ? (
                    <EmptyModuleState
                      icon={Receipt}
                      title="Inga momsregler"
                      description="Lägg till momsregler för att konfigurera hur moms ska beräknas per kategori."
                      actionLabel="Ny regel"
                      onAction={openNewRule}
                    />
                  ) : (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">Kategori</TableHead>
                            <TableHead className="font-medium text-right">Momssats</TableHead>
                            <TableHead className="font-medium">Beskrivning</TableHead>
                            <TableHead className="font-medium text-right">Åtgärder</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {vatRules.map((rule) => (
                            <TableRow key={rule.id}>
                              <TableCell className="font-medium">{rule.category}</TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant="secondary"
                                  className={
                                    rule.rate === 12
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                  }
                                >
                                  {rule.rate}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{rule.description}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditRule(rule)}
                                    title="Redigera"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => openDeleteRuleConfirmation(rule)}
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
                </div>
              )}
            </TabsContent>

            {/* ===== Tab 2: Kalkylator ===== */}
            <TabsContent value="kalkylator" className="mt-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium">Momskalkylator</h2>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleClearCalc}>
                      Rensa
                    </Button>
                    <Button onClick={handleCalculate} disabled={calcLines.every((l) => !l.amount)}>
                      <Calculator className="mr-2 h-4 w-4" />
                      Beräkna
                    </Button>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  Ange bruttobelopp (inklusive moms) per kategori. Kalkylatorn bryter ut moms per momssats.
                </p>

                {/* Input fields */}
                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                  <h3 className="text-sm font-semibold">Belopp per kategori (inkl. moms)</h3>
                  <div className="grid gap-3">
                    {calcLines.map((line, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 min-w-[200px]">
                          <span className="text-sm font-medium">{line.category}</span>
                          <Badge variant="outline" className="text-xs">{line.rate}%</Badge>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.amount}
                          onChange={(e) => updateCalcLine(idx, e.target.value)}
                          placeholder="0,00"
                          className="max-w-[200px]"
                        />
                        <span className="text-sm text-muted-foreground">kr</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Results */}
                {calcResult && (
                  <div className="space-y-4">
                    <Separator />
                    <h3 className="text-lg font-medium">Resultat</h3>

                    {/* Summary cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Totalt brutto
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <span className="text-2xl font-semibold tracking-tight">{fmt(calcResult.totalGross)}</span>
                          <span className="text-sm text-muted-foreground ml-1">kr</span>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Totalt netto
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <span className="text-2xl font-semibold tracking-tight">{fmt(calcResult.totalNet)}</span>
                          <span className="text-sm text-muted-foreground ml-1">kr</span>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Total moms
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <span className="text-2xl font-semibold tracking-tight">{fmt(calcResult.totalVat)}</span>
                          <span className="text-sm text-muted-foreground ml-1">kr</span>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Momssplit
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">12% moms:</span>
                            <span className="text-sm font-semibold tabular-nums">{fmt(calcResult.vat12)} kr</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">25% moms:</span>
                            <span className="text-sm font-semibold tabular-nums">{fmt(calcResult.vat25)} kr</span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Detailed breakdown table */}
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">Kategori</TableHead>
                            <TableHead className="font-medium text-right">Brutto (kr)</TableHead>
                            <TableHead className="font-medium text-right">Momssats</TableHead>
                            <TableHead className="font-medium text-right">Netto (kr)</TableHead>
                            <TableHead className="font-medium text-right">Moms (kr)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {calcResult.lines.map((line, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{line.category}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(line.amount)}</TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant="secondary"
                                  className={
                                    line.rate === 12
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                  }
                                >
                                  {line.rate}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(line.net)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{fmt(line.vat)}</TableCell>
                            </TableRow>
                          ))}
                          {/* Totals row */}
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell>Totalt</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(calcResult.totalGross)}</TableCell>
                            <TableCell />
                            <TableCell className="text-right tabular-nums">{fmt(calcResult.totalNet)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(calcResult.totalVat)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    {/* VAT split summary */}
                    <div className="rounded-xl border border-border bg-card p-6">
                      <h4 className="text-sm font-semibold mb-3">Momsredovisning</h4>
                      <div className="grid gap-2 text-sm">
                        <div className="flex items-center justify-between py-1.5 border-b border-border">
                          <span>Utgående moms 12%</span>
                          <div className="text-right">
                            <span className="text-muted-foreground mr-4">Underlag: {fmt(calcResult.net12)} kr</span>
                            <span className="font-semibold tabular-nums">{fmt(calcResult.vat12)} kr</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between py-1.5 border-b border-border">
                          <span>Utgående moms 25%</span>
                          <div className="text-right">
                            <span className="text-muted-foreground mr-4">Underlag: {fmt(calcResult.net25)} kr</span>
                            <span className="font-semibold tabular-nums">{fmt(calcResult.vat25)} kr</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between py-1.5 font-semibold">
                          <span>Totalt att redovisa</span>
                          <span className="tabular-nums">{fmt(calcResult.totalVat)} kr</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ===== Tab 3: Månadsöversikt ===== */}
            <TabsContent value="manadsversikt" className="mt-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium">Månadsöversikt {currentYear()}</h2>
                  <Button variant="outline" onClick={openNewMonthEntry}>
                    <Plus className="mr-2 h-4 w-4" />
                    Ny månad
                  </Button>
                </div>

                {monthlyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : monthlyEntries.length === 0 ? (
                  <EmptyModuleState
                    icon={BarChart3}
                    title="Ingen månadsdata"
                    description="Lägg till månatlig momsdata för att se en översikt av årets momsredovisning."
                    actionLabel="Ny månad"
                    onAction={openNewMonthEntry}
                  />
                ) : (
                  <>
                    {/* Year summary cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Total omsättning
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <span className="text-2xl font-semibold tracking-tight">{fmtInt(yearSummary.totOms)}</span>
                          <span className="text-sm text-muted-foreground ml-1">kr</span>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Moms 12%
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <span className="text-2xl font-semibold tracking-tight">{fmtInt(yearSummary.tot12)}</span>
                          <span className="text-sm text-muted-foreground ml-1">kr</span>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Moms 25%
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <span className="text-2xl font-semibold tracking-tight">{fmtInt(yearSummary.tot25)}</span>
                          <span className="text-sm text-muted-foreground ml-1">kr</span>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Total moms
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <span className="text-2xl font-semibold tracking-tight">{fmtInt(yearSummary.totMoms)}</span>
                          <span className="text-sm text-muted-foreground ml-1">kr</span>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Monthly table */}
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-medium">Månad</TableHead>
                            <TableHead className="font-medium text-right">Omsättning (kr)</TableHead>
                            <TableHead className="font-medium text-right">Moms 12% (kr)</TableHead>
                            <TableHead className="font-medium text-right">Moms 25% (kr)</TableHead>
                            <TableHead className="font-medium text-right">Total moms (kr)</TableHead>
                            <TableHead className="font-medium text-right">Åtgärder</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {monthlyEntries.map((entry) => (
                            <TableRow key={entry.month}>
                              <TableCell className="font-medium">{entry.month}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtInt(entry.totalOmsattning)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(entry.moms12)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(entry.moms25)}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{fmt(entry.totalMoms)}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => openDeleteMonthConfirmation(entry.month)}
                                  title="Ta bort"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Yearly totals */}
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell>Helår {currentYear()}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtInt(yearSummary.totOms)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(yearSummary.tot12)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(yearSummary.tot25)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(yearSummary.totMoms)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        }
      >
        {null}
      </ModuleWorkspaceShell>

      {/* ===== VAT Rule Dialog ===== */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Redigera momsregel' : 'Ny momsregel'}</DialogTitle>
            <DialogDescription>
              {editingRule
                ? 'Uppdatera momsregelns uppgifter nedan.'
                : 'Skapa en ny momsregel för en kategori.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rule-category">Kategorinamn *</Label>
              <Input
                id="rule-category"
                value={ruleForm.category}
                onChange={(e) => setRuleForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="T.ex. Mat, Alkohol, Catering"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rule-rate">Momssats (%) *</Label>
              <Select
                value={ruleForm.rate}
                onValueChange={(val) => setRuleForm((f) => ({ ...f, rate: val }))}
              >
                <SelectTrigger id="rule-rate">
                  <SelectValue placeholder="Välj momssats" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6">6%</SelectItem>
                  <SelectItem value="12">12%</SelectItem>
                  <SelectItem value="25">25%</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rule-desc">Beskrivning</Label>
              <Input
                id="rule-desc"
                value={ruleForm.description}
                onChange={(e) => setRuleForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Kort beskrivning av kategorin"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveRule}
              disabled={!ruleForm.category.trim() || !ruleForm.rate}
            >
              {editingRule ? 'Uppdatera' : 'Skapa regel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Delete Rule Dialog ===== */}
      <Dialog open={deleteRuleDialogOpen} onOpenChange={setDeleteRuleDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort momsregel</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort regeln för{' '}
              <span className="font-semibold">{ruleToDelete?.category}</span> ({ruleToDelete?.rate}%)?
              Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRuleDialogOpen(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={handleDeleteRule}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== New Month Entry Dialog ===== */}
      <Dialog open={monthDialogOpen} onOpenChange={setMonthDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ny månadspost</DialogTitle>
            <DialogDescription>
              Ange total omsättning per kategori (brutto inkl. moms) för vald månad.
              Moms beräknas automatiskt baserat på dina momsregler.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="month-select">Månad *</Label>
              <Input
                id="month-select"
                type="month"
                value={monthForm.month}
                onChange={(e) => setMonthForm((f) => ({ ...f, month: e.target.value }))}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Belopp per kategori (inkl. moms)</Label>
              {monthForm.lines.map((line, idx) => {
                const rule = vatRules.find((r) => r.category === line.category)
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 min-w-[180px]">
                      <span className="text-sm">{line.category}</span>
                      <Badge variant="outline" className="text-xs">{rule?.rate ?? '?'}%</Badge>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.amount}
                      onChange={(e) => updateMonthLine(idx, e.target.value)}
                      placeholder="0,00"
                      className="max-w-[180px]"
                    />
                    <span className="text-sm text-muted-foreground">kr</span>
                  </div>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMonthDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleSaveMonthEntry}
              disabled={savingMonth || !monthForm.month || monthForm.lines.every((l) => !l.amount)}
            >
              {savingMonth && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Delete Month Dialog ===== */}
      <Dialog open={deleteMonthDialogOpen} onOpenChange={setDeleteMonthDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort månadsdata</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort all momsdata för{' '}
              <span className="font-semibold">{monthToDelete}</span>?
              Denna åtgärd kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMonthDialogOpen(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={handleDeleteMonth}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
