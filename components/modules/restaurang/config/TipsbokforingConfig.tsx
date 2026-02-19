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

interface TipSettings {
  drickskonto: string
  arbetsgivaravgift: number
}

const DEFAULT_SETTINGS: TipSettings = {
  drickskonto: '7699',
  arbetsgivaravgift: 31.42,
}

export function TipsbokforingConfig({ sectorSlug, moduleSlug }: ModuleConfigProps) {
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
  const [settings, setSettings] = useState<TipSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const stored = configs.tip_settings as TipSettings | undefined
    if (stored) {
      setSettings({
        drickskonto: stored.drickskonto ?? DEFAULT_SETTINGS.drickskonto,
        arbetsgivaravgift: stored.arbetsgivaravgift ?? DEFAULT_SETTINGS.arbetsgivaravgift,
      })
    }
  }, [configs])

  async function handleSave() {
    await saveConfig('tip_settings', settings)
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div>
        <h3 className="text-base font-semibold">Tipsbokföring</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Konfigurera konton och skattesatser för drickshantering.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="drickskonto">Drickskonto</Label>
          <Input
            id="drickskonto"
            value={settings.drickskonto}
            onChange={e => setSettings(prev => ({ ...prev, drickskonto: e.target.value }))}
            placeholder="7699"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="arbetsgivaravgift">Arbetsgivaravgift %</Label>
          <Input
            id="arbetsgivaravgift"
            type="number"
            step="0.01"
            value={settings.arbetsgivaravgift}
            onChange={e => setSettings(prev => ({ ...prev, arbetsgivaravgift: parseFloat(e.target.value) || 0 }))}
            placeholder="31.42"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Spara inställningar
        </Button>
      </div>
    </div>
  )
}
