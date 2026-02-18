'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  RotateCcw,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface CategoryReturn {
  category: string
  orderCount: number
  returnCount: number
  returnRate: number
  returnCost: number
}

interface MonthlyReturn {
  month: string
  orderCount: number
  returnCount: number
  returnRate: number
  returnCost: number
}

interface Settings {
  targetReturnRate: number
  avgReturnCost: number
}

const DEFAULT_SETTINGS: Settings = {
  targetReturnRate: 5.0,
  avgReturnCost: 75,
}

const DEFAULT_CATEGORIES: CategoryReturn[] = [
  { category: 'Kläder', orderCount: 850, returnCount: 128, returnRate: 15.06, returnCost: 9600 },
  { category: 'Skor', orderCount: 320, returnCount: 64, returnRate: 20.00, returnCost: 4800 },
  { category: 'Accessoarer', orderCount: 210, returnCount: 11, returnRate: 5.24, returnCost: 825 },
  { category: 'Elektronik', orderCount: 150, returnCount: 8, returnRate: 5.33, returnCost: 600 },
  { category: 'Heminredning', orderCount: 180, returnCount: 14, returnRate: 7.78, returnCost: 1050 },
  { category: 'Sport', orderCount: 95, returnCount: 7, returnRate: 7.37, returnCost: 525 },
]

