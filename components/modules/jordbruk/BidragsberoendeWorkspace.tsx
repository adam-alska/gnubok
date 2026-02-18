'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, AlertTriangle } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface SubsidyConfig { totalRevenue: number; euSubsidies: number; otherSubsidies: number }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }
function fmtPct(n: number): string { return isFinite(n) ? n.toFixed(1) : '0.0' }

export function BidragsberoendeWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<SubsidyConfig>({ totalRevenue: 0, euSubsidies: 0, otherSubsidies: 0 })

  const saveConfig = useCallback(async (cfg: SubsidyConfig) => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'subsidy_config', config_value: cfg }, { onConflict: 'user_id,sector_slug,module_slug,config_key' })
    setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'subsidy_config').maybeSingle()
    if (data?.config_value) setConfig(data.config_value as SubsidyConfig)
    setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  const totalSubsidies = config.euSubsidies + config.otherSubsidies
  const euPct = config.totalRevenue > 0 ? (config.euSubsidies / config.totalRevenue) * 100 : 0
  const totalPct = config.totalRevenue > 0 ? (totalSubsidies / config.totalRevenue) * 100 : 0
  const ownRevenue = config.totalRevenue - totalSubsidies
  const ownPct = config.totalRevenue > 0 ? (ownRevenue / config.totalRevenue) * 100 : 0
  const highRisk = euPct > 50

  return (
    <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="rapport" sectorName="Jordbruk & Livsmedel" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}>
      {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-4">
            <h3 className="text-sm font-semibold">Intäktsunderlag</h3>
            <div className="grid gap-4">
              <div className="grid gap-2"><Label>Total omsättning (kr)</Label><Input type="number" value={config.totalRevenue || ''} onChange={e => setConfig(c => ({ ...c, totalRevenue: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>EU-stöd (kr)</Label><Input type="number" value={config.euSubsidies || ''} onChange={e => setConfig(c => ({ ...c, euSubsidies: parseFloat(e.target.value) || 0 }))} /></div>
              <div className="grid gap-2"><Label>Övriga bidrag (kr)</Label><Input type="number" value={config.otherSubsidies || ''} onChange={e => setConfig(c => ({ ...c, otherSubsidies: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <Button onClick={() => saveConfig(config)} disabled={saving} className="w-full">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Spara
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPICard label="EU-beroende" value={fmtPct(euPct)} unit="%" trend={highRisk ? 'down' : 'up'} trendLabel={highRisk ? 'Hög risk' : 'OK'} />
            <KPICard label="Totalt bidragsberoende" value={fmtPct(totalPct)} unit="%" />
            <KPICard label="Egen intäkt" value={fmt(ownRevenue)} unit="kr" />
            <KPICard label="Egenfinansieringsgrad" value={fmtPct(ownPct)} unit="%" trend={ownPct > 50 ? 'up' : 'down'} />
          </div>

          {highRisk && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div><p className="text-sm font-medium text-amber-700">Hög EU-beroende ({fmtPct(euPct)}%)</p><p className="text-xs text-amber-600 mt-1">Över 50% av omsättningen kommer från EU-stöd. Policyförändringar kan ge stor intäktspåverkan.</p></div>
            </div>
          )}
        </div>
      )}
    </ModuleWorkspaceShell>
  )
}
