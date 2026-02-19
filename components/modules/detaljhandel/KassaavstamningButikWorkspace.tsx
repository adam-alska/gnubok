'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { StatusBadge } from '@/components/modules/shared/StatusBadge'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  Calculator,
  Loader2,
  Save,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface ZReport {
  totalSales: number
  cardPayments: number
  cashPayments: number
  swish: number
  other: number
}

interface ActualCash {
  countedCash: number
  cashDeposits: number
}

interface BankTransactions {
  cardTerminalAmount: number
}

interface Differences {
  expectedCash: number
  cashDifference: number
  cardDifference: number
  totalDifference: number
}

interface Reconciliation {
  date: string
  zReport: ZReport
  actual: ActualCash
  bank: BankTransactions
  differences: Differences
  notes: string
  status: 'ok' | 'avvikelse'
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtDecimal(n: number): string {
  return new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function getDifferenceColor(diff: number): string {
  const abs = Math.abs(diff)
  if (abs === 0) return 'text-emerald-600'
  if (abs < 50) return 'text-amber-600'
  return 'text-red-600'
}

function getDifferenceBg(diff: number): string {
  const abs = Math.abs(diff)
  if (abs === 0) return 'bg-emerald-500/10 border-emerald-500/20'
  if (abs < 50) return 'bg-amber-500/10 border-amber-500/20'
  return 'bg-red-500/10 border-red-500/20'
}

const EMPTY_Z_REPORT: ZReport = { totalSales: 0, cardPayments: 0, cashPayments: 0, swish: 0, other: 0 }
const EMPTY_ACTUAL: ActualCash = { countedCash: 0, cashDeposits: 0 }
const EMPTY_BANK: BankTransactions = { cardTerminalAmount: 0 }

export function KassaavstamningButikWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState('ny')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [formDate, setFormDate] = useState(todayStr())
  const [zReport, setZReport] = useState<ZReport>({ ...EMPTY_Z_REPORT })
  const [actual, setActual] = useState<ActualCash>({ ...EMPTY_ACTUAL })
  const [bank, setBank] = useState<BankTransactions>({ ...EMPTY_BANK })
  const [notes, setNotes] = useState('')

  const [allDates, setAllDates] = useState<string[]>([])
  const [history, setHistory] = useState<Reconciliation[]>([])
  const [historyMonth, setHistoryMonth] = useState(currentMonthStr())
  const [expandedDate, setExpandedDate] = useState<string | null>(null)

  const expectedCash = zReport.cashPayments - actual.cashDeposits
  const cashDifference = actual.countedCash - expectedCash
  const cardDifference = bank.cardTerminalAmount - zReport.cardPayments
  const totalDifference = cashDifference + cardDifference

  const monthHistory = history.filter((r) => r.date.startsWith(historyMonth))
  const monthTotalSales = monthHistory.reduce((s, r) => s + r.zReport.totalSales, 0)
  const monthAvgDiff = monthHistory.length > 0
    ? monthHistory.reduce((s, r) => s + Math.abs(r.differences.totalDifference), 0) / monthHistory.length
    : 0
  const monthCashTotal = monthHistory.reduce((s, r) => s + r.zReport.cashPayments, 0)
  const monthCardTotal = monthHistory.reduce((s, r) => s + r.zReport.cardPayments, 0)

  const fetchDates = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data } = await supabase
      .from('module_configs')
      .select('config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .eq('config_key', 'kassaavstamning_dates')
      .maybeSingle()
    const dates: string[] = data?.config_value ?? []
    setAllDates(dates)
    return dates
  }, [supabase, sectorSlug, mod.slug])

  const fetchHistory = useCallback(async (dates: string[]) => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    if (dates.length === 0) { setHistory([]); setLoading(false); return }

    const configKeys = dates.map((d) => `kassaavstamning_${d}`)
    const { data } = await supabase
      .from('module_configs')
      .select('config_key, config_value')
      .eq('user_id', user.id)
      .eq('sector_slug', sectorSlug)
      .eq('module_slug', mod.slug)
      .in('config_key', configKeys)

    const reconciliations: Reconciliation[] = (data ?? [])
      .map((row) => row.config_value as Reconciliation)
      .sort((a, b) => b.date.localeCompare(a.date))

    setHistory(reconciliations)
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => {
    fetchDates().then((dates) => fetchHistory(dates))
  }, [fetchDates, fetchHistory])

  async function handleSave() {
    if (!formDate) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const differences: Differences = { expectedCash, cashDifference, cardDifference, totalDifference }
    const status: 'ok' | 'avvikelse' = Math.abs(totalDifference) < 50 ? 'ok' : 'avvikelse'

    const reconciliation: Reconciliation = {
      date: formDate, zReport: { ...zReport }, actual: { ...actual }, bank: { ...bank },
      differences, notes, status,
    }

    await supabase.from('module_configs').upsert({
      user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug,
      config_key: `kassaavstamning_${formDate}`, config_value: reconciliation,
    }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })

    const updatedDates = Array.from(new Set([...allDates, formDate])).sort().reverse()
    await supabase.from('module_configs').upsert({
      user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug,
      config_key: 'kassaavstamning_dates', config_value: updatedDates,
    }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })

    setZReport({ ...EMPTY_Z_REPORT })
    setActual({ ...EMPTY_ACTUAL })
    setBank({ ...EMPTY_BANK })
    setNotes('')
    setFormDate(todayStr())

    const dates = await fetchDates()
    await fetchHistory(dates)
    setSaving(false)
    setActiveTab('historik')
  }

  function numVal(val: string): number {
    const n = parseFloat(val)
    return isNaN(n) ? 0 : n
  }

  function getAvailableMonths(): string[] {
    const months = new Set<string>()
    for (const d of allDates) months.add(d.substring(0, 7))
    months.add(currentMonthStr())
    return Array.from(months).sort().reverse()
  }

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="bokforing"
      sectorName="Detaljhandel"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KPICard label="Total fsg. denna månad" value={fmt(monthTotalSales)} unit="kr" />
        <KPICard label="Snittavvikelse" value={fmtDecimal(monthAvgDiff)} unit="kr"
          trend={monthAvgDiff === 0 ? 'up' : monthAvgDiff < 50 ? 'neutral' : 'down'}
          trendLabel={monthAvgDiff === 0 ? 'Perfekt' : monthAvgDiff < 50 ? 'OK' : 'Hög'} />
        <KPICard label="Kontant totalt" value={fmt(monthCashTotal)} unit="kr" />
        <KPICard label="Kort totalt" value={fmt(monthCardTotal)} unit="kr" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="ny">Ny avstamning</TabsTrigger>
          <TabsTrigger value="historik">Historik</TabsTrigger>
        </TabsList>

        <TabsContent value="ny" className="space-y-6">
          <div className="flex items-center gap-3">
            <Label htmlFor="rec-date" className="text-sm font-medium">Datum</Label>
            <Input id="rec-date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="w-auto" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Z-rapport (kassarapport)</h3>
              </div>
              <Separator />
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Total försäljning (kr)</Label>
                  <Input type="number" step="0.01" value={zReport.totalSales || ''} onChange={(e) => setZReport(z => ({ ...z, totalSales: numVal(e.target.value) }))} placeholder="0" className="h-9" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kortbetalningar (kr)</Label>
                    <Input type="number" step="0.01" value={zReport.cardPayments || ''} onChange={(e) => setZReport(z => ({ ...z, cardPayments: numVal(e.target.value) }))} placeholder="0" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kontant (kr)</Label>
                    <Input type="number" step="0.01" value={zReport.cashPayments || ''} onChange={(e) => setZReport(z => ({ ...z, cashPayments: numVal(e.target.value) }))} placeholder="0" className="h-9" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Swish (kr)</Label>
                    <Input type="number" step="0.01" value={zReport.swish || ''} onChange={(e) => setZReport(z => ({ ...z, swish: numVal(e.target.value) }))} placeholder="0" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Övrigt (kr)</Label>
                    <Input type="number" step="0.01" value={zReport.other || ''} onChange={(e) => setZReport(z => ({ ...z, other: numVal(e.target.value) }))} placeholder="0" className="h-9" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Faktisk kassa</h3>
                </div>
                <Separator />
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Räknad kassa i kassalådan (kr)</Label>
                    <Input type="number" step="0.01" value={actual.countedCash || ''} onChange={(e) => setActual(a => ({ ...a, countedCash: numVal(e.target.value) }))} placeholder="0" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kontantinsättning till bank (kr)</Label>
                    <Input type="number" step="0.01" value={actual.cashDeposits || ''} onChange={(e) => setActual(a => ({ ...a, cashDeposits: numVal(e.target.value) }))} placeholder="0" className="h-9" />
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold">Banktransaktioner</h3>
                <Separator />
                <div className="space-y-1.5">
                  <Label className="text-xs">Kortterminal från bank (kr)</Label>
                  <Input type="number" step="0.01" value={bank.cardTerminalAmount || ''} onChange={(e) => setBank(b => ({ ...b, cardTerminalAmount: numVal(e.target.value) }))} placeholder="0" className="h-9" />
                </div>
              </div>
            </div>
          </div>

          <div className={cn('rounded-xl border p-5 space-y-4', getDifferenceBg(totalDifference))}>
            <h3 className="text-sm font-semibold">Beräknade differenser</h3>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Förväntad kassa</p>
                <p className="text-lg font-semibold tabular-nums">{fmtDecimal(expectedCash)} kr</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Kassadifferens</p>
                <p className={cn('text-lg font-semibold tabular-nums', getDifferenceColor(cashDifference))}>
                  {cashDifference >= 0 ? '+' : ''}{fmtDecimal(cashDifference)} kr
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Kortdifferens</p>
                <p className={cn('text-lg font-semibold tabular-nums', getDifferenceColor(cardDifference))}>
                  {cardDifference >= 0 ? '+' : ''}{fmtDecimal(cardDifference)} kr
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total differens</p>
                <p className={cn('text-xl font-bold tabular-nums', getDifferenceColor(totalDifference))}>
                  {totalDifference >= 0 ? '+' : ''}{fmtDecimal(totalDifference)} kr
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Anteckningar (valfritt)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="T.ex. anledning till differens..." rows={3} />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !formDate || zReport.totalSales === 0}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Spara avstamning
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="historik" className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium">Månad</Label>
            <select value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}
              className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {getAvailableMonths().map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : monthHistory.length === 0 ? (
            <EmptyModuleState
              icon={Calculator}
              title="Inga avstamningar"
              description="Det finns inga kassaavstämningar för den valda månaden."
              actionLabel="Ny avstamning"
              onAction={() => setActiveTab('ny')}
            />
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Datum</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total fsg.</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Kassadiff.</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Kortdiff.</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Totaldiff.</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {monthHistory.map((r) => (
                    <>
                      <tr key={r.date} className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/30"
                        onClick={() => setExpandedDate(expandedDate === r.date ? null : r.date)}>
                        <td className="px-4 py-3 whitespace-nowrap font-medium">{r.date}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(r.zReport.totalSales)} kr</td>
                        <td className={cn('px-4 py-3 text-right tabular-nums', getDifferenceColor(r.differences.cashDifference))}>
                          {r.differences.cashDifference >= 0 ? '+' : ''}{fmtDecimal(r.differences.cashDifference)}
                        </td>
                        <td className={cn('px-4 py-3 text-right tabular-nums', getDifferenceColor(r.differences.cardDifference))}>
                          {r.differences.cardDifference >= 0 ? '+' : ''}{fmtDecimal(r.differences.cardDifference)}
                        </td>
                        <td className={cn('px-4 py-3 text-right tabular-nums font-semibold', getDifferenceColor(r.differences.totalDifference))}>
                          {r.differences.totalDifference >= 0 ? '+' : ''}{fmtDecimal(r.differences.totalDifference)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge label={r.status === 'ok' ? 'OK' : 'Avvikelse'} variant={r.status === 'ok' ? 'success' : 'danger'} />
                        </td>
                        <td className="px-4 py-3">
                          {expandedDate === r.date ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </td>
                      </tr>
                      {expandedDate === r.date && (
                        <tr key={`${r.date}-detail`} className="border-b border-border last:border-0">
                          <td colSpan={7} className="px-4 py-4 bg-muted/20">
                            <div className="grid gap-4 sm:grid-cols-3 text-xs">
                              <div className="space-y-2">
                                <p className="font-semibold text-sm">Z-rapport</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between"><span className="text-muted-foreground">Total fsg:</span><span className="tabular-nums">{fmt(r.zReport.totalSales)} kr</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Kort:</span><span className="tabular-nums">{fmt(r.zReport.cardPayments)} kr</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Kontant:</span><span className="tabular-nums">{fmt(r.zReport.cashPayments)} kr</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Swish:</span><span className="tabular-nums">{fmt(r.zReport.swish)} kr</span></div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <p className="font-semibold text-sm">Faktisk kassa & bank</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between"><span className="text-muted-foreground">Räknad kassa:</span><span className="tabular-nums">{fmt(r.actual.countedCash)} kr</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Insättning:</span><span className="tabular-nums">{fmt(r.actual.cashDeposits)} kr</span></div>
                                  <div className="flex justify-between"><span className="text-muted-foreground">Kortterminal:</span><span className="tabular-nums">{fmt(r.bank.cardTerminalAmount)} kr</span></div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <p className="font-semibold text-sm">Differenser</p>
                                <div className="space-y-1">
                                  <div className="flex justify-between"><span className="text-muted-foreground">Total diff:</span>
                                    <span className={cn('tabular-nums font-semibold', getDifferenceColor(r.differences.totalDifference))}>{r.differences.totalDifference >= 0 ? '+' : ''}{fmtDecimal(r.differences.totalDifference)} kr</span>
                                  </div>
                                </div>
                                {r.notes && (
                                  <div className="mt-2 pt-2 border-t border-border">
                                    <p className="text-muted-foreground">Anteckningar:</p>
                                    <p className="mt-0.5">{r.notes}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
