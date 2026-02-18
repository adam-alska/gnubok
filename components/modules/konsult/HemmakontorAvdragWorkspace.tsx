'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ModuleWorkspaceShell } from '@/components/modules/ModuleWorkspaceShell'
import { KPICard } from '@/components/modules/shared/KPICard'
import { EmptyModuleState } from '@/components/modules/shared/EmptyModuleState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Home, Save } from 'lucide-react'

interface ModuleWorkspaceProps { module: { slug: string; name: string; cat: string; desc: string; longDesc: string }; sectorSlug: string; settingsHref: string }

interface HomeOfficeConfig { method: 'Schablon' | 'Verklig kostnad'; fixedAmount: number; totalArea: number; officeArea: number; totalRent: number; electricityCost: number; internetCost: number; daysPerYear: number }

function fmt(n: number): string { return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) }

const DEFAULT_CONFIG: HomeOfficeConfig = { method: 'Schablon', fixedAmount: 2000, totalArea: 80, officeArea: 10, totalRent: 10000, electricityCost: 500, internetCost: 400, daysPerYear: 220 }

export function HemmakontorAvdragWorkspace({ module: mod, sectorSlug, settingsHref }: ModuleWorkspaceProps) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<HomeOfficeConfig>(DEFAULT_CONFIG)

  const saveConfig = useCallback(async (c: HomeOfficeConfig) => {
    setSaving(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setSaving(false); return }
    await supabase.from('module_configs').upsert({ user_id: user.id, sector_slug: sectorSlug, module_slug: mod.slug, config_key: 'homeoffice_config', config_value: c }, { onConflict: 'user_id,sector_slug,module_slug,config_key' }); setSaving(false)
  }, [supabase, sectorSlug, mod.slug])

  const fetchData = useCallback(async () => {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setLoading(false); return }
    const { data } = await supabase.from('module_configs').select('config_value').eq('user_id', user.id).eq('sector_slug', sectorSlug).eq('module_slug', mod.slug).eq('config_key', 'homeoffice_config').maybeSingle()
    if (data?.config_value) setConfig(data.config_value as HomeOfficeConfig); setLoading(false)
  }, [supabase, sectorSlug, mod.slug])

  useEffect(() => { fetchData() }, [fetchData])

  const areaPct = config.totalArea > 0 ? config.officeArea / config.totalArea : 0
  const actualDeduction = config.method === 'Verklig kostnad' ? (config.totalRent * areaPct + config.electricityCost * areaPct + config.internetCost * 0.5) * 12 : 0
  const deduction = config.method === 'Schablon' ? config.fixedAmount : actualDeduction

  return (
    <ModuleWorkspaceShell title={mod.name} description={mod.desc} category="bokforing" sectorName="Konsult" backHref={`/m/${sectorSlug}`} settingsHref={settingsHref}>
      {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
        <Tabs defaultValue="berakning" className="space-y-6">
          <TabsList><TabsTrigger value="berakning">Beräkning</TabsTrigger><TabsTrigger value="installningar">Inställningar</TabsTrigger></TabsList>
          <TabsContent value="berakning" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard label="Beräknat avdrag" value={fmt(deduction)} unit="kr/år" />
              <KPICard label="Metod" value={config.method} />
              <KPICard label="Kontorsyta" value={String(config.officeArea)} unit="m2" />
              <KPICard label="Andel av bostad" value={`${(areaPct * 100).toFixed(1)}`} unit="%" />
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-4 max-w-lg">
              <h3 className="text-sm font-semibold">Avdragsberäkning</h3>
              {config.method === 'Schablon' ? (
                <div className="space-y-2 text-sm">
                  <p>Schablonbelopp: <span className="font-semibold">{fmt(config.fixedAmount)} kr</span></p>
                  <p className="text-xs text-muted-foreground">Schablonavdrag 2 000 kr (enklare) eller 4 000 kr (eget rum).</p>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>Hyra ({(areaPct * 100).toFixed(1)}% av {fmt(config.totalRent)} kr/mån): <span className="font-semibold">{fmt(config.totalRent * areaPct * 12)} kr/år</span></p>
                  <p>El ({(areaPct * 100).toFixed(1)}% av {fmt(config.electricityCost)} kr/mån): <span className="font-semibold">{fmt(config.electricityCost * areaPct * 12)} kr/år</span></p>
                  <p>Internet (50% av {fmt(config.internetCost)} kr/mån): <span className="font-semibold">{fmt(config.internetCost * 0.5 * 12)} kr/år</span></p>
                  <div className="border-t pt-2 mt-2"><p>Totalt avdrag: <span className="font-semibold">{fmt(actualDeduction)} kr/år</span></p></div>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="installningar" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-lg space-y-4">
              <h3 className="text-sm font-semibold">Hemmakontorinställningar</h3>
              <div className="grid gap-2"><Label>Metod</Label><Select value={config.method} onValueChange={val => setConfig(c => ({ ...c, method: val as HomeOfficeConfig['method'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Schablon">Schablon</SelectItem><SelectItem value="Verklig kostnad">Verklig kostnad</SelectItem></SelectContent></Select></div>
              {config.method === 'Schablon' ? (
                <div className="grid gap-2"><Label>Schablonbelopp (kr/år)</Label><Input type="number" min={0} value={config.fixedAmount} onChange={e => setConfig(c => ({ ...c, fixedAmount: parseFloat(e.target.value) || 0 }))} /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Total yta (m2)</Label><Input type="number" min={1} value={config.totalArea} onChange={e => setConfig(c => ({ ...c, totalArea: parseFloat(e.target.value) || 1 }))} /></div><div className="grid gap-2"><Label>Kontorsyta (m2)</Label><Input type="number" min={0} value={config.officeArea} onChange={e => setConfig(c => ({ ...c, officeArea: parseFloat(e.target.value) || 0 }))} /></div></div>
                  <div className="grid grid-cols-3 gap-4"><div className="grid gap-2"><Label>Hyra (kr/mån)</Label><Input type="number" min={0} value={config.totalRent} onChange={e => setConfig(c => ({ ...c, totalRent: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>El (kr/mån)</Label><Input type="number" min={0} value={config.electricityCost} onChange={e => setConfig(c => ({ ...c, electricityCost: parseFloat(e.target.value) || 0 }))} /></div><div className="grid gap-2"><Label>Internet (kr/mån)</Label><Input type="number" min={0} value={config.internetCost} onChange={e => setConfig(c => ({ ...c, internetCost: parseFloat(e.target.value) || 0 }))} /></div></div>
                </>
              )}
              <Button size="sm" onClick={() => saveConfig(config)} disabled={saving}>{saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}Spara</Button>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </ModuleWorkspaceShell>
  )
}
