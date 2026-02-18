'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Loader2, Save, Calculator } from 'lucide-react'

interface ModuleWorkspaceProps {
  module: { slug: string; name: string; cat: string; desc: string; longDesc: string }
  sectorSlug: string
  settingsHref: string
}

interface InterestConfig {
  capitalBase: number
  governmentBondRate: number
  totalBusinessIncome: number
}

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtPct(n: number): string { return n.toFixed(2) }

const DEFAULT_BOND_RATE = 2.62

export function RantefordelningWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<InterestConfig>({ capitalBase: 0, governmentBondRate: DEFAULT_BOND_RATE, totalBusinessIncome: 0 })

  const saveConfig = useCallback(async (cfg: InterestConfig) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert(
      { user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'interest_config', config_value: cfg },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value')
      .eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'interest_config').maybeSingle()
    if (data?.config_value) setConfig(data.config_value as InterestConfig)
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const allocationRate = config.governmentBondRate + 6
  const interestAllocation = Math.round(config.capitalBase * (allocationRate / 100))
  const positiveAllocation = interestAllocation > 0
  const capitalIncome = positiveAllocation ? Math.min(interestAllocation, config.totalBusinessIncome) : 0
  const employmentIncome = config.totalBusinessIncome - capitalIncome

  return (
    <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}>
      <Tabs defaultValue="berakning" className="space-y-6">
        <TabsList><TabsTrigger value="berakning">Beräkning</TabsTrigger><TabsTrigger value="regler">Regler</TabsTrigger></TabsList>

        <TabsContent value="berakning" className="space-y-6">
          {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
            <>
              <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Calculator className="h-4 w-4" />Underlag</h3>
                <div className="grid gap-4">
                  <div className="grid gap-2"><Label>Kapitalunderlag (kr)</Label><Input type="number" value={config.capitalBase || ''} onChange={e => setConfig(c => ({ ...c, capitalBase: parseFloat(e.target.value) || 0 }))} placeholder="500000" /></div>
                  <div className="grid gap-2"><Label>Statslåneränta (%)</Label><Input type="number" step="0.01" value={config.governmentBondRate || ''} onChange={e => setConfig(c => ({ ...c, governmentBondRate: parseFloat(e.target.value) || 0 }))} placeholder="2.62" /></div>
                  <div className="grid gap-2"><Label>Total näringsinkomst (kr)</Label><Input type="number" value={config.totalBusinessIncome || ''} onChange={e => setConfig(c => ({ ...c, totalBusinessIncome: parseFloat(e.target.value) || 0 }))} placeholder="400000" /></div>
                </div>
                <Button onClick={() => saveConfig(config)} disabled={saving} className="w-full">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Spara och beräkna
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KPICard label="Räntefördelning" value={`${fmtPct(allocationRate)}%`} unit={`(SLR ${fmtPct(config.governmentBondRate)}% + 6%)`} />
                <KPICard label="Räntefördelningsbelopp" value={fmt(interestAllocation)} unit="kr" />
                <KPICard label="Inkomst av kapital" value={fmt(capitalIncome)} unit="kr" />
                <KPICard label="Inkomst av tjänst" value={fmt(employmentIncome)} unit="kr" />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="regler" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-3">
            <h3 className="text-sm font-semibold">Regler räntefördelning</h3>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
              <li>Positiv räntefördelning: statslåneränta + <strong>6 procentenheter</strong></li>
              <li>Kapitalunderlaget beräknas vid årets ingång</li>
              <li>Inkomsten delas upp i inkomst av kapital respektive näringsverksamhet</li>
              <li>Lägre beskattning på kapitalinkomstdelen (30% istället för marginalskatt)</li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </ModuleWorkspaceShell>
  )
}
