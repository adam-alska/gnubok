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

interface AccountMappings {
  mat: string
  dryck: string
  alkohol: string
  takeaway: string
}

const DEFAULT_MAPPINGS: AccountMappings = {
  mat: '3001',
  dryck: '3002',
  alkohol: '3003',
  takeaway: '3004',
}

export function RestaurangkontoplanConfig({ sectorSlug, moduleSlug }: ModuleConfigProps) {
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
  const [mappings, setMappings] = useState<AccountMappings>(DEFAULT_MAPPINGS)

  useEffect(() => {
    const stored = configs.account_mappings as AccountMappings | undefined
    if (stored) {
      setMappings({
        mat: stored.mat ?? DEFAULT_MAPPINGS.mat,
        dryck: stored.dryck ?? DEFAULT_MAPPINGS.dryck,
        alkohol: stored.alkohol ?? DEFAULT_MAPPINGS.alkohol,
        takeaway: stored.takeaway ?? DEFAULT_MAPPINGS.takeaway,
      })
    }
  }, [configs])

  function handleChange(key: keyof AccountMappings, value: string) {
    setMappings(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    await saveConfig('account_mappings', mappings)
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div>
        <h3 className="text-base font-semibold">Kontoplan</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Mappa intäktstyper till BAS-konton för bokföring.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mat">Mat (food)</Label>
          <Input
            id="mat"
            value={mappings.mat}
            onChange={e => handleChange('mat', e.target.value)}
            placeholder="3001"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dryck">Dryck (drink)</Label>
          <Input
            id="dryck"
            value={mappings.dryck}
            onChange={e => handleChange('dryck', e.target.value)}
            placeholder="3002"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="alkohol">Alkohol (alcohol)</Label>
          <Input
            id="alkohol"
            value={mappings.alkohol}
            onChange={e => handleChange('alkohol', e.target.value)}
            placeholder="3003"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="takeaway">Take-away</Label>
          <Input
            id="takeaway"
            value={mappings.takeaway}
            onChange={e => handleChange('takeaway', e.target.value)}
            placeholder="3004"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Spara kontoplan
        </Button>
      </div>
    </div>
  )
}
