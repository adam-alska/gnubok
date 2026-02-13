'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Loader2, ArrowRight, ArrowLeft } from 'lucide-react'
import type { MomsPeriod } from '@/types'

const schema = z.object({
  f_skatt: z.boolean(),
  fiscal_year_start_month: z.number().min(1).max(12),
  vat_registered: z.boolean(),
  vat_number: z.string().optional(),
  moms_period: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
})

type FormData = z.infer<typeof schema>

interface Step3Props {
  initialData: Partial<FormData>
  onNext: (data: FormData) => void
  onBack: () => void
  isSaving: boolean
}

const months = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Mars' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Maj' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Augusti' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

export default function Step3TaxRegistration({
  initialData,
  onNext,
  onBack,
  isSaving,
}: Step3Props) {
  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      f_skatt: initialData.f_skatt ?? true,
      fiscal_year_start_month: initialData.fiscal_year_start_month ?? 1,
      vat_registered: initialData.vat_registered ?? false,
      vat_number: initialData.vat_number || '',
      moms_period: initialData.moms_period,
    },
  })

  const vatRegistered = watch('vat_registered')

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Skatteregistrering</h1>
        <p className="text-muted-foreground mt-2">
          Ange information om din skatteregistrering.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>F-skatt och räkenskapsår</CardTitle>
          <CardDescription>
            Dessa uppgifter används för att beräkna din skattesituation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onNext)} className="space-y-6">
            {/* F-skatt */}
            <div className="flex items-start space-x-3">
              <Controller
                name="f_skatt"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="f_skatt"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <div className="space-y-1">
                <InfoTooltip
                  content={
                    <div className="space-y-2">
                      <p className="font-medium">Vad är F-skatt?</p>
                      <p>F-skatt betyder att du själv ansvarar för att betala skatt och avgifter till Skatteverket varje månad.</p>
                      <p className="text-xs text-muted-foreground">De flesta som driver företag har F-skatt. Utan F-skatt måste dina kunder göra skatteavdrag på dina fakturor.</p>
                    </div>
                  }
                  side="right"
                >
                  <Label htmlFor="f_skatt" className="cursor-pointer">
                    Jag har F-skattsedel
                  </Label>
                </InfoTooltip>
                <p className="text-sm text-muted-foreground">
                  F-skatt innebär att du själv ansvarar för att betala in skatt och avgifter.
                </p>
              </div>
            </div>

            {/* Fiscal year */}
            <div className="space-y-2">
              <Label>Räkenskapsår börjar</Label>
              <Controller
                name="fiscal_year_start_month"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value?.toString()}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Välj månad" />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month) => (
                        <SelectItem key={month.value} value={month.value.toString()}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-sm text-muted-foreground">
                De flesta har kalenderår (januari). Brutet räkenskapsår är vanligare för aktiebolag.
              </p>
            </div>

            {/* VAT section */}
            <div className="pt-4 border-t space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <InfoTooltip
                  content={
                    <div className="space-y-2">
                      <p className="font-medium">Behöver jag momsregistrera mig?</p>
                      <p>Ja, om din omsättning överstiger 80 000 kr per år. Med moms lägger du på 25% extra på dina fakturor, men får också dra av moms på dina inköp.</p>
                      <p className="text-xs text-muted-foreground">Om din omsättning överstiger 80 000 kr per år behöver du momsregistrera dig.</p>
                    </div>
                  }
                  side="right"
                >
                  <span>Momsregistrering</span>
                </InfoTooltip>
              </h3>

              <div className="flex items-start space-x-3">
                <Controller
                  name="vat_registered"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      id="vat_registered"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <div className="space-y-1">
                  <Label htmlFor="vat_registered" className="cursor-pointer">
                    Jag är momsregistrerad
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Obligatoriskt om din omsättning överstiger 80 000 kr per år.
                  </p>
                </div>
              </div>

              {vatRegistered && (
                <div className="space-y-4 pl-7">
                  <div className="space-y-2">
                    <Label htmlFor="vat_number">Momsregistreringsnummer</Label>
                    <Input
                      id="vat_number"
                      placeholder="SE123456789001"
                      {...register('vat_number')}
                    />
                    <p className="text-xs text-muted-foreground">
                      Format: SE + organisationsnummer + 01
                    </p>
                  </div>

                  <div className="space-y-2">
                    <InfoTooltip
                      content={
                        <div className="space-y-2">
                          <p className="font-medium">Hur ofta rapporterar du moms?</p>
                          <p>Osäker? Börja med kvartal - det är vanligast och du kan ändra senare.</p>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            <li>Under 1 miljon/år = Kan välja årsredovisning</li>
                            <li>1-40 miljoner = Kvartal</li>
                            <li>Över 40 miljoner = Månad</li>
                          </ul>
                        </div>
                      }
                      side="right"
                    >
                      <Label>Momsredovisningsperiod</Label>
                    </InfoTooltip>
                    <Controller
                      name="moms_period"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Välj period" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Månad</SelectItem>
                            <SelectItem value="quarterly">Kvartal (rekommenderas)</SelectItem>
                            <SelectItem value="yearly">År</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      Osäker? Välj kvartal - det passar de flesta och du kan ändra senare.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                disabled={isSaving}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sparar...
                  </>
                ) : (
                  <>
                    Fortsätt
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