const DEFAULT_MONTHLY: MonthlyReturn[] = [
  { month: '2024-08', orderCount: 280, returnCount: 34, returnRate: 12.14, returnCost: 2550 },
  { month: '2024-09', orderCount: 310, returnCount: 38, returnRate: 12.26, returnCost: 2850 },
  { month: '2024-10', orderCount: 350, returnCount: 45, returnRate: 12.86, returnCost: 3375 },
  { month: '2024-11', orderCount: 420, returnCount: 48, returnRate: 11.43, returnCost: 3600 },
  { month: '2024-12', orderCount: 580, returnCount: 72, returnRate: 12.41, returnCost: 5400 },
  { month: '2025-01', orderCount: 365, returnCount: 42, returnRate: 11.51, returnCost: 3150 },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ReturprocentWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [categories, setCategories] = useState<CategoryReturn[]>([])
  const [monthly, setMonthly] = useState<MonthlyReturn[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [targetInput, setTargetInput] = useState(String(DEFAULT_SETTINGS.targetReturnRate))
  const [costInput, setCostInput] = useState(String(DEFAULT_SETTINGS.avgReturnCost))

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: catData } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'categories').maybeSingle()

    if (catData?.config_value && Array.isArray(catData.config_value) && catData.config_value.length > 0) {
      setCategories(catData.config_value as CategoryReturn[])
    } else {
      setCategories(DEFAULT_CATEGORIES)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'categories', config_value: DEFAULT_CATEGORIES },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: monthlyData } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'monthly').maybeSingle()

    if (monthlyData?.config_value && Array.isArray(monthlyData.config_value)) {
      setMonthly(monthlyData.config_value as MonthlyReturn[])
    } else {
      setMonthly(DEFAULT_MONTHLY)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'monthly', config_value: DEFAULT_MONTHLY },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: settingsData } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'settings').maybeSingle()

    if (settingsData?.config_value) {
      const s = settingsData.config_value as Settings
      setSettings(s)
      setTargetInput(String(s.targetReturnRate))
      setCostInput(String(s.avgReturnCost))
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalOrders = useMemo(() => categories.reduce((s, c) => s + c.orderCount, 0), [categories])
  const totalReturns = useMemo(() => categories.reduce((s, c) => s + c.returnCount, 0), [categories])
  const overallRate = useMemo(() => totalOrders > 0 ? (totalReturns / totalOrders) * 100 : 0, [totalOrders, totalReturns])
  const totalReturnCost = useMemo(() => categories.reduce((s, c) => s + c.returnCost, 0), [categories])
  const variance = settings.targetReturnRate ? overallRate - settings.targetReturnRate : null

  const highestReturnCat = useMemo(() => categories.length > 0 ? categories.reduce((a, b) => a.returnRate > b.returnRate ? a : b) : null, [categories])

  async function handleSaveSettings() {
    setSaving(true)
    const newSettings: Settings = {
      targetReturnRate: parseFloat(targetInput) || 5.0,
      avgReturnCost: parseFloat(costInput) || 75,
    }
    setSettings(newSettings)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'settings', config_value: newSettings },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
    setSaving(false)
  }

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="rapport"
      sectorName="E-handel"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
      actions={
        <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      }
    >
      <Tabs defaultValue="oversikt" className="space-y-6">
        <TabsList>
          <TabsTrigger value="oversikt">Översikt</TabsTrigger>
          <TabsTrigger value="kategori">Per kategori</TabsTrigger>
          <TabsTrigger value="trend">Månadsvy</TabsTrigger>
          <TabsTrigger value="installningar">Inställningar</TabsTrigger>
        </TabsList>

        <TabsContent value="oversikt" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : totalOrders === 0 ? (
            <EmptyModuleState
              icon={RotateCcw}
              title="Ingen data för perioden"
              description="Det finns ingen returdata. Justera datumfiltret eller importera data."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <KPICard
                label="Returandel"
                value={fmtPct(overallRate)}
                unit="%"
                target={settings.targetReturnRate}
                trend={variance != null ? (variance > 2 ? 'down' : variance < -2 ? 'up' : 'neutral') : undefined}
                trendLabel={variance != null ? `${variance > 0 ? '+' : ''}${fmtPct(variance)} pp` : undefined}
              />
              <KPICard label="Totalt ordrar" value={fmt(totalOrders)} unit="st" />
              <KPICard label="Totalt returer" value={fmt(totalReturns)} unit="st" />
              <KPICard label="Returkostnad" value={fmt(totalReturnCost)} unit="kr" />
              <KPICard label="Högsta kategori" value={highestReturnCat ? `${fmtPct(highestReturnCat.returnRate)}%` : '-'} unit={highestReturnCat?.category ?? ''} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="kategori" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Kategori</TableHead>
                      <TableHead className="font-medium text-right">Ordrar</TableHead>
                      <TableHead className="font-medium text-right">Returer</TableHead>
                      <TableHead className="font-medium text-right">Returandel</TableHead>
                      <TableHead className="font-medium text-right">Returkostnad</TableHead>
                      <TableHead className="font-medium">Andel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.sort((a, b) => b.returnRate - a.returnRate).map((c) => (
                      <TableRow key={c.category}>
                        <TableCell className="font-medium">{c.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.orderCount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.returnCount)}</TableCell>
                        <TableCell className={`text-right tabular-nums font-medium ${c.returnRate > settings.targetReturnRate * 2 ? 'text-red-600' : c.returnRate > settings.targetReturnRate ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {fmtPct(c.returnRate)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(c.returnCost)} kr</TableCell>
                        <TableCell>
                          <Progress value={Math.min(c.returnRate, 30) / 30 * 100} className="h-2" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="trend" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">Månad</TableHead>
                    <TableHead className="font-medium text-right">Ordrar</TableHead>
                    <TableHead className="font-medium text-right">Returer</TableHead>
                    <TableHead className="font-medium text-right">Returandel</TableHead>
                    <TableHead className="font-medium text-right">Returkostnad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthly.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>{m.month}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.orderCount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.returnCount)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${m.returnRate > settings.targetReturnRate * 2 ? 'text-red-600' : m.returnRate > settings.targetReturnRate ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {fmtPct(m.returnRate)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.returnCost)} kr</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="installningar" className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
            <h3 className="text-sm font-semibold">Målvärden</h3>
            <p className="text-xs text-muted-foreground">
              Ange målvärde för returandel och genomsnittlig kostnad per retur.
            </p>
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Mål returandel (%)</Label>
                <Input type="number" step="0.1" min={0} max={100} value={targetInput} onChange={(e) => setTargetInput(e.target.value)} className="h-9 w-32" placeholder="5.0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Snitt returkostnad (kr)</Label>
                <Input type="number" step="1" min={0} value={costInput} onChange={(e) => setCostInput(e.target.value)} className="h-9 w-32" placeholder="75" />
              </div>
            </div>
            <Button size="sm" onClick={handleSaveSettings} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Spara
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
