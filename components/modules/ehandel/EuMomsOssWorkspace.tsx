'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  Trash2,
  Loader2,
  Search,
  Globe,
  Save,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface EuCountryVat {
  country: string
  countryCode: string
  vatRate: number
  sales: number
  vatCollected: number
  threshold: number
}

interface OssDeclaration {
  id: string
  quarter: string
  year: string
  totalSales: number
  totalVat: number
  status: 'Utkast' | 'Inskickad' | 'Godkänd'
  countries: { countryCode: string; sales: number; vat: number }[]
}

interface Settings {
  ossRegistered: boolean
  yearlyThreshold: number
}

const DEFAULT_SETTINGS: Settings = {
  ossRegistered: true,
  yearlyThreshold: 10000,
}

const DEFAULT_EU_COUNTRIES: EuCountryVat[] = [
  { country: 'Tyskland', countryCode: 'DE', vatRate: 19, sales: 45000, vatCollected: 8550, threshold: 10000 },
  { country: 'Frankrike', countryCode: 'FR', vatRate: 20, sales: 28000, vatCollected: 5600, threshold: 10000 },
  { country: 'Nederländerna', countryCode: 'NL', vatRate: 21, sales: 15000, vatCollected: 3150, threshold: 10000 },
  { country: 'Finland', countryCode: 'FI', vatRate: 24, sales: 12000, vatCollected: 2880, threshold: 10000 },
  { country: 'Danmark', countryCode: 'DK', vatRate: 25, sales: 9500, vatCollected: 2375, threshold: 10000 },
  { country: 'Spanien', countryCode: 'ES', vatRate: 21, sales: 7200, vatCollected: 1512, threshold: 10000 },
  { country: 'Italien', countryCode: 'IT', vatRate: 22, sales: 5800, vatCollected: 1276, threshold: 10000 },
  { country: 'Belgien', countryCode: 'BE', vatRate: 21, sales: 3200, vatCollected: 672, threshold: 10000 },
  { country: 'Polen', countryCode: 'PL', vatRate: 23, sales: 2100, vatCollected: 483, threshold: 10000 },
  { country: 'Irland', countryCode: 'IE', vatRate: 23, sales: 1500, vatCollected: 345, threshold: 10000 },
]

