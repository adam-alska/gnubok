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
  moms6: number
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
  vat6: number
  vat25: number
  net6: number
  net25: number
}

const DEFAULT_VAT_RULES: VatRule[] = [
  { id: 'r1', category: 'Idrottstjänster', rate: 6, description: 'Gruppträning, gym, simning (6% moms)' },
  { id: 'r2', category: 'PT-tjänster', rate: 25, description: 'Personlig träning (25% moms)' },
  { id: 'r3', category: 'Spa & wellness', rate: 25, description: 'Spa, bastu, massage (25% moms)' },
  { id: 'r4', category: 'Butik', rate: 25, description: 'Kosttillskott, kläder, tillbehör (25% moms)' },
  { id: 'r5', category: 'Uthyrning utrustning', rate: 25, description: 'Utrustningsuthyrning (25% moms)' },
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

const EMPTY_RULE_FORM = { category: '', rate: '6', description: '' }

export function MomssplitIdrottPtWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState('regler')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [vatRules, setVatRules] = useState<VatRule[]>([])
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<VatRule | null>(null)
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM)
  const [deleteRuleDialogOpen, setDeleteRuleDialogOpen] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<VatRule | null>(null)
  const [calcLines, setCalcLines] = useState<CalcLine[]>([])
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [monthlyEntries, setMonthlyEntries] = useState<MonthlyVatEntry[]>([])
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [monthDialogOpen, setMonthDialogOpen] = useState(false)
  const [monthForm, setMonthForm] = useState({ month: currentYearMonth(), lines: [] as { category: string; amount: string }[] })
  const [savingMonth, setSavingMonth] = useState(false)
  const [deleteMonthDialogOpen, setDeleteMonthDialogOpen] = useState(false)
  const [monthToDelete, setMonthToDelete] = useState<string | null>(null)

  const saveConfig = useCallback(async (key: string, value: unknown) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: key, config_value: value },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const deleteConfig = useCallback(async (key: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('module_configs').delete().eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', key)
  }, [supabase, sectorSlug, mod.slug])

  const fetchRules = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'vat_rules').maybeSingle()
    if (data?.config_value && Array.isArray(data.config_value) && data.config_value.length > 0) {
      setVatRules(data.config_value as VatRule[])
    } else {
      setVatRules(DEFAULT_VAT_RULES)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'vat_rules', config_value: DEFAULT_VAT_RULES },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchMonthlyEntries = useCallback(async () => {
    setMonthlyLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMonthlyLoading(false); return }
    const year = currentYear()
    const { data } = await supabase.from('module_configs').select('config_key, config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).like('config_key', `vat_monthly_${year}-%`).order('config_key', { ascending: true })
    setMonthlyEntries((data ?? []).map((row) => row.config_value as MonthlyVatEntry))
    setMonthlyLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchRules() }, [fetchRules])
  useEffect(() => { if (activeTab === 'manadsversikt') fetchMonthlyEntries() }, [activeTab, fetchMonthlyEntries])
  useEffect(() => { if (vatRules.length > 0 && calcLines.length === 0) setCalcLines(vatRules.map((r) => ({ category: r.category, amount: '', rate: r.rate }))) }, [vatRules, calcLines.length])

  function openNewRule() { setEditingRule(null); setRuleForm({ ...EMPTY_RULE_FORM }); setRuleDialogOpen(true) }
  function openEditRule(rule: VatRule) { setEditingRule(rule); setRuleForm({ category: rule.category, rate: String(rule.rate), description: rule.description }); setRuleDialogOpen(true) }

  async function handleSaveRule() {
    setSaving(true)
    const newRule: VatRule = { id: editingRule?.id ?? generateId(), category: ruleForm.category.trim(), rate: parseFloat(ruleForm.rate) || 0, description: ruleForm.description.trim() }
    const updated = editingRule ? vatRules.map((r) => r.id === editingRule.id ? newRule : r) : [...vatRules, newRule]
    setVatRules(updated)
    setRuleDialogOpen(false)
    await saveConfig('vat_rules', updated)
    setCalcLines(updated.map((r) => { const existing = calcLines.find((cl) => cl.category === r.category); return { category: r.category, amount: existing?.amount ?? '', rate: r.rate } }))
    setSaving(false)
  }

  function openDeleteRuleConfirmation(rule: VatRule) { setRuleToDelete(rule); setDeleteRuleDialogOpen(true) }

  async function handleDeleteRule() {
    if (!ruleToDelete) return
    setSaving(true)
    const updated = vatRules.filter((r) => r.id !== ruleToDelete.id)
    setVatRules(updated)
    setDeleteRuleDialogOpen(false)
    setRuleToDelete(null)
    await saveConfig('vat_rules', updated)
    setCalcLines(updated.map((r) => { const existing = calcLines.find((cl) => cl.category === r.category); return { category: r.category, amount: existing?.amount ?? '', rate: r.rate } }))
    setSaving(false)
  }

  function updateCalcLine(index: number, amount: string) { setCalcLines((prev) => prev.map((line, i) => i === index ? { ...line, amount } : line)) }

  function handleCalculate() {
    const lines = calcLines.filter((l) => l.amount && parseFloat(l.amount) > 0).map((l) => {
      const gross = parseFloat(l.amount) || 0
      const rate = l.rate / 100
      const net = gross / (1 + rate)
      const vat = gross - net
      return { category: l.category, amount: gross, rate: l.rate, net: Math.round(net * 100) / 100, vat: Math.round(vat * 100) / 100 }
    })
    const totalGross = lines.reduce((s, l) => s + l.amount, 0)
    const totalNet = lines.reduce((s, l) => s + l.net, 0)
    const totalVat = lines.reduce((s, l) => s + l.vat, 0)
    const vat6 = lines.filter((l) => l.rate === 6).reduce((s, l) => s + l.vat, 0)
    const vat25 = lines.filter((l) => l.rate === 25).reduce((s, l) => s + l.vat, 0)
    const net6 = lines.filter((l) => l.rate === 6).reduce((s, l) => s + l.net, 0)
    const net25 = lines.filter((l) => l.rate === 25).reduce((s, l) => s + l.net, 0)
    setCalcResult({ lines, totalGross, totalNet: Math.round(totalNet * 100) / 100, totalVat: Math.round(totalVat * 100) / 100, vat6: Math.round(vat6 * 100) / 100, vat25: Math.round(vat25 * 100) / 100, net6: Math.round(net6 * 100) / 100, net25: Math.round(net25 * 100) / 100 })
  }

  function handleClearCalc() { setCalcLines(vatRules.map((r) => ({ category: r.category, amount: '', rate: r.rate }))); setCalcResult(null) }

  function openNewMonthEntry() { setMonthForm({ month: currentYearMonth(), lines: vatRules.map((r) => ({ category: r.category, amount: '' })) }); setMonthDialogOpen(true) }
  function updateMonthLine(index: number, amount: string) { setMonthForm((prev) => ({ ...prev, lines: prev.lines.map((l, i) => i === index ? { ...l, amount } : l) })) }

  async function handleSaveMonthEntry() {
    setSavingMonth(true)
    const breakdown = monthForm.lines.filter((l) => l.amount && parseFloat(l.amount) > 0).map((l) => {
      const rule = vatRules.find((r) => r.category === l.category)
      const gross = parseFloat(l.amount) || 0
      const rate = (rule?.rate ?? 25) / 100
      const vat = gross - gross / (1 + rate)
      return { category: l.category, amount: gross, rate: rule?.rate ?? 25, vat: Math.round(vat * 100) / 100 }
    })
    const totalOmsattning = breakdown.reduce((s, b) => s + b.amount, 0)
    const moms6 = breakdown.filter((b) => b.rate === 6).reduce((s, b) => s + b.vat, 0)
    const moms25 = breakdown.filter((b) => b.rate === 25).reduce((s, b) => s + b.vat, 0)
    const entry: MonthlyVatEntry = { month: monthForm.month, totalOmsattning: Math.round(totalOmsattning * 100) / 100, moms6: Math.round(moms6 * 100) / 100, moms25: Math.round(moms25 * 100) / 100, totalMoms: Math.round((moms6 + moms25) * 100) / 100, breakdown }
    await saveConfig(`vat_monthly_${monthForm.month}`, entry)
    setMonthDialogOpen(false)
    setSavingMonth(false)
    fetchMonthlyEntries()
  }

  function openDeleteMonthConfirmation(month: string) { setMonthToDelete(month); setDeleteMonthDialogOpen(true) }

  async function handleDeleteMonth() {
    if (!monthToDelete) return
    setSaving(true)
    await deleteConfig(`vat_monthly_${monthToDelete}`)
    setDeleteMonthDialogOpen(false)
    setMonthToDelete(null)
    setSaving(false)
    fetchMonthlyEntries()
  }

  const yearSummary = useMemo(() => {
    const totOms = monthlyEntries.reduce((s, e) => s + e.totalOmsattning, 0)
    const tot6 = monthlyEntries.reduce((s, e) => s + e.moms6, 0)
    const tot25 = monthlyEntries.reduce((s, e) => s + e.moms25, 0)
    const totMoms = monthlyEntries.reduce((s, e) => s + e.totalMoms, 0)
    return { totOms, tot6, tot25, totMoms }
  }, [monthlyEntries])

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Fitness & Sport"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
        tabs={
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="regler">Regler</TabsTrigger>
              <TabsTrigger value="kalkylator">Kalkylator</TabsTrigger>
              <TabsTrigger value="manadsversikt">Månadsöversikt</TabsTrigger>
            </TabsList>

            <TabsContent value="regler" className="mt-6">
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium">Momsregler idrott & PT</h2>
                    <div className="flex items-center gap-2">
                      {saving && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sparar...</div>}
                      <Button variant="outline" onClick={openNewRule}><Plus className="mr-2 h-4 w-4" />Ny regel</Button>
                    </div>
                  </div>
                  {vatRules.length === 0 ? (
                    <EmptyModuleState icon={Receipt} title="Inga momsregler" description="Lägg till momsregler för att konfigurera hur moms ska beräknas per kategori." actionLabel="Ny regel" onAction={openNewRule} />
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
                                <Badge variant="secondary" className={rule.rate === 6 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}>{rule.rate}%</Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{rule.description}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditRule(rule)} title="Redigera"><Pencil className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteRuleConfirmation(rule)} title="Ta bort"><Trash2 className="h-4 w-4" /></Button>
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

            <TabsContent value="kalkylator" className="mt-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium">Momskalkylator (6% / 25%)</h2>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleClearCalc}>Rensa</Button>
                    <Button onClick={handleCalculate} disabled={calcLines.every((l) => !l.amount)}><Calculator className="mr-2 h-4 w-4" />Beräkna</Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Ange bruttobelopp (inkl. moms) per kategori. Idrottstjänster beskattas med 6%, PT/spa/butik med 25%.</p>
                <div className="rounded-xl border border-border bg-card p-6 space-y-4">
                  <h3 className="text-sm font-semibold">Belopp per kategori (inkl. moms)</h3>
                  <div className="grid gap-3">
                    {calcLines.map((line, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 min-w-[200px]">
                          <span className="text-sm font-medium">{line.category}</span>
                          <Badge variant="outline" className="text-xs">{line.rate}%</Badge>
                        </div>
                        <Input type="number" min={0} step="0.01" value={line.amount} onChange={(e) => updateCalcLine(idx, e.target.value)} placeholder="0,00" className="max-w-[200px]" />
                        <span className="text-sm text-muted-foreground">kr</span>
                      </div>
                    ))}
                  </div>
                </div>
                {calcResult && (
                  <div className="space-y-4">
                    <Separator />
                    <h3 className="text-lg font-medium">Resultat</h3>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt brutto</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(calcResult.totalGross)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                      <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Totalt netto</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(calcResult.totalNet)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                      <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total moms</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmt(calcResult.totalVat)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                      <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Momssplit</CardTitle></CardHeader><CardContent className="space-y-1"><div className="flex items-center justify-between"><span className="text-sm">6% moms:</span><span className="text-sm font-semibold tabular-nums">{fmt(calcResult.vat6)} kr</span></div><div className="flex items-center justify-between"><span className="text-sm">25% moms:</span><span className="text-sm font-semibold tabular-nums">{fmt(calcResult.vat25)} kr</span></div></CardContent></Card>
                    </div>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Kategori</TableHead><TableHead className="font-medium text-right">Brutto (kr)</TableHead><TableHead className="font-medium text-right">Momssats</TableHead><TableHead className="font-medium text-right">Netto (kr)</TableHead><TableHead className="font-medium text-right">Moms (kr)</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {calcResult.lines.map((line, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{line.category}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(line.amount)}</TableCell>
                              <TableCell className="text-right"><Badge variant="secondary" className={line.rate === 6 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}>{line.rate}%</Badge></TableCell>
                              <TableCell className="text-right tabular-nums">{fmt(line.net)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{fmt(line.vat)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30 font-semibold"><TableCell>Totalt</TableCell><TableCell className="text-right tabular-nums">{fmt(calcResult.totalGross)}</TableCell><TableCell /><TableCell className="text-right tabular-nums">{fmt(calcResult.totalNet)}</TableCell><TableCell className="text-right tabular-nums">{fmt(calcResult.totalVat)}</TableCell></TableRow>
                        </TableBody>
                      </Table>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-6">
                      <h4 className="text-sm font-semibold mb-3">Momsredovisning</h4>
                      <div className="grid gap-2 text-sm">
                        <div className="flex items-center justify-between py-1.5 border-b border-border"><span>Utgående moms 6%</span><div className="text-right"><span className="text-muted-foreground mr-4">Underlag: {fmt(calcResult.net6)} kr</span><span className="font-semibold tabular-nums">{fmt(calcResult.vat6)} kr</span></div></div>
                        <div className="flex items-center justify-between py-1.5 border-b border-border"><span>Utgående moms 25%</span><div className="text-right"><span className="text-muted-foreground mr-4">Underlag: {fmt(calcResult.net25)} kr</span><span className="font-semibold tabular-nums">{fmt(calcResult.vat25)} kr</span></div></div>
                        <div className="flex items-center justify-between py-1.5 font-semibold"><span>Totalt att redovisa</span><span className="tabular-nums">{fmt(calcResult.totalVat)} kr</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="manadsversikt" className="mt-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium">Månadsöversikt {currentYear()}</h2>
                  <Button variant="outline" onClick={openNewMonthEntry}><Plus className="mr-2 h-4 w-4" />Ny månad</Button>
                </div>
                {monthlyLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : monthlyEntries.length === 0 ? (
                  <EmptyModuleState icon={BarChart3} title="Ingen månadsdata" description="Lägg till månatlig momsdata för att se en översikt av årets momsredovisning." actionLabel="Ny månad" onAction={openNewMonthEntry} />
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total omsättning</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmtInt(yearSummary.totOms)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                      <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Moms 6%</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmtInt(yearSummary.tot6)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                      <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Moms 25%</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmtInt(yearSummary.tot25)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                      <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total moms</CardTitle></CardHeader><CardContent><span className="text-2xl font-semibold tracking-tight">{fmtInt(yearSummary.totMoms)}</span><span className="text-sm text-muted-foreground ml-1">kr</span></CardContent></Card>
                    </div>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <Table>
                        <TableHeader><TableRow className="bg-muted/50"><TableHead className="font-medium">Månad</TableHead><TableHead className="font-medium text-right">Omsättning (kr)</TableHead><TableHead className="font-medium text-right">Moms 6% (kr)</TableHead><TableHead className="font-medium text-right">Moms 25% (kr)</TableHead><TableHead className="font-medium text-right">Total moms (kr)</TableHead><TableHead className="font-medium text-right">Åtgärder</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {monthlyEntries.map((entry) => (
                            <TableRow key={entry.month}><TableCell className="font-medium">{entry.month}</TableCell><TableCell className="text-right tabular-nums">{fmtInt(entry.totalOmsattning)}</TableCell><TableCell className="text-right tabular-nums">{fmt(entry.moms6)}</TableCell><TableCell className="text-right tabular-nums">{fmt(entry.moms25)}</TableCell><TableCell className="text-right tabular-nums font-semibold">{fmt(entry.totalMoms)}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => openDeleteMonthConfirmation(entry.month)} title="Ta bort"><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>
                          ))}
                          <TableRow className="bg-muted/30 font-semibold"><TableCell>Helår {currentYear()}</TableCell><TableCell className="text-right tabular-nums">{fmtInt(yearSummary.totOms)}</TableCell><TableCell className="text-right tabular-nums">{fmt(yearSummary.tot6)}</TableCell><TableCell className="text-right tabular-nums">{fmt(yearSummary.tot25)}</TableCell><TableCell className="text-right tabular-nums">{fmt(yearSummary.totMoms)}</TableCell><TableCell /></TableRow>
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

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingRule ? 'Redigera momsregel' : 'Ny momsregel'}</DialogTitle><DialogDescription>{editingRule ? 'Uppdatera momsregelns uppgifter nedan.' : 'Skapa en ny momsregel för en kategori.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="rule-category">Kategorinamn *</Label><Input id="rule-category" value={ruleForm.category} onChange={(e) => setRuleForm((f) => ({ ...f, category: e.target.value }))} placeholder="T.ex. Idrottstjänster, PT" /></div>
            <div className="grid gap-2"><Label htmlFor="rule-rate">Momssats (%) *</Label><Select value={ruleForm.rate} onValueChange={(val) => setRuleForm((f) => ({ ...f, rate: val }))}><SelectTrigger id="rule-rate"><SelectValue placeholder="Välj momssats" /></SelectTrigger><SelectContent><SelectItem value="6">6%</SelectItem><SelectItem value="12">12%</SelectItem><SelectItem value="25">25%</SelectItem></SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="rule-desc">Beskrivning</Label><Input id="rule-desc" value={ruleForm.description} onChange={(e) => setRuleForm((f) => ({ ...f, description: e.target.value }))} placeholder="Kort beskrivning av kategorin" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveRule} disabled={!ruleForm.category.trim() || !ruleForm.rate}>{editingRule ? 'Uppdatera' : 'Skapa regel'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteRuleDialogOpen} onOpenChange={setDeleteRuleDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort momsregel</DialogTitle><DialogDescription>Är du säker på att du vill ta bort regeln för <span className="font-semibold">{ruleToDelete?.category}</span> ({ruleToDelete?.rate}%)? Denna åtgärd kan inte ångras.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteRuleDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDeleteRule}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={monthDialogOpen} onOpenChange={setMonthDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ny månadspost</DialogTitle><DialogDescription>Ange total omsättning per kategori (brutto inkl. moms) för vald månad.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2"><Label htmlFor="month-select">Månad *</Label><Input id="month-select" type="month" value={monthForm.month} onChange={(e) => setMonthForm((f) => ({ ...f, month: e.target.value }))} /></div>
            <Separator />
            <div className="space-y-3">
              <Label>Belopp per kategori (inkl. moms)</Label>
              {monthForm.lines.map((line, idx) => { const rule = vatRules.find((r) => r.category === line.category); return (
                <div key={idx} className="flex items-center gap-3"><div className="flex items-center gap-2 min-w-[180px]"><span className="text-sm">{line.category}</span><Badge variant="outline" className="text-xs">{rule?.rate ?? '?'}%</Badge></div><Input type="number" min={0} step="0.01" value={line.amount} onChange={(e) => updateMonthLine(idx, e.target.value)} placeholder="0,00" className="max-w-[180px]" /><span className="text-sm text-muted-foreground">kr</span></div>
              ) })}
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setMonthDialogOpen(false)}>Avbryt</Button><Button onClick={handleSaveMonthEntry} disabled={savingMonth || !monthForm.month || monthForm.lines.every((l) => !l.amount)}>{savingMonth && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Spara</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteMonthDialogOpen} onOpenChange={setDeleteMonthDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Ta bort månadsdata</DialogTitle><DialogDescription>Är du säker på att du vill ta bort all momsdata för <span className="font-semibold">{monthToDelete}</span>? Denna åtgärd kan inte ångras.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteMonthDialogOpen(false)}>Avbryt</Button><Button variant="destructive" onClick={handleDeleteMonth}><Trash2 className="mr-2 h-4 w-4" />Ta bort</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
