'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { KPICard } from '@/components/modules/shared/KPICard'
import { ImportDropzone } from '@/components/modules/shared/ImportDropzone'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
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
  Search,
  FileUp,
  Truck,
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ShippingCostEntry {
  id: string
  date: string
  carrier: string
  trackingId: string
  orderId: string
  weight: number
  cost: number
  zone: string
  status: 'Importerad' | 'Allokerad' | 'Avvikelse'
}

interface Settings {
  costAccount: string
}

const DEFAULT_SETTINGS: Settings = { costAccount: '5710' }

const CARRIERS = ['PostNord', 'DHL', 'Budbee', 'Instabox', 'DB Schenker']

const DEFAULT_ENTRIES: ShippingCostEntry[] = [
  { id: '1', date: '2025-01-15', carrier: 'PostNord', trackingId: 'PN-98765432', orderId: 'ORD-3001', weight: 0.8, cost: 45, zone: 'Zon 1', status: 'Allokerad' },
  { id: '2', date: '2025-01-15', carrier: 'DHL', trackingId: 'DHL-12345678', orderId: 'ORD-3002', weight: 2.5, cost: 62, zone: 'Zon 2', status: 'Allokerad' },
  { id: '3', date: '2025-01-14', carrier: 'Budbee', trackingId: 'BB-55443322', orderId: 'ORD-3003', weight: 0.5, cost: 38, zone: 'Stockholm', status: 'Allokerad' },
  { id: '4', date: '2025-01-14', carrier: 'PostNord', trackingId: 'PN-11223344', orderId: 'ORD-3004', weight: 4.2, cost: 55, zone: 'Zon 1', status: 'Importerad' },
  { id: '5', date: '2025-01-13', carrier: 'DHL', trackingId: 'DHL-87654321', orderId: 'ORD-3006', weight: 8.0, cost: 72, zone: 'Zon 3', status: 'Avvikelse' },
  { id: '6', date: '2025-01-13', carrier: 'Instabox', trackingId: 'IB-33221100', orderId: 'ORD-3005', weight: 1.2, cost: 48, zone: 'Göteborg', status: 'Allokerad' },
  { id: '7', date: '2025-01-12', carrier: 'PostNord', trackingId: 'PN-99887766', orderId: 'ORD-3007', weight: 0.3, cost: 42, zone: 'Zon 1', status: 'Allokerad' },
  { id: '8', date: '2025-01-12', carrier: 'DB Schenker', trackingId: 'SC-44556677', orderId: 'ORD-3008', weight: 15.0, cost: 85, zone: 'Zon 2', status: 'Allokerad' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n)
}

const STATUS_VARIANTS: Record<string, 'success' | 'info' | 'warning'> = {
  'Importerad': 'info',
  'Allokerad': 'success',
  'Avvikelse': 'warning',
}

