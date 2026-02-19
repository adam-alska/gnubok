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

interface RepresentationSettings {
  intern_grans: number
  avdragsgill_andel: number
  momsavdrag: number
}

const DEFAULT_SETTINGS: RepresentationSettings = {
  intern_grans: 90,
  avdragsgill_andel: 100,
  momsavdrag: 100,
}

export function RepresentationConfig({ sectorSlug, moduleSlug }: ModuleConfigProps) {
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
  const [settings, setSettings] = useState<RepresentationSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const stored = configs.representation_settings as RepresentationSettings | undefined
    if (stored) {
      setSettings({
        intern_grans: stored.intern_grans ?? DEFAULT_SETTINGS.intern_grans,
        avdragsgill_andel: stored.avdragsgill_andel ?? DEFAULT_SETTINGS.avdragsgill_andel,
        momsavdrag: stored.momsavdrag ?? DEFAULT_SETTINGS.momsavdrag,
      })
    }
  }, [configs])

  async function handleSave() {
    await saveConfig('representation_settings', settings)
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div>
        <h3 className="text-base font-semibold">Representation</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Gränser och avdragsinställningar för representation.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="intern_grans">Intern gräns kr</Label>
          <Input
            id="intern_grans"
            type="number"
            value={settings.intern_grans}
            onChange={e => setSettings(prev => ({ ...prev, intern_grans: parseFloat(e.target.value) || 0 }))}
            placeholder="90"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="avdragsgill_andel">Avdragsgill andel %</Label>
          <Input
            id="avdragsgill_andel"
            type="number"
            value={settings.avdragsgill_andel}
            onChange={e => setSettings(prev => ({ ...prev, avdragsgill_andel: parseFloat(e.target.value) || 0 }))}
            placeholder="100"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="momsavdrag">Momsavdrag %</Label>
          <Input
            id="momsavdrag"
            type="number"
            value={settings.momsavdrag}
            onChange={e => setSettings(prev => ({ ...prev, momsavdrag: parseFloat(e.target.value) || 0 }))}
            placeholder="100"
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
