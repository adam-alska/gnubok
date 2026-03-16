'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Loader2, ArrowLeft, Landmark, SkipForward } from 'lucide-react'

const manualBankSchema = z.object({
  bank_name: z.string().optional(),
  clearing_number: z.string().optional(),
  account_number: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
})

type ManualBankData = z.infer<typeof manualBankSchema>

interface Step6Props {
  initialData?: Partial<ManualBankData>
  onComplete: (data?: ManualBankData) => void
  onBack: () => void
  onSkip: () => void
  isSaving: boolean
}

export default function Step6ConnectBank({
  initialData,
  onBack,
  onSkip,
  onComplete,
  isSaving,
}: Step6Props) {
  const {
    register,
    handleSubmit,
  } = useForm<ManualBankData>({
    resolver: zodResolver(manualBankSchema),
    mode: 'onTouched',
    defaultValues: {
      bank_name: initialData?.bank_name || '',
      clearing_number: initialData?.clearing_number || '',
      account_number: initialData?.account_number || '',
      iban: initialData?.iban || '',
      bic: initialData?.bic || '',
    },
  })

  const onManualSubmit = (data: ManualBankData) => {
    onComplete(data)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Bankuppgifter för fakturor
          </CardTitle>
          <CardDescription>
            Dessa uppgifter visas på dina fakturor så att kunder kan betala dig.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onManualSubmit, (errs) => {
            console.error('[onboarding] step 5 validation failed:', Object.keys(errs).join(', '), errs)
          })} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bank_name">Bank</Label>
              <Input
                id="bank_name"
                placeholder="t.ex. Nordea, SEB, Swedbank"
                {...register('bank_name')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <InfoTooltip
                  content={
                    <div className="space-y-2">
                      <p className="font-medium">Vad är clearingnummer?</p>
                      <p>De första 4-5 siffrorna i ditt kontonummer som identifierar din bank.</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>Nordea: 3300</li>
                        <li>SEB: 5000</li>
                        <li>Swedbank: 8XXX</li>
                        <li>Handelsbanken: 6XXX</li>
                        <li>Avanza: 9550/9551</li>
                      </ul>
                    </div>
                  }
                  side="top"
                >
                  <Label htmlFor="clearing_number">Clearingnummer</Label>
                </InfoTooltip>
                <Input
                  id="clearing_number"
                  placeholder="XXXX"
                  {...register('clearing_number')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account_number">Kontonummer</Label>
                <Input
                  id="account_number"
                  placeholder="XXX XXX XXX"
                  {...register('account_number')}
                />
              </div>
            </div>

            <div className="pt-4 border-t">
              <h4 className="font-medium mb-4">Internationella betalningar (valfritt)</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <InfoTooltip
                    content={
                      <div className="space-y-2">
                        <p className="font-medium">Vad är IBAN?</p>
                        <p>Internationellt bankkontonummer. Svenska IBAN börjar med SE och har 24 tecken totalt.</p>
                      </div>
                    }
                    side="right"
                  >
                    <Label htmlFor="iban">IBAN</Label>
                  </InfoTooltip>
                  <Input
                    id="iban"
                    placeholder="SE00 0000 0000 0000 0000 0000"
                    {...register('iban')}
                  />
                </div>
                <div className="space-y-2">
                  <InfoTooltip
                    content={
                      <div className="space-y-2">
                        <p className="font-medium">Vad är BIC/SWIFT?</p>
                        <p>Bankens internationella id-kod. Används tillsammans med IBAN för utlandsbetalningar.</p>
                      </div>
                    }
                    side="right"
                  >
                    <Label htmlFor="bic">BIC/SWIFT</Label>
                  </InfoTooltip>
                  <Input
                    id="bic"
                    placeholder="XXXXSESS"
                    {...register('bic')}
                  />
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                Du kan importera kontoutdrag (CSV, XML) från din bank under <strong>Import</strong>-sidan
                efter att du slutfört registreringen.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sparar...
                </>
              ) : (
                'Spara och slutför'
              )}
            </Button>
          </form>

          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onSkip}
            >
              <SkipForward className="mr-2 h-4 w-4" />
              Hoppa över
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
