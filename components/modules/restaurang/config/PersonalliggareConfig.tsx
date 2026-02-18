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

interface StaffRegisterSettings {
  exportformat: 'CSV' | 'PDF' | 'XML'
  rapporteringsperiod: 'Dagligen' | 'Veckovis' | 'M\u00e5nadsvis'
}

const DEFAULT_SETTINGS: StaffRegisterSettings = {
  exportformat: 'CSV',
  rapporteringsperiod: 'Dagligen',
}

export function PersonalliggareConfig({ sectorSlug, moduleSlug }: ModuleConfigProps) {
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
  const [settings, setSettings] = useState<StaffRegisterSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    const stored = configs.staff_register_settings as StaffRegisterSettings | undefined
    if (stored) {
      setSettings({
        exportformat: stored.exportformat ?? DEFAULT_SETTINGS.exportformat,
        rapporteringsperiod: stored.rapporteringsperiod ?? DEFAULT_SETTINGS.rapporteringsperiod,
      })
    }
  }, [configs])

  async function handleSave() {
    await saveConfig('staff_register_settings', settings)
  }

  const selectClassName = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div>
        <h3 className="text-base font-semibold">Personalliggare</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Inst\u00e4llningar f\u00f6r exportformat och rapporteringsfrekvens.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="exportformat">Exportformat</Label>
          <select
            id="exportformat"
            value={settings.exportformat}
            onChange={e => setSettings(prev => ({ ...prev, exportformat: e.target.value as StaffRegisterSettings['exportformat'] }))}
            className={selectClassName}
          >
            <option value="CSV">CSV</option>
            <option value="PDF">PDF</option>
            <option value="XML">XML</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rapporteringsperiod">Rapporteringsperiod</Label>
          <select
            id="rapporteringsperiod"
            value={settings.rapporteringsperiod}
            onChange={e => setSettings(prev => ({ ...prev, rapporteringsperiod: e.target.value as StaffRegisterSettings['rapporteringsperiod'] }))}
            className={selectClassName}
          >
            <option value="Dagligen">Dagligen</option>
            <option value="Veckovis">Veckovis</option>
            <option value="M\u00e5nadsvis">M\u00e5nadsvis</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Spara inst\u00e4llningar
        </Button>
      </div>
    </div>
  )
}
