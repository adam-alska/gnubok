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
import { Badge } from '@/components/ui/badge'
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
  ShoppingCart,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ChannelAOV {
  channel: string
  orders: number
  revenue: number
  aov: number
}

interface MonthlyAOV {
  month: string
  orders: number
  revenue: number
  aov: number
}

interface CampaignEffect {
  campaign: string
  period: string
  orders: number
  aov: number
  uplift: number
}

interface Settings {
  targetAOV: number
}

const DEFAULT_SETTINGS: Settings = { targetAOV: 650 }

const DEFAULT_CHANNELS: ChannelAOV[] = [
  { channel: 'Webbshop', orders: 1200, revenue: 840000, aov: 700 },
  { channel: 'Shopify POS', orders: 180, revenue: 108000, aov: 600 },
  { channel: 'Instagram Shop', orders: 95, revenue: 47500, aov: 500 },
  { channel: 'Facebook Marketplace', orders: 60, revenue: 33000, aov: 550 },
  { channel: 'Amazon', orders: 45, revenue: 31500, aov: 700 },
]

const DEFAULT_MONTHLY: MonthlyAOV[] = [
  { month: '2024-08', orders: 250, revenue: 162500, aov: 650 },
  { month: '2024-09', orders: 280, revenue: 189000, aov: 675 },
  { month: '2024-10', orders: 310, revenue: 217000, aov: 700 },
  { month: '2024-11', orders: 420, revenue: 315000, aov: 750 },
  { month: '2024-12', orders: 520, revenue: 416000, aov: 800 },
  { month: '2025-01', orders: 310, revenue: 201500, aov: 650 },
]