export function FraktrapportImportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [entries, setEntries] = useState<ShippingCostEntry[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCarrier, setFilterCarrier] = useState('all')
  const [costAccountInput, setCostAccountInput] = useState(DEFAULT_SETTINGS.costAccount)

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

    const eData = await fetchConfig('shipping_cost_entries')
    if (eData && Array.isArray(eData) && eData.length > 0) {
      setEntries(eData as ShippingCostEntry[])
    } else {
      setEntries(DEFAULT_ENTRIES)
      await seedConfig('shipping_cost_entries', DEFAULT_ENTRIES)
    }

    const sData = await fetchConfig('settings')
    if (sData) {
      const s = sData as Settings
      setSettings(s)
      setCostAccountInput(s.costAccount)
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredEntries = useMemo(() => {
    let result = entries
    if (filterCarrier !== 'all') result = result.filter((e) => e.carrier === filterCarrier)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) => e.trackingId.toLowerCase().includes(q) || e.orderId.toLowerCase().includes(q) || e.carrier.toLowerCase().includes(q))
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [entries, filterCarrier, searchQuery])

  const totalCost = useMemo(() => entries.reduce((s, e) => s + e.cost, 0), [entries])
  const totalWeight = useMemo(() => entries.reduce((s, e) => s + e.weight, 0), [entries])
  const avgCostPerKg = useMemo(() => totalWeight > 0 ? totalCost / totalWeight : 0, [totalCost, totalWeight])

  const carrierBreakdown = useMemo(() => {
    const map: Record<string, { cost: number; count: number; weight: number }> = {}
    for (const e of entries) {
      if (!map[e.carrier]) map[e.carrier] = { cost: 0, count: 0, weight: 0 }
      map[e.carrier].cost += e.cost
      map[e.carrier].count++
      map[e.carrier].weight += e.weight
    }
    return Object.entries(map).map(([carrier, d]) => ({
      carrier,
      totalCost: d.cost,
      count: d.count,
      totalWeight: d.weight,
      avgCost: d.count > 0 ? d.cost / d.count : 0,
    })).sort((a, b) => b.totalCost - a.totalCost)
  }, [entries])

  async function handleFileSelect(file: File) {
    const text = await file.text()
    const lines = text.split('\n').filter((l) => l.trim())
    if (lines.length < 2) return

    const newEntries: ShippingCostEntry[] = []
    const carrier = file.name.toLowerCase().includes('postnord') ? 'PostNord'
      : file.name.toLowerCase().includes('dhl') ? 'DHL'
      : file.name.toLowerCase().includes('budbee') ? 'Budbee'
      : 'Övrigt'

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim())
      if (cols.length < 3) continue

      newEntries.push({
        id: `${Date.now()}-${i}`,
        date: cols[0] || new Date().toISOString().slice(0, 10),
        carrier,
        trackingId: cols[1] || `IMP-${i}`,
        orderId: cols[2] || '',
        weight: parseFloat(cols[3]) || 0,
        cost: parseFloat(cols[4]) || 0,
        zone: cols[5] || 'Okänd',
        status: 'Importerad',
      })
    }

    const updated = [...newEntries, ...entries]
    setEntries(updated)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'shipping_cost_entries', config_value: updated },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
  }

  async function handleAllocateAll() {
    const updated = entries.map((e) => e.status === 'Importerad' ? { ...e, status: 'Allokerad' as const } : e)
    setEntries(updated)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'shipping_cost_entries', config_value: updated },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
  }

  async function handleSaveSettings() {
    setSaving(true)
    const newSettings: Settings = { costAccount: costAccountInput }
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

  const pendingAllocation = useMemo(() => entries.filter((e) => e.status === 'Importerad').length, [entries])

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="import"
      sectorName="E-handel"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
      actions={
        pendingAllocation > 0 ? (
          <Button onClick={handleAllocateAll}>
            Allokera {pendingAllocation} poster
          </Button>
        ) : undefined
      }
    >
      <Tabs defaultValue="import" className="space-y-6">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="poster">Fraktposter ({entries.length})</TabsTrigger>
          <TabsTrigger value="transportor">Per transportör</TabsTrigger>
          <TabsTrigger value="installningar">Inställningar</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard label="Total fraktkostnad" value={fmt(totalCost)} unit="kr" />
            <KPICard label="Antal poster" value={String(entries.length)} unit="st" />
            <KPICard label="Total vikt" value={fmt(totalWeight)} unit="kg" />
            <KPICard label="Snitt kr/kg" value={fmt(avgCostPerKg)} unit="kr/kg" />
          </div>

          <ImportDropzone
            accept=".csv,.xlsx,.xls"
            onFileSelect={handleFileSelect}
            label="Dra och släpp fraktrapport"
            description="PostNord/DHL/Budbee CSV: datum, tracking, order-id, vikt, kostnad, zon"
          />
        </TabsContent>

        <TabsContent value="poster" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Sök tracking, order eller transportör..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
              </div>

              {filteredEntries.length === 0 ? (
                <EmptyModuleState icon={Truck} title="Inga fraktposter" description="Importera fraktrapporter för att komma igång." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Datum</TableHead>
                        <TableHead className="font-medium">Transportör</TableHead>
                        <TableHead className="font-medium">Tracking</TableHead>
                        <TableHead className="font-medium">Order-ID</TableHead>
                        <TableHead className="font-medium text-right">Vikt (kg)</TableHead>
                        <TableHead className="font-medium text-right">Kostnad</TableHead>
                        <TableHead className="font-medium">Zon</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-muted-foreground">{e.date}</TableCell>
                          <TableCell><Badge variant="outline">{e.carrier}</Badge></TableCell>
                          <TableCell className="font-mono text-sm">{e.trackingId}</TableCell>
                          <TableCell className="font-mono">{e.orderId}</TableCell>
                          <TableCell className="text-right tabular-nums">{e.weight.toFixed(1)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(e.cost)} kr</TableCell>
                          <TableCell className="text-muted-foreground">{e.zone}</TableCell>
                          <TableCell><StatusBadge label={e.status} variant={STATUS_VARIANTS[e.status]} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="transportor" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium">Transportör</TableHead>
                    <TableHead className="font-medium text-right">Antal</TableHead>
                    <TableHead className="font-medium text-right">Total kostnad</TableHead>
                    <TableHead className="font-medium text-right">Total vikt</TableHead>
                    <TableHead className="font-medium text-right">Snitt/frakt</TableHead>
                    <TableHead className="font-medium">Andel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carrierBreakdown.map((cb) => (
                    <TableRow key={cb.carrier}>
                      <TableCell className="font-medium">{cb.carrier}</TableCell>
                      <TableCell className="text-right tabular-nums">{cb.count}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmt(cb.totalCost)} kr</TableCell>
                      <TableCell className="text-right tabular-nums">{cb.totalWeight.toFixed(1)} kg</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(cb.avgCost)} kr</TableCell>
                      <TableCell>
                        <Progress value={totalCost > 0 ? (cb.totalCost / totalCost) * 100 : 0} className="h-2" />
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
            <h3 className="text-sm font-semibold">Fraktkostnadskonto</h3>
            <p className="text-xs text-muted-foreground">
              BAS-konto för fraktkostnader (standard 5710).
            </p>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Konto</Label>
                <Input value={costAccountInput} onChange={(e) => setCostAccountInput(e.target.value)} className="h-9 w-32 font-mono" />
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
