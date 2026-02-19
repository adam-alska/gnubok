'use client'

import { useState, useEffect } from 'react'
import { ModuleConfigPanel } from '@/components/modules/ModuleConfigPanel'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface ModuleConfigProps {
  sectorSlug: string
  moduleSlug: string
}

interface ExciseSettings {
  tillstandstyp: 'stadigvarande' | 'tillfalligt' | 'catering'
  rapporteringsfrekvens: 'manadsvis' | 'kvartalsvis' | 'arsvis'
}

const DEFAULT_SETTINGS: ExciseSettings = {
  tillstandstyp: 'stadigvarande',
  rapporteringsfrekvens: 'manadsvis',
}

export function AlkoholAccisConfig({ sectorSlug, moduleSlug }: ModuleConfigProps) {
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
  const [settings, setSettings] = useState<ExciseSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const stored = configs.excise_settings as ExciseSettings | undefined
    if (stored) {
      setSettings({
        tillstandstyp: stored.tillstandstyp ?? DEFAULT_SETTINGS.tillstandstyp,
        rapporteringsfrekvens: stored.rapporteringsfrekvens ?? DEFAULT_SETTINGS.rapporteringsfrekvens,
      })
    }
  }, [configs])

  async function handleSave() {
    await saveConfig('excise_settings', settings)
  }

  const selectClassName = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div>
        <h3 className="text-base font-semibold">Alkohol & Accis</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Inställningar för alkoholtillstånd och rapportering.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tillstandstyp">Tillståndstyp</Label>
          <select
            id="tillstandstyp"
            value={settings.tillstandstyp}
            onChange={e => setSettings(prev => ({ ...prev, tillstandstyp: e.target.value as ExciseSettings['tillstandstyp'] }))}
            className={selectClassName}
          >
            <option value="stadigvarande">Stadigvarande serveringstillstånd</option>
            <option value="tillfalligt">Tillfälligt serveringstillstånd</option>
            <option value="catering">Catering</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rapporteringsfrekvens">Rapporteringsfrekvens</Label>
          <select
            id="rapporteringsfrekvens"
            value={settings.rapporteringsfrekvens}
            onChange={e => setSettings(prev => ({ ...prev, rapporteringsfrekvens: e.target.value as ExciseSettings['rapporteringsfrekvens'] }))}
            className={selectClassName}
          >
            <option value="manadsvis">Månadsvis</option>
            <option value="kvartalsvis">Kvartalsvis</option>
            <option value="arsvis">Årsvis</option>
          </select>
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
