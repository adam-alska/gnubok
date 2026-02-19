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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

type VatCategory = 'boende' | 'frukost' | 'minibar' | 'spa' | 'konferens' | 'parkering' | 'ovrigt'

interface VatRule {
  id: string
  category: VatCategory
  label: string
  vatRate: number
  account: string
}

interface PackageLine {
  category: VatCategory
  label: string
  amount: number
}

interface PackageTemplate {
  id: string
  name: string
  totalPrice: number
  lines: PackageLine[]
}

const VAT_CATEGORIES: { value: VatCategory; label: string; defaultRate: number }[] = [
  { value: 'boende', label: 'Boende (rum)', defaultRate: 12 },
  { value: 'frukost', label: 'Frukost', defaultRate: 12 },
  { value: 'minibar', label: 'Minibar', defaultRate: 25 },
  { value: 'spa', label: 'Spa & Wellness', defaultRate: 25 },
  { value: 'konferens', label: 'Konferens', defaultRate: 25 },
  { value: 'parkering', label: 'Parkering', defaultRate: 25 },
  { value: 'ovrigt', label: 'Övrigt', defaultRate: 25 },
]

const DEFAULT_RULES: VatRule[] = [
  { id: '1', category: 'boende', label: 'Rumsintakt', vatRate: 12, account: '3010' },
  { id: '2', category: 'frukost', label: 'Frukost', vatRate: 12, account: '3032' },
  { id: '3', category: 'minibar', label: 'Minibar', vatRate: 25, account: '3031' },
  { id: '4', category: 'spa', label: 'Spa & Wellness', vatRate: 25, account: '3040' },
  { id: '5', category: 'konferens', label: 'Konferensintakt', vatRate: 25, account: '3020' },
  { id: '6', category: 'parkering', label: 'Parkering', vatRate: 25, account: '3050' },
]

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function MomssplitBoendeTjanstWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rules, setRules] = useState<VatRule[]>([])
  const [packages, setPackages] = useState<PackageTemplate[]>([])

  // Rule dialog
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<VatRule | null>(null)
  const [ruleForm, setRuleForm] = useState({ category: 'boende' as VatCategory, label: '', vatRate: 12, account: '' })

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<VatRule | null>(null)

  // Package dialog
  const [pkgDialogOpen, setPkgDialogOpen] = useState(false)
  const [editingPkg, setEditingPkg] = useState<PackageTemplate | null>(null)
  const [pkgForm, setPkgForm] = useState({ name: '', totalPrice: 0, lines: [] as PackageLine[] })

  // Calculator
  const [calcTotal, setCalcTotal] = useState(0)
  const [calcCategory, setCalcCategory] = useState<VatCategory>('boende')

  // Persistence
  const saveData = useCallback(async (newRules: VatRule[], newPackages: PackageTemplate[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await Promise.all([
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'vat_rules', config_value: newRules },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
      supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'packages', config_value: newPackages },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      ),
    ])
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: rows } = await supabase
      .from('module_configs')
      .select('config_key, config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .in('config_key', ['vat_rules', 'packages'])

    let loadedRules = DEFAULT_RULES
    let loadedPkgs: PackageTemplate[] = []

    for (const row of rows ?? []) {
      if (row.config_key === 'vat_rules' && Array.isArray(row.config_value)) {
        loadedRules = row.config_value as VatRule[]
      }
      if (row.config_key === 'packages' && Array.isArray(row.config_value)) {
        loadedPkgs = row.config_value as PackageTemplate[]
      }
    }

    setRules(loadedRules)
    setPackages(loadedPkgs)

    if (!(rows ?? []).find(r => r.config_key === 'vat_rules')) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'vat_rules', config_value: DEFAULT_RULES },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  // Calculator result
  const calcResult = useMemo(() => {
    const rule = rules.find(r => r.category === calcCategory)
    const rate = rule?.vatRate ?? 25
    const exVat = calcTotal / (1 + rate / 100)
    const vat = calcTotal - exVat
    return { exVat, vat, rate }
  }, [calcTotal, calcCategory, rules])

  // Rule CRUD
  function openNewRule() {
    setEditingRule(null)
    setRuleForm({ category: 'boende', label: '', vatRate: 12, account: '' })
    setRuleDialogOpen(true)
  }

  function openEditRule(rule: VatRule) {
    setEditingRule(rule)
    setRuleForm({ category: rule.category, label: rule.label, vatRate: rule.vatRate, account: rule.account })
    setRuleDialogOpen(true)
  }

  async function handleSaveRule() {
    const newRule: VatRule = {
      id: editingRule?.id ?? generateId(),
      category: ruleForm.category,
      label: ruleForm.label.trim(),
      vatRate: ruleForm.vatRate,
      account: ruleForm.account.trim(),
    }
    let updated: VatRule[]
    if (editingRule) {
      updated = rules.map(r => r.id === editingRule.id ? newRule : r)
    } else {
      updated = [...rules, newRule]
    }
    setRules(updated)
    setRuleDialogOpen(false)
    await saveData(updated, packages)
  }

  async function handleDeleteRule() {
    if (!ruleToDelete) return
    const updated = rules.filter(r => r.id !== ruleToDelete.id)
    setRules(updated)
    setDeleteDialogOpen(false)
    setRuleToDelete(null)
    await saveData(updated, packages)
  }

  // Package CRUD
  function openNewPackage() {
    setEditingPkg(null)
    setPkgForm({ name: '', totalPrice: 0, lines: [{ category: 'boende', label: 'Rum', amount: 0 }] })
    setPkgDialogOpen(true)
  }

  function openEditPackage(pkg: PackageTemplate) {
    setEditingPkg(pkg)
    setPkgForm({ name: pkg.name, totalPrice: pkg.totalPrice, lines: [...pkg.lines] })
    setPkgDialogOpen(true)
  }

  function addPkgLine() {
    setPkgForm(f => ({ ...f, lines: [...f.lines, { category: 'boende' as VatCategory, label: '', amount: 0 }] }))
  }

  function removePkgLine(idx: number) {
    setPkgForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))
  }

  function updatePkgLine(idx: number, field: string, value: string | number) {
    setPkgForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: value } : l)
    }))
  }

  async function handleSavePackage() {
    const newPkg: PackageTemplate = {
      id: editingPkg?.id ?? generateId(),
      name: pkgForm.name.trim(),
      totalPrice: pkgForm.totalPrice,
      lines: pkgForm.lines,
    }
    let updated: PackageTemplate[]
    if (editingPkg) {
      updated = packages.map(p => p.id === editingPkg.id ? newPkg : p)
    } else {
      updated = [...packages, newPkg]
    }
    setPackages(updated)
    setPkgDialogOpen(false)
    await saveData(rules, updated)
  }

  async function handleDeletePackage(id: string) {
    const updated = packages.filter(p => p.id !== id)
    setPackages(updated)
    await saveData(rules, updated)
  }

  // Package VAT split calc
  function calcPackageSplit(pkg: PackageTemplate) {
    const splits: { category: VatCategory; label: string; amount: number; vatRate: number; exVat: number; vat: number }[] = []
    for (const line of pkg.lines) {
      const rule = rules.find(r => r.category === line.category)
      const rate = rule?.vatRate ?? 25
      const exVat = line.amount / (1 + rate / 100)
      const vat = line.amount - exVat
      splits.push({ category: line.category, label: line.label, amount: line.amount, vatRate: rate, exVat, vat })
    }
    return splits
  }

  return (
    <>
      <ModuleWorkspaceShell
        title={mod.name}
        description={mod.desc}
        category="bokforing"
        sectorName="Hotell & Boende"
        backHref={`/m/${sectorSlug}`}
        settingsHref={settingsHref}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="regler" className="space-y-6">
            <TabsList>
              <TabsTrigger value="regler">Momsregler</TabsTrigger>
              <TabsTrigger value="kalkylator">Kalkylator</TabsTrigger>
              <TabsTrigger value="paket">Paketuppdelning</TabsTrigger>
            </TabsList>

            {/* Rules tab */}
            <TabsContent value="regler" className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Definiera momssatser per kategori av tjänst.</p>
                <Button onClick={openNewRule} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Ny regel
                </Button>
              </div>
              {saving && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sparar...
                </div>
              )}
              {rules.length === 0 ? (
                <EmptyModuleState
                  icon={Receipt}
                  title="Inga momsregler"
                  description="Lägg till momsregler för att definiera momssatser per tjänstekategori."
                  actionLabel="Ny regel"
                  onAction={openNewRule}
                />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Kategori</TableHead>
                        <TableHead className="font-medium">Benämning</TableHead>
                        <TableHead className="font-medium text-right">Momssats %</TableHead>
                        <TableHead className="font-medium">Konto</TableHead>
                        <TableHead className="font-medium text-right">Åtgärder</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <Badge variant="outline">
                              {VAT_CATEGORIES.find(c => c.value === rule.category)?.label ?? rule.category}
                            </Badge>
                          </TableCell>
                          <TableCell>{rule.label}</TableCell>
                          <TableCell className="text-right font-mono">
                            <Badge variant="secondary" className={rule.vatRate === 12 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}>
                              {rule.vatRate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono">{rule.account}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditRule(rule)} title="Redigera">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => { setRuleToDelete(rule); setDeleteDialogOpen(true) }} title="Ta bort">
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
            </TabsContent>

            {/* Calculator tab */}
            <TabsContent value="kalkylator" className="space-y-6">
              <Card className="max-w-lg">
                <CardHeader>
                  <CardTitle className="text-base">Momsberäknare</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Belopp inkl. moms (kr)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={calcTotal || ''}
                        onChange={e => setCalcTotal(parseFloat(e.target.value) || 0)}
                        placeholder="1000.00"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Kategori</Label>
                      <Select value={calcCategory} onValueChange={val => setCalcCategory(val as VatCategory)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VAT_CATEGORIES.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Exkl. moms</p>
                      <p className="text-xl font-semibold">{fmt(calcResult.exVat)} kr</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Moms ({calcResult.rate}%)</p>
                      <p className="text-xl font-semibold">{fmt(calcResult.vat)} kr</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Inkl. moms</p>
                      <p className="text-xl font-semibold">{fmt(calcTotal)} kr</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Package split tab */}
            <TabsContent value="paket" className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Definiera kombinationspaket och se momsuppdelning automatiskt.</p>
                <Button onClick={openNewPackage} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Nytt paket
                </Button>
              </div>
              {packages.length === 0 ? (
                <EmptyModuleState
                  icon={Calculator}
                  title="Inga paket"
                  description="Skapa kombinationspaket för att automatiskt beräkna momsuppdelning."
                  actionLabel="Nytt paket"
                  onAction={openNewPackage}
                />
              ) : (
                <div className="space-y-4">
                  {packages.map(pkg => {
                    const splits = calcPackageSplit(pkg)
                    const totalExVat = splits.reduce((s, l) => s + l.exVat, 0)
                    const totalVat = splits.reduce((s, l) => s + l.vat, 0)
                    return (
                      <Card key={pkg.id}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                          <CardTitle className="text-base">{pkg.name}</CardTitle>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditPackage(pkg)} title="Redigera">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700" onClick={() => handleDeletePackage(pkg.id)} title="Ta bort">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="rounded-lg border border-border overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="font-medium">Del</TableHead>
                                  <TableHead className="font-medium text-right">Inkl. moms</TableHead>
                                  <TableHead className="font-medium text-right">Moms %</TableHead>
                                  <TableHead className="font-medium text-right">Exkl. moms</TableHead>
                                  <TableHead className="font-medium text-right">Moms</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {splits.map((s, i) => (
                                  <TableRow key={i}>
                                    <TableCell>{s.label || VAT_CATEGORIES.find(c => c.value === s.category)?.label}</TableCell>
                                    <TableCell className="text-right font-mono">{fmt(s.amount)}</TableCell>
                                    <TableCell className="text-right font-mono">{s.vatRate}%</TableCell>
                                    <TableCell className="text-right font-mono">{fmt(s.exVat)}</TableCell>
                                    <TableCell className="text-right font-mono">{fmt(s.vat)}</TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/30 font-semibold">
                                  <TableCell>Totalt</TableCell>
                                  <TableCell className="text-right font-mono">{fmt(pkg.totalPrice)}</TableCell>
                                  <TableCell />
                                  <TableCell className="text-right font-mono">{fmt(totalExVat)}</TableCell>
                                  <TableCell className="text-right font-mono">{fmt(totalVat)}</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </ModuleWorkspaceShell>

      {/* Rule Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Redigera momsregel' : 'Ny momsregel'}</DialogTitle>
            <DialogDescription>
              {editingRule ? 'Uppdatera momsregeln nedan.' : 'Definiera en ny momsregel för en tjänstekategori.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Kategori</Label>
                <Select value={ruleForm.category} onValueChange={val => setRuleForm(f => ({ ...f, category: val as VatCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VAT_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Benämning *</Label>
                <Input value={ruleForm.label} onChange={e => setRuleForm(f => ({ ...f, label: e.target.value }))} placeholder="Rumsintakt" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Momssats (%)</Label>
                <Input type="number" min={0} max={100} step={0.5} value={ruleForm.vatRate} onChange={e => setRuleForm(f => ({ ...f, vatRate: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="grid gap-2">
                <Label>Konto</Label>
                <Input value={ruleForm.account} onChange={e => setRuleForm(f => ({ ...f, account: e.target.value }))} placeholder="3010" maxLength={6} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSaveRule} disabled={!ruleForm.label.trim()}>{editingRule ? 'Uppdatera' : 'Skapa regel'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Rule Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ta bort momsregel</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort regeln &quot;{ruleToDelete?.label}&quot;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={handleDeleteRule}>
              <Trash2 className="mr-2 h-4 w-4" />
              Ta bort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Package Dialog */}
      <Dialog open={pkgDialogOpen} onOpenChange={setPkgDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPkg ? 'Redigera paket' : 'Nytt kombinationspaket'}</DialogTitle>
            <DialogDescription>Definiera paketets namn, totalpris och ingående delar med belopp.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Paketnamn *</Label>
                <Input value={pkgForm.name} onChange={e => setPkgForm(f => ({ ...f, name: e.target.value }))} placeholder="Weekendpaket" />
              </div>
              <div className="grid gap-2">
                <Label>Totalpris inkl. moms (kr)</Label>
                <Input type="number" min={0} step="0.01" value={pkgForm.totalPrice || ''} onChange={e => setPkgForm(f => ({ ...f, totalPrice: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Ingående delar</Label>
                <Button variant="outline" size="sm" onClick={addPkgLine}>
                  <Plus className="mr-1 h-3 w-3" />
                  Lägg till
                </Button>
              </div>
              {pkgForm.lines.map((line, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="grid gap-1 flex-1">
                    <Label className="text-xs">Kategori</Label>
                    <Select value={line.category} onValueChange={val => updatePkgLine(idx, 'category', val)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VAT_CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1 flex-1">
                    <Label className="text-xs">Benämning</Label>
                    <Input className="h-9" value={line.label} onChange={e => updatePkgLine(idx, 'label', e.target.value)} placeholder="Rum" />
                  </div>
                  <div className="grid gap-1 w-28">
                    <Label className="text-xs">Belopp (kr)</Label>
                    <Input className="h-9" type="number" min={0} step="0.01" value={line.amount || ''} onChange={e => updatePkgLine(idx, 'amount', parseFloat(e.target.value) || 0)} />
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-red-600" onClick={() => removePkgLine(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPkgDialogOpen(false)}>Avbryt</Button>
            <Button onClick={handleSavePackage} disabled={!pkgForm.name.trim() || pkgForm.lines.length === 0}>{editingPkg ? 'Uppdatera' : 'Skapa paket'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
