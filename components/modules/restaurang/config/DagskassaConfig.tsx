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

interface ReconciliationSettings {
  kassakonto: string
  kortkonto: string
  toleransbelopp: number
}

const DEFAULT_SETTINGS: ReconciliationSettings = {
  kassakonto: '1910',
  kortkonto: '1930',
  toleransbelopp: 50,
}

export function DagskassaConfig({ sectorSlug, moduleSlug }: ModuleConfigProps) {
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
  const [settings, setSettings] = useState<ReconciliationSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const stored = configs.reconciliation_settings as ReconciliationSettings | undefined
    if (stored) {
      setSettings({
        kassakonto: stored.kassakonto ?? DEFAULT_SETTINGS.kassakonto,
        kortkonto: stored.kortkonto ?? DEFAULT_SETTINGS.kortkonto,
        toleransbelopp: stored.toleransbelopp ?? DEFAULT_SETTINGS.toleransbelopp,
      })
    }
  }, [configs])

  async function handleSave() {
    await saveConfig('reconciliation_settings', settings)
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div>
        <h3 className="text-base font-semibold">Dagskassaavstämning</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Inställningar för kassaavstämning och toleransnivåer.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="kassakonto">Kassakonto (kontant)</Label>
          <Input
            id="kassakonto"
            value={settings.kassakonto}
            onChange={e => setSettings(prev => ({ ...prev, kassakonto: e.target.value }))}
            placeholder="1910"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="kortkonto">Kortkonto</Label>
          <Input
            id="kortkonto"
            value={settings.kortkonto}
            onChange={e => setSettings(prev => ({ ...prev, kortkonto: e.target.value }))}
            placeholder="1930"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="toleransbelopp">Toleransbelopp kr</Label>
          <Input
            id="toleransbelopp"
            type="number"
            value={settings.toleransbelopp}
            onChange={e => setSettings(prev => ({ ...prev, toleransbelopp: parseFloat(e.target.value) || 0 }))}
            placeholder="50"
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