const DEFAULT_DECLARATIONS: OssDeclaration[] = [
  {
    id: '1', quarter: 'Q4', year: '2024', totalSales: 95000, totalVat: 19380, status: 'Godkänd',
    countries: [
      { countryCode: 'DE', sales: 32000, vat: 6080 },
      { countryCode: 'FR', sales: 22000, vat: 4400 },
      { countryCode: 'NL', sales: 12000, vat: 2520 },
      { countryCode: 'FI', sales: 10000, vat: 2400 },
      { countryCode: 'DK', sales: 8000, vat: 2000 },
      { countryCode: 'ES', sales: 6000, vat: 1260 },
      { countryCode: 'IT', sales: 5000, vat: 720 },
    ],
  },
  {
    id: '2', quarter: 'Q1', year: '2025', totalSales: 34300, totalVat: 7843, status: 'Utkast',
    countries: [
      { countryCode: 'DE', sales: 13000, vat: 2470 },
      { countryCode: 'FR', sales: 6000, vat: 1200 },
      { countryCode: 'NL', sales: 3000, vat: 630 },
      { countryCode: 'FI', sales: 2000, vat: 480 },
      { countryCode: 'DK', sales: 1500, vat: 375 },
      { countryCode: 'ES', sales: 1200, vat: 252 },
    ],
  },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

const STATUS_VARIANTS: Record<string, 'info' | 'success' | 'warning'> = {
  'Utkast': 'info',
  'Inskickad': 'warning',
  'Godkänd': 'success',
}

export function EuMomsOssWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [countries, setCountries] = useState<EuCountryVat[]>([])
  const [declarations, setDeclarations] = useState<OssDeclaration[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [searchQuery, setSearchQuery] = useState('')
  const [thresholdInput, setThresholdInput] = useState(String(DEFAULT_SETTINGS.yearlyThreshold))

  const saveCountries = useCallback(async (newCountries: EuCountryVat[]) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'eu_countries', config_value: newCountries },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const saveDeclarations = useCallback(async (newDecls: OssDeclaration[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'declarations', config_value: newDecls },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const saveSettingsToDb = useCallback(async (newSettings: Settings) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'settings', config_value: newSettings },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: countriesData } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'eu_countries').maybeSingle()

    if (countriesData?.config_value && Array.isArray(countriesData.config_value) && countriesData.config_value.length > 0) {
      setCountries(countriesData.config_value as EuCountryVat[])
    } else {
      setCountries(DEFAULT_EU_COUNTRIES)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'eu_countries', config_value: DEFAULT_EU_COUNTRIES },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const { data: declsData } = await supabase
      .from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
      .eq('config_key', 'declarations').maybeSingle()

    if (declsData?.config_value && Array.isArray(declsData.config_value)) {
      setDeclarations(declsData.config_value as OssDeclaration[])
    } else {
      setDeclarations(DEFAULT_DECLARATIONS)
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'declarations', config_value: DEFAULT_DECLARATIONS },
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
      setThresholdInput(String(s.yearlyThreshold))
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return countries.sort((a, b) => b.sales - a.sales)
    const q = searchQuery.toLowerCase()
    return countries.filter((c) => c.country.toLowerCase().includes(q) || c.countryCode.toLowerCase().includes(q)).sort((a, b) => b.sales - a.sales)
  }, [countries, searchQuery])

  const totalEuSales = useMemo(() => countries.reduce((s, c) => s + c.sales, 0), [countries])
  const totalEuVat = useMemo(() => countries.reduce((s, c) => s + c.vatCollected, 0), [countries])
  const countriesAboveThreshold = useMemo(() => countries.filter((c) => c.sales >= c.threshold).length, [countries])
  const nearThresholdCountries = useMemo(() => countries.filter((c) => c.sales >= c.threshold * 0.7 && c.sales < c.threshold), [countries])

  async function handleUpdateCountrySales(countryCode: string, newSales: string) {
    const sales = parseFloat(newSales)
    if (isNaN(sales)) return
    const updated = countries.map((c) => {
      if (c.countryCode !== countryCode) return c
      const vatCollected = sales * (c.vatRate / 100)
      return { ...c, sales, vatCollected }
    })
    setCountries(updated)
    await saveCountries(updated)
  }

  async function handleUpdateDeclarationStatus(id: string, newStatus: OssDeclaration['status']) {
    const updated = declarations.map((d) => d.id === id ? { ...d, status: newStatus } : d)
    setDeclarations(updated)
    await saveDeclarations(updated)
  }

  async function handleSaveSettings() {
    setSaving(true)
    const newSettings: Settings = {
      ...settings,
      yearlyThreshold: parseInt(thresholdInput, 10) || 10000,
    }
    setSettings(newSettings)
    await saveSettingsToDb(newSettings)
    setSaving(false)
  }

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="bokforing"
      sectorName="E-handel"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
    >
      <Tabs defaultValue="oversikt" className="space-y-6">
        <TabsList>
          <TabsTrigger value="oversikt">Översikt</TabsTrigger>
          <TabsTrigger value="lander">Per land</TabsTrigger>
          <TabsTrigger value="deklarationer">OSS-deklarationer</TabsTrigger>
          <TabsTrigger value="installningar">Inställningar</TabsTrigger>
        </TabsList>

        <TabsContent value="oversikt" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Total EU-försäljning" value={fmt(totalEuSales)} unit="kr" />
                <KPICard label="Total EU-moms" value={fmt(totalEuVat)} unit="kr" />
                <KPICard label="Länder över tröskelvärde" value={String(countriesAboveThreshold)} unit="st" />
                <KPICard
                  label="Nära tröskelvärde"
                  value={String(nearThresholdCountries.length)}
                  unit="st"
                  trend={nearThresholdCountries.length > 0 ? 'down' : 'neutral'}
                  trendLabel={nearThresholdCountries.length > 0 ? 'Bevaka' : 'OK'}
                />
              </div>

              {nearThresholdCountries.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-900/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      Tröskelvarning
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Följande länder närmar sig tröskelvärdet ({fmt(settings.yearlyThreshold)} kr):{' '}
                      {nearThresholdCountries.map((c) => `${c.country} (${fmt(c.sales)} kr)`).join(', ')}
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Försäljning per land (topp 5)</h3>
                {countries.sort((a, b) => b.sales - a.sales).slice(0, 5).map((c) => (
                  <div key={c.countryCode} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{c.country} ({c.countryCode})</span>
                      <span className="tabular-nums">{fmt(c.sales)} kr ({c.vatRate}% moms)</span>
                    </div>
                    <Progress value={totalEuSales > 0 ? (c.sales / totalEuSales) * 100 : 0} className="h-2" />
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="lander" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Sök land..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
                {saving && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sparar...
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-medium">Land</TableHead>
                      <TableHead className="font-medium">Kod</TableHead>
                      <TableHead className="font-medium text-right">Momssats</TableHead>
                      <TableHead className="font-medium text-right">Försäljning (kr)</TableHead>
                      <TableHead className="font-medium text-right">Moms (kr)</TableHead>
                      <TableHead className="font-medium text-right">Tröskelvärde</TableHead>
                      <TableHead className="font-medium">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCountries.map((c) => {
                      const pct = (c.sales / c.threshold) * 100
                      return (
                        <TableRow key={c.countryCode}>
                          <TableCell className="font-medium">{c.country}</TableCell>
                          <TableCell><Badge variant="outline">{c.countryCode}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{c.vatRate}%</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              defaultValue={c.sales}
                              className="h-8 w-28 text-right ml-auto"
                              onBlur={(e) => handleUpdateCountrySales(c.countryCode, e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(c.vatCollected)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(c.threshold)}</TableCell>
                          <TableCell>
                            {pct >= 100 ? (
                              <StatusBadge label="Över tröskel" variant="danger" />
                            ) : pct >= 70 ? (
                              <StatusBadge label="Nära tröskel" variant="warning" />
                            ) : (
                              <StatusBadge label="Under tröskel" variant="success" />
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="deklarationer" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : declarations.length === 0 ? (
            <EmptyModuleState
              icon={Globe}
              title="Inga OSS-deklarationer"
              description="Det finns inga OSS-deklarationer ännu."
            />
          ) : (
            <div className="space-y-4">
              {declarations.map((decl) => (
                <Card key={decl.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">{decl.quarter} {decl.year}</CardTitle>
                      <div className="flex items-center gap-2">
                        <StatusBadge label={decl.status} variant={STATUS_VARIANTS[decl.status]} />
                        {decl.status === 'Utkast' && (
                          <Button size="sm" variant="outline" onClick={() => handleUpdateDeclarationStatus(decl.id, 'Inskickad')}>
                            Skicka in
                          </Button>
                        )}
                        {decl.status === 'Inskickad' && (
                          <Button size="sm" variant="outline" onClick={() => handleUpdateDeclarationStatus(decl.id, 'Godkänd')}>
                            Markera godkänd
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Total försäljning</p>
                        <p className="text-lg font-semibold tabular-nums">{fmt(decl.totalSales)} kr</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total moms</p>
                        <p className="text-lg font-semibold tabular-nums">{fmt(decl.totalVat)} kr</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-xs font-medium">Land</TableHead>
                            <TableHead className="text-xs font-medium text-right">Försäljning</TableHead>
                            <TableHead className="text-xs font-medium text-right">Moms</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {decl.countries.map((c) => (
                            <TableRow key={c.countryCode}>
                              <TableCell className="text-sm">{c.countryCode}</TableCell>
                              <TableCell className="text-sm text-right tabular-nums">{fmt(c.sales)} kr</TableCell>
                              <TableCell className="text-sm text-right tabular-nums">{fmt(c.vat)} kr</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="installningar" className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
            <h3 className="text-sm font-semibold">OSS-tröskelvärde</h3>
            <p className="text-xs text-muted-foreground">
              EU:s samlade tröskelvärde för distansförsäljning (standard 10 000 EUR / ca 100 000 SEK sammanlagt).
              Ange i SEK per land.
            </p>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tröskel per land (SEK)</Label>
                <Input
                  type="number"
                  min={0}
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="h-9 w-40"
                />
              </div>
              <Button size="sm" onClick={handleSaveSettings} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                Spara
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
