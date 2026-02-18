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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  Save,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface KlarnaPayout {
  id: string
  payoutDate: string
  period: string
  grossAmount: number
  feeAmount: number
  netPayout: number
  orderCount: number
  status: 'Importerad' | 'Matchad' | 'Avvikelse'
}

interface Settings {
  grossAccount: string
  feeAccount: string
  payoutAccount: string
}

const DEFAULT_SETTINGS: Settings = {
  grossAccount: '1580',
  feeAccount: '6593',
  payoutAccount: '1930',
}

const DEFAULT_PAYOUTS: KlarnaPayout[] = [
  { id: '1', payoutDate: '2025-01-15', period: '2025-01-01 – 2025-01-14', grossAmount: 45800, feeAmount: 1374, netPayout: 44426, orderCount: 32, status: 'Matchad' },
  { id: '2', payoutDate: '2025-01-01', period: '2024-12-16 – 2024-12-31', grossAmount: 89200, feeAmount: 2676, netPayout: 86524, orderCount: 68, status: 'Matchad' },
  { id: '3', payoutDate: '2024-12-16', period: '2024-12-01 – 2024-12-15', grossAmount: 62500, feeAmount: 1875, netPayout: 60625, orderCount: 45, status: 'Avvikelse' },
  { id: '4', payoutDate: '2024-12-01', period: '2024-11-16 – 2024-11-30', grossAmount: 38900, feeAmount: 1167, netPayout: 37733, orderCount: 28, status: 'Matchad' },
]

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(2) : '0.00'
}

const STATUS_VARIANTS: Record<string, 'success' | 'info' | 'warning'> = {
  'Importerad': 'info',
  'Matchad': 'success',
  'Avvikelse': 'warning',
}