const DEFAULT_CAMPAIGNS: CampaignEffect[] = [
  { campaign: 'Black Friday 2024', period: '2024-11-29 – 2024-12-01', orders: 180, aov: 890, uplift: 28.5 },
  { campaign: 'Julkampanj 2024', period: '2024-12-10 – 2024-12-23', orders: 250, aov: 820, uplift: 18.3 },
  { campaign: 'Nyårsrea 2025', period: '2025-01-02 – 2025-01-10', orders: 90, aov: 580, uplift: -10.8 },
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

export function GenomsnittligtOrdervardeWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [channels, setChannels] = useState<ChannelAOV[]>([])
  const [monthly, setMonthly] = useState<MonthlyAOV[]>([])
  const [campaigns, setCampaigns] = useState<CampaignEffect[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [targetInput, setTargetInput] = useState(String(DEFAULT_SETTINGS.targetAOV))

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const fetchConfig = async (key: string) => {
      const { data } = await supabase
        .from('module_configs').select('config_value')
        .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug)
        .eq('config_key', key).maybeSingle()
      return data?.config_value
    }

    const seedConfig = async (key: string, value: unknown) => {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: key, config_value: value },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }

    const chData = await fetchConfig('channels')
    if (chData && Array.isArray(chData) && chData.length > 0) {
      setChannels(chData as ChannelAOV[])
    } else {
      setChannels(DEFAULT_CHANNELS)
      await seedConfig('channels', DEFAULT_CHANNELS)
    }

    const mData = await fetchConfig('monthly')
    if (mData && Array.isArray(mData)) {
      setMonthly(mData as MonthlyAOV[])
    } else {
      setMonthly(DEFAULT_MONTHLY)
      await seedConfig('monthly', DEFAULT_MONTHLY)
    }

    const campData = await fetchConfig('campaigns')
    if (campData && Array.isArray(campData)) {
      setCampaigns(campData as CampaignEffect[])
    } else {
      setCampaigns(DEFAULT_CAMPAIGNS)
      await seedConfig('campaigns', DEFAULT_CAMPAIGNS)
    }

    const sData = await fetchConfig('settings')
    if (sData) {
      const s = sData as Settings
      setSettings(s)
      setTargetInput(String(s.targetAOV))
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const totalOrders = useMemo(() => channels.reduce((s, c) => s + c.orders, 0), [channels])
  const totalRevenue = useMemo(() => channels.reduce((s, c) => s + c.revenue, 0), [channels])
  const overallAOV = useMemo(() => totalOrders > 0 ? totalRevenue / totalOrders : 0, [totalOrders, totalRevenue])
  const variance = settings.targetAOV ? overallAOV - settings.targetAOV : null
  const highestChannel = useMemo(() => channels.length > 0 ? channels.reduce((a, b) => a.aov > b.aov ? a : b) : null, [channels])
  const latestMonthTrend = useMemo(() => {
    if (monthly.length < 2) return null
    const last = monthly[monthly.length - 1]
    const prev = monthly[monthly.length - 2]
    return ((last.aov - prev.aov) / prev.aov) * 100
  }, [monthly])

  async function handleSaveSettings() {
    setSaving(true)
    const newSettings: Settings = { targetAOV: parseFloat(targetInput) || 650 }
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
          <TabsTrigger value="kanaler">Per kanal</TabsTrigger>
          <TabsTrigger value="trend">Månadsvy</TabsTrigger>
          <TabsTrigger value="kampanjer">Kampanjeffekt</TabsTrigger>
          <TabsTrigger value="installningar">Inställningar</TabsTrigger>
        </TabsList>

        <TabsContent value="oversikt" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : totalOrders === 0 ? (
            <EmptyModuleState
              icon={ShoppingCart}
              title="Ingen orderdata"
              description="Det finns ingen orderdata för vald period."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <KPICard
                label="Snitt ordervärde"
                value={fmt(overallAOV)}
                unit="kr"
                target={settings.targetAOV}
                trend={variance != null ? (variance > 50 ? 'up' : variance < -50 ? 'down' : 'neutral') : undefined}
                trendLabel={variance != null ? `${variance > 0 ? '+' : ''}${fmt(variance)} kr` : undefined}
              />
              <KPICard label="Totala ordrar" value={fmt(totalOrders)} unit="st" />
              <KPICard label="Total omsättning" value={fmt(totalRevenue)} unit="kr" />
              <KPICard label="Bästa kanal" value={highestChannel ? fmt(highestChannel.aov) : '-'} unit={highestChannel ? `kr (${highestChannel.channel})` : ''} />
              <KPICard
                label="Månadstrend"
                value={latestMonthTrend != null ? `${latestMonthTrend > 0 ? '+' : ''}${fmtPct(latestMonthTrend)}` : '-'}
                unit="%"
                trend={latestMonthTrend != null ? (latestMonthTrend > 0 ? 'up' : latestMonthTrend < 0 ? 'down' : 'neutral') : undefined}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="kanaler" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">Kanal</TableHead>
                    <TableHead className="font-medium text-right">Ordrar</TableHead>
                    <TableHead className="font-medium text-right">Omsättning</TableHead>
                    <TableHead className="font-medium text-right">Snitt ordervärde</TableHead>
                    <TableHead className="font-medium">Andel omsättning</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channels.sort((a, b) => b.revenue - a.revenue).map((c) => (
                    <TableRow key={c.channel}>
                      <TableCell className="font-medium">{c.channel}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.orders)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.revenue)} kr</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${c.aov >= settings.targetAOV ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {fmt(c.aov)} kr
                      </TableCell>
                      <TableCell>
                        <Progress value={totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0} className="h-2" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                    <TableHead className="font-medium text-right">Omsättning (kr)</TableHead>
                    <TableHead className="font-medium text-right">Snitt ordervärde (kr)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthly.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>{m.month}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.orders)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(m.revenue)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${m.aov >= settings.targetAOV ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {fmt(m.aov)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="kampanjer" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns.length === 0 ? (
            <EmptyModuleState
              icon={ShoppingCart}
              title="Inga kampanjer"
              description="Det finns ingen kampanjdata."
            />
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">Kampanj</TableHead>
                    <TableHead className="font-medium">Period</TableHead>
                    <TableHead className="font-medium text-right">Ordrar</TableHead>
                    <TableHead className="font-medium text-right">AOV (kr)</TableHead>
                    <TableHead className="font-medium text-right">Förändring</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => (
                    <TableRow key={c.campaign}>
                      <TableCell className="font-medium">{c.campaign}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{c.period}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(c.orders)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmt(c.aov)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${c.uplift >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {c.uplift >= 0 ? '+' : ''}{fmtPct(c.uplift)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="installningar" className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
            <h3 className="text-sm font-semibold">Målvärde AOV</h3>
            <p className="text-xs text-muted-foreground">
              Ange målvärde för genomsnittligt ordervärde (AOV).
            </p>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Mål (kr)</Label>
                <Input type="number" step="10" min={0} value={targetInput} onChange={(e) => setTargetInput(e.target.value)} className="h-9 w-32" placeholder="650" />
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
