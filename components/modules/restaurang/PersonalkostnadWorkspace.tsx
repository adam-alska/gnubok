'use client'

import { useEffect, useState, useCallback } from 'react'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { DateRangeFilter } from '@/components/modules/shared/DateRangeFilter'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { Users, Save, Loader2 } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface LineRow {
  account_number: string
  debit: number
  credit: number
  journal_entries: { date: string }
}

interface MonthlyRow {
  month: string
  staffCost: number
  revenue: number
  staffCostPct: number
}

interface AccountBreakdown {
  account_number: string
  total_debit: number
  pct_of_total: number
}

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return isFinite(n) ? n.toFixed(1) : '0.0'
}

export function PersonalkostnadWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()

  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [staffCost, setStaffCost] = useState(0)
  const [revenue, setRevenue] = useState(0)
  const [target, setTarget] = useState<number | null>(null)
  const [targetInput, setTargetInput] = useState('')
  const [breakdown, setBreakdown] = useState<AccountBreakdown[]>([])
  const [monthly, setMonthly] = useState<MonthlyRow[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Fetch personnel cost lines (accounts 7000-7699)
    const { data: staffLines } = await supabase
      .from('journal_entry_lines')
      .select('account_number, debit, credit, journal_entries!inner(date)')
      .like('account_number', '7%')
      .gte('account_number', '7000')
      .lte('account_number', '7699')
      .gte('journal_entries.date', from)
      .lte('journal_entries.date', to) as { data: LineRow[] | null }

    // Fetch revenue lines (accounts 3000-3999)
    const { data: revenueLines } = await supabase
      .from('journal_entry_lines')
      .select('account_number, debit, credit, journal_entries!inner(date)')
      .like('account_number', '3%')
      .gte('journal_entries.date', from)
      .lte('journal_entries.date', to) as { data: LineRow[] | null }

    const totalStaff = (staffLines ?? []).reduce((s, l) => s + Number(l.debit), 0)
    const totalRevenue = (revenueLines ?? []).reduce((s, l) => s + Number(l.credit), 0)
    setStaffCost(totalStaff)
    setRevenue(totalRevenue)

    // Breakdown by account
    const acctMap: Record<string, number> = {}
    for (const l of staffLines ?? []) {
      acctMap[l.account_number] = (acctMap[l.account_number] ?? 0) + Number(l.debit)
    }
    const bd: AccountBreakdown[] = Object.entries(acctMap)
      .map(([account_number, total_debit]) => ({
        account_number,
        total_debit,
        pct_of_total: totalStaff > 0 ? (total_debit / totalStaff) * 100 : 0,
      }))
      .sort((a, b) => b.total_debit - a.total_debit)
    setBreakdown(bd)

    // Monthly trend (last 6 months)
    const now = new Date()
    const months: MonthlyRow[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      const mEndStr = `${mEnd.getFullYear()}-${String(mEnd.getMonth() + 1).padStart(2, '0')}-${String(mEnd.getDate()).padStart(2, '0')}`

      const { data: mStaff } = await supabase
        .from('journal_entry_lines')
        .select('debit, journal_entries!inner(date)')
        .like('account_number', '7%')
        .gte('account_number', '7000')
        .lte('account_number', '7699')
        .gte('journal_entries.date', mStart)
        .lte('journal_entries.date', mEndStr) as { data: { debit: number }[] | null }

      const { data: mRev } = await supabase
        .from('journal_entry_lines')
        .select('credit, journal_entries!inner(date)')
        .like('account_number', '3%')
        .gte('journal_entries.date', mStart)
        .lte('journal_entries.date', mEndStr) as { data: { credit: number }[] | null }

      const ms = (mStaff ?? []).reduce((s, l) => s + Number(l.debit), 0)
      const mr = (mRev ?? []).reduce((s, l) => s + Number(l.credit), 0)

      months.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        staffCost: ms,
        revenue: mr,
        staffCostPct: mr > 0 ? (ms / mr) * 100 : 0,
      })
    }
    setMonthly(months)

    // Fetch target
    const { data: tgt } = await supabase
      .from('module_kpi_targets')
      .select('value')
      .eq('sector_slug', 'restaurang')
      .eq('module_slug', 'personalkostnad-vs-omsattning')
      .eq('kpi_key', 'staff_cost_target')
      .maybeSingle()

    if (tgt?.value != null) {
      setTarget(Number(tgt.value))
      setTargetInput(String(tgt.value))
    }

    setLoading(false)
  }, [from, to, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSaveTarget = async () => {
    const val = parseFloat(targetInput)
    if (isNaN(val)) return
    setSaving(true)
    await supabase.from('module_kpi_targets').upsert(
      {
        sector_slug: 'restaurang',
        module_slug: 'personalkostnad-vs-omsattning',
        kpi_key: 'staff_cost_target',
        value: val,
      },
      { onConflict: 'sector_slug,module_slug,kpi_key' }
    )
    setTarget(val)
    setSaving(false)
  }

  const staffCostPct = revenue > 0 ? (staffCost / revenue) * 100 : 0
  const variance = target != null ? staffCostPct - target : null

  return (
    <ModuleWorkspaceShell
      title={mod.name}
      description={mod.desc}
      category="rapport"
      sectorName="Restaurang"
      backHref={`/m/${sectorSlug}`}
      settingsHref={settingsHref}
      actions={
        <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      }
    >
      <Tabs defaultValue="oversikt" className="space-y-6">
        <TabsList>
          <TabsTrigger value="oversikt">Översikt</TabsTrigger>
          <TabsTrigger value="trend">Månadsvy</TabsTrigger>
          <TabsTrigger value="breakdown">Kontouppdelning</TabsTrigger>
          <TabsTrigger value="installningar">Inställningar</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="oversikt" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : revenue === 0 && staffCost === 0 ? (
            <EmptyModuleState
              icon={Users}
              title="Ingen data för perioden"
              description="Det finns inga bokförda transaktioner för vald period. Justera datumfiltret eller importera transaktioner."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard
                label="Personalkostnad %"
                value={fmtPct(staffCostPct)}
                unit="%"
                target={target ?? undefined}
                trend={
                  variance == null
                    ? undefined
                    : variance > 2
                      ? 'down'
                      : variance < -2
                        ? 'up'
                        : 'neutral'
                }
                trendLabel={variance != null ? `${variance > 0 ? '+' : ''}${fmtPct(variance)} pp` : undefined}
              />
              <KPICard
                label="Målvärde"
                value={target != null ? fmtPct(target) : '30-35'}
                unit="%"
              />
              <KPICard label="Personalkostnad" value={fmt(staffCost)} unit="kr" />
              <KPICard label="Total omsättning" value={fmt(revenue)} unit="kr" />
            </div>
          )}
        </TabsContent>

        {/* Monthly trend */}
        <TabsContent value="trend" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Månad</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Personalkostnad (kr)</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Omsättning (kr)</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Andel %</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m) => (
                    <tr key={m.month} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">{m.month}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(m.staffCost)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(m.revenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {fmtPct(m.staffCostPct)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Account breakdown */}
        <TabsContent value="breakdown" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : breakdown.length === 0 ? (
            <EmptyModuleState
              icon={Users}
              title="Ingen kontodata"
              description="Inga personalkonton med aktivitet i vald period."
            />
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Konto</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Debet (kr)</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Andel %</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((b) => (
                    <tr key={b.account_number} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono">{b.account_number}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(b.total_debit)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPct(b.pct_of_total)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Settings */}
        <TabsContent value="installningar" className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
            <h3 className="text-sm font-semibold">Målvärde personalkostnad %</h3>
            <p className="text-xs text-muted-foreground">
              Ange ditt målvärde för personalkostnad i procent av omsättning. Typiskt 30-35% för restaurang.
            </p>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Mål (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="h-9 w-32"
                  placeholder="32.0"
                />
              </div>
              <Button size="sm" onClick={handleSaveTarget} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-2 h-3.5 w-3.5" />
                )}
                Spara
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