export function KlarnaRapportImportWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [payouts, setPayouts] = useState<KlarnaPayout[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [searchQuery, setSearchQuery] = useState('')

  const [grossAccountInput, setGrossAccountInput] = useState(DEFAULT_SETTINGS.grossAccount)
  const [feeAccountInput, setFeeAccountInput] = useState(DEFAULT_SETTINGS.feeAccount)
  const [payoutAccountInput, setPayoutAccountInput] = useState(DEFAULT_SETTINGS.payoutAccount)

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

    const pData = await fetchConfig('klarna_payouts')
    if (pData && Array.isArray(pData) && pData.length > 0) {
      setPayouts(pData as KlarnaPayout[])
    } else {
      setPayouts(DEFAULT_PAYOUTS)
      await seedConfig('klarna_payouts', DEFAULT_PAYOUTS)
    }

    const sData = await fetchConfig('settings')
    if (sData) {
      const s = sData as Settings
      setSettings(s)
      setGrossAccountInput(s.grossAccount)
      setFeeAccountInput(s.feeAccount)
      setPayoutAccountInput(s.payoutAccount)
    }

    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredPayouts = useMemo(() => {
    if (!searchQuery.trim()) return payouts.sort((a, b) => b.payoutDate.localeCompare(a.payoutDate))
    const q = searchQuery.toLowerCase()
    return payouts.filter((p) => p.period.toLowerCase().includes(q) || p.payoutDate.includes(q)).sort((a, b) => b.payoutDate.localeCompare(a.payoutDate))
  }, [payouts, searchQuery])

  const totalGross = useMemo(() => payouts.reduce((s, p) => s + p.grossAmount, 0), [payouts])
  const totalFees = useMemo(() => payouts.reduce((s, p) => s + p.feeAmount, 0), [payouts])
  const totalNet = useMemo(() => payouts.reduce((s, p) => s + p.netPayout, 0), [payouts])
  const avgFeePct = useMemo(() => totalGross > 0 ? (totalFees / totalGross) * 100 : 0, [totalGross, totalFees])
  const deviationCount = useMemo(() => payouts.filter((p) => p.status === 'Avvikelse').length, [payouts])

  async function handleFileSelect(file: File) {
    const text = await file.text()
    const lines = text.split('\n').filter((l) => l.trim())
    if (lines.length < 2) return

    const newPayouts: KlarnaPayout[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim())
      if (cols.length < 4) continue

      const gross = parseFloat(cols[2]) || 0
      const fee = parseFloat(cols[3]) || 0

      newPayouts.push({
        id: `${Date.now()}-${i}`,
        payoutDate: cols[0] || new Date().toISOString().slice(0, 10),
        period: cols[1] || '',
        grossAmount: gross,
        feeAmount: fee,
        netPayout: gross - fee,
        orderCount: parseInt(cols[4], 10) || 0,
        status: 'Importerad',
      })
    }

    const updated = [...newPayouts, ...payouts]
    setPayouts(updated)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('module_configs').upsert(
        { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'klarna_payouts', config_value: updated },
        { onConflict: 'user_id,sector_slug,module_slug,config_key' }
      )
    }
  }

  async function handleSaveSettings() {
    setSaving(true)
    const newSettings: Settings = {
      grossAccount: grossAccountInput,
      feeAccount: feeAccountInput,
      payoutAccount: payoutAccountInput,
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
      category="import"
      sectorName="E-handel"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
    >
      <Tabs defaultValue="import" className="space-y-6">
        <TabsList>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="utbetalningar">Utbetalningar ({payouts.length})</TabsTrigger>
          <TabsTrigger value="installningar">Inställningar</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KPICard label="Total brutto" value={fmt(totalGross)} unit="kr" />
            <KPICard label="Klarna-avgifter" value={fmt(totalFees)} unit="kr" trend="down" trendLabel={`${fmtPct(avgFeePct)}%`} />
            <KPICard label="Netto utbetalat" value={fmt(totalNet)} unit="kr" />
            <KPICard label="Utbetalningar" value={String(payouts.length)} unit="st" />
            <KPICard label="Avvikelser" value={String(deviationCount)} unit="st" trend={deviationCount > 0 ? 'down' : 'neutral'} />
          </div>

          <ImportDropzone
            accept=".csv"
            onFileSelect={handleFileSelect}
            label="Dra och släpp Klarna-rapport"
            description="CSV: datum, period, brutto, avgift, antal ordrar"
          />
        </TabsContent>

        <TabsContent value="utbetalningar" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Sök period eller datum..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>

              {filteredPayouts.length === 0 ? (
                <EmptyModuleState icon={FileUp} title="Inga utbetalningar" description="Importera Klarna-rapporter." />
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-medium">Utbetalningsdatum</TableHead>
                        <TableHead className="font-medium">Period</TableHead>
                        <TableHead className="font-medium text-right">Brutto</TableHead>
                        <TableHead className="font-medium text-right">Avgift</TableHead>
                        <TableHead className="font-medium text-right">Netto</TableHead>
                        <TableHead className="font-medium text-right">Ordrar</TableHead>
                        <TableHead className="font-medium text-right">Avgift %</TableHead>
                        <TableHead className="font-medium">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayouts.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.payoutDate}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{p.period}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(p.grossAmount)} kr</TableCell>
                          <TableCell className="text-right tabular-nums text-red-600">{fmt(p.feeAmount)} kr</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmt(p.netPayout)} kr</TableCell>
                          <TableCell className="text-right tabular-nums">{p.orderCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtPct(p.grossAmount > 0 ? (p.feeAmount / p.grossAmount) * 100 : 0)}%</TableCell>
                          <TableCell><StatusBadge label={p.status} variant={STATUS_VARIANTS[p.status]} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="installningar" className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
            <h3 className="text-sm font-semibold">Klarna-bokföringskonton</h3>
            <p className="text-xs text-muted-foreground">
              Konton för brutto (Klarna-fordran), avgift och netto-utbetalning.
            </p>
            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm w-36">Brutto (fordran)</span>
                <Input value={grossAccountInput} onChange={(e) => setGrossAccountInput(e.target.value)} className="h-8 w-24 font-mono" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm w-36">Avgift (kostnad)</span>
                <Input value={feeAccountInput} onChange={(e) => setFeeAccountInput(e.target.value)} className="h-8 w-24 font-mono" />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm w-36">Utbetalning (bank)</span>
                <Input value={payoutAccountInput} onChange={(e) => setPayoutAccountInput(e.target.value)} className="h-8 w-24 font-mono" />
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
