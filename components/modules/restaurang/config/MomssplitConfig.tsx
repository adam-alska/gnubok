'use client'

import { useState, useEffect } from 'react'
import { ModuleConfigPanel } from '@/components/modules/ModuleConfigPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface ModuleConfigProps {
  sectorSlug: string
  moduleSlug: string
}

interface VatRules {
  moms_mat: number
  moms_alkohol_dryck: number
  blandade_kvitton: 'proportionellt' | 'manuell'
}

const DEFAULT_RULES: VatRules = {
  moms_mat: 12,
  moms_alkohol_dryck: 25,
  blandade_kvitton: 'proportionellt',
}

export function MomssplitConfig({ sectorSlug, moduleSlug }: ModuleConfigProps) {
  return (
    <ModuleConfigPanel sectorSlug={sectorSlug} moduleSlug={moduleSlug}>
      {({ configs, saveConfig, saving }) => (
        <ConfigForm configs={configs} saveConfig={saveConfig} saving={saving} />
      )}
    </ModuleConfigPanel>
  )
}

function ConfigForm({
  configs,
  saveConfig,
  saving,
}: {
  configs: Record<string, unknown>
  saveConfig: (k: string, v: unknown) => Promise<void>
  saving: boolean
}) {
  const [rules, setRules] = useState<VatRules>(DEFAULT_RULES)

  useEffect(() => {
    const stored = configs.vat_rules as VatRules | undefined
    if (stored) {
      setRules({
        moms_mat: stored.moms_mat ?? DEFAULT_RULES.moms_mat,
        moms_alkohol_dryck: stored.moms_alkohol_dryck ?? DEFAULT_RULES.moms_alkohol_dryck,
        blandade_kvitton: stored.blandade_kvitton ?? DEFAULT_RULES.blandade_kvitton,
      })
    }
  }, [configs])

  async function handleSave() {
    await saveConfig('vat_rules', rules)
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div>
        <h3 className="text-base font-semibold">Momssplit</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Konfigurera momssatser och hantering av blandade kvitton.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="moms_mat">Moms mat %</Label>
          <Input
            id="moms_mat"
            type="number"
            value={rules.moms_mat}
            onChange={e => setRules(prev => ({ ...prev, moms_mat: parseFloat(e.target.value) || 0 }))}
            placeholder="12"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="moms_alkohol">Moms alkohol/dryck %</Label>
          <Input
            id="moms_alkohol"
            type="number"
            value={rules.moms_alkohol_dryck}
            onChange={e => setRules(prev => ({ ...prev, moms_alkohol_dryck: parseFloat(e.target.value) || 0 }))}
            placeholder="25"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="blandade_kvitton">Hantering av blandade kvitton</Label>
        <select
          id="blandade_kvitton"
          value={rules.blandade_kvitton}
          onChange={e => setRules(prev => ({ ...prev, blandade_kvitton: e.target.value as VatRules['blandade_kvitton'] }))}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="proportionellt">Fördela proportionellt</option>
          <option value="manuell">Manuell uppdelning</option>
        </select>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Spara momsregler
        </Button>
      </div>
    </div>
  )
}
