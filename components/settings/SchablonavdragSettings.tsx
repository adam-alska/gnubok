'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { SCHABLONAVDRAG_RATES, type HousingType } from '@/lib/tax/schablonavdrag'
import { Home, Car, Loader2, Info, Building } from 'lucide-react'
import type { SchablonavdragSettings as SchablonavdragSettingsType } from '@/types'

interface SchablonavdragSettingsProps {
  settings: SchablonavdragSettingsType
  onSave: (settings: SchablonavdragSettingsType) => Promise<void>
}

export default function SchablonavdragSettings({
  settings: initialSettings,
  onSave,
}: SchablonavdragSettingsProps) {
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState<SchablonavdragSettingsType>(initialSettings)

  const hasChanges =
    settings.hemmakontor_enabled !== initialSettings.hemmakontor_enabled ||
    settings.hemmakontor_housing_type !== initialSettings.hemmakontor_housing_type ||
    settings.bil_enabled !== initialSettings.bil_enabled

  // Get the current hemmakontor amount based on housing type
  const housingType = settings.hemmakontor_housing_type || 'apartment'
  const hemmakontorAmount = housingType === 'villa'
    ? SCHABLONAVDRAG_RATES.hemmakontor.villa
    : SCHABLONAVDRAG_RATES.hemmakontor.apartment

  async function handleSave() {
    setIsSaving(true)
    try {
      await onSave(settings)
      toast({
        title: 'Sparat',
        description: 'Dina schablonavdragsinställningar har uppdaterats',
      })
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte spara inställningar',
        variant: 'destructive',
      })
    }
    setIsSaving(false)
  }

  function setHousingType(type: HousingType) {
    setSettings({ ...settings, hemmakontor_housing_type: type })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Schablonavdrag
        </CardTitle>
        <CardDescription>
          Aktivera schablonmässiga avdrag som inte kräver kvitton
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hemmakontor */}
        <div className="p-4 border rounded-lg space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Home className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hemmakontor" className="text-base font-medium">
                  Hemmakontor
                </Label>
                <p className="text-sm text-muted-foreground">
                  Schablonavdrag för hemmakontor (minst 800 tim/år)
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-success">
                    {formatCurrency(hemmakontorAmount)}
                  </span>
                  <span className="text-muted-foreground">per år</span>
                </div>
              </div>
            </div>
            <Switch
              id="hemmakontor"
              checked={settings.hemmakontor_enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, hemmakontor_enabled: checked })
              }
            />
          </div>

          {/* Housing type selection */}
          {settings.hemmakontor_enabled && (
            <div className="ml-14 space-y-2">
              <Label className="text-sm text-muted-foreground">Typ av bostad</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={housingType === 'apartment' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setHousingType('apartment')}
                  className="flex items-center gap-2"
                >
                  <Building className="h-4 w-4" />
                  Hyresrätt/Bostadsrätt
                  <span className="text-xs opacity-70">({formatCurrency(SCHABLONAVDRAG_RATES.hemmakontor.apartment)})</span>
                </Button>
                <Button
                  type="button"
                  variant={housingType === 'villa' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setHousingType('villa')}
                  className="flex items-center gap-2"
                >
                  <Home className="h-4 w-4" />
                  Villa
                  <span className="text-xs opacity-70">({formatCurrency(SCHABLONAVDRAG_RATES.hemmakontor.villa)})</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Bilkostnader */}
        <div className="flex items-start justify-between p-4 border rounded-lg">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Car className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bil" className="text-base font-medium">
                Bilkostnader (körjournal)
              </Label>
              <p className="text-sm text-muted-foreground">
                Milersättning för tjänsteresor med egen bil
              </p>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-success">
                  {SCHABLONAVDRAG_RATES.bil.rate_per_mil} kr/mil
                </span>
                <span className="text-muted-foreground">
                  ({SCHABLONAVDRAG_RATES.bil.rate_per_km.toFixed(2)} kr/km)
                </span>
              </div>
            </div>
          </div>
          <Switch
            id="bil"
            checked={settings.bil_enabled}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, bil_enabled: checked })
            }
          />
        </div>

        {/* Info box */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
          <Info className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Om schablonavdrag</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>
                <strong>Hemmakontor:</strong> Kräver minst 800 timmars arbete hemifrån per år.
                Avdrag: {formatCurrency(SCHABLONAVDRAG_RATES.hemmakontor.apartment)} (lägenhet) eller{' '}
                {formatCurrency(SCHABLONAVDRAG_RATES.hemmakontor.villa)} (villa).
              </li>
              <li>
                <strong>Bilkostnader:</strong> Kräver att du loggar dina resor i körjournalen.
                Du får {SCHABLONAVDRAG_RATES.bil.rate_per_mil} kr per mil ({SCHABLONAVDRAG_RATES.bil.rate_per_km.toFixed(2)} kr/km).
              </li>
              <li>Schablonavdrag minskar din beskattningsbara inkomst</li>
            </ul>
          </div>
        </div>

        {/* Save button */}
        {hasChanges && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sparar...
                </>
              ) : (
                'Spara ändringar'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
