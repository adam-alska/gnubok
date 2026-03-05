'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowRight, ArrowLeft } from 'lucide-react'
import type { EntityType } from '@/types'

const schema = z.object({
  company_name: z.string().min(1, 'Företagsnamn krävs'),
  org_number: z.string()
    .min(1, 'Organisationsnummer krävs')
    .regex(/^\d{6,8}[-\s]?\d{4}$/, 'Ogiltigt format. Ange XXXXXX-XXXX'),
  address_line1: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Step2Props {
  initialData: Partial<FormData>
  entityType?: EntityType
  onNext: (data: FormData) => void
  onBack: () => void
  isSaving: boolean
}

export default function Step2CompanyDetails({
  initialData,
  entityType,
  onNext,
  onBack,
  isSaving,
}: Step2Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      company_name: initialData.company_name || '',
      org_number: initialData.org_number || '',
      address_line1: initialData.address_line1 || '',
      postal_code: initialData.postal_code || '',
      city: initialData.city || '',
    },
  })

  const isAB = entityType === 'aktiebolag'

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Företagsuppgifter</h1>
        <p className="text-muted-foreground mt-2">
          Fyll i uppgifter om din verksamhet. Dessa används på fakturor.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grunduppgifter</CardTitle>
          <CardDescription>
            {isAB
              ? 'Ange bolagets registrerade namn och organisationsnummer.'
              : 'Ange namn på din verksamhet.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onNext)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">
                {isAB ? 'Företagsnamn' : 'Verksamhetsnamn (Eller ditt namn vid EF)'} *
              </Label>
              <Input
                id="company_name"
                placeholder={isAB ? 'AB Företaget' : 'Alices Konsultverksamhet'}
                {...register('company_name')}
              />
              {errors.company_name && (
                <p className="text-sm text-destructive">{errors.company_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="org_number">
                Organisationsnummer *
              </Label>
              <Input
                id="org_number"
                placeholder={isAB ? 'XXXXXX-XXXX' : 'ÅÅMMDD-XXXX (ditt personnummer vid EF)'}
                {...register('org_number')}
              />
              {errors.org_number && (
                <p className="text-sm text-destructive">{errors.org_number.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {isAB
                  ? 'Obligatoriskt för aktiebolag'
                  : 'Vid enskild firma är orgnummer samma som ditt personnummer'}
              </p>
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-medium mb-4">Adress (för fakturor)</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address_line1">Gatuadress</Label>
                  <Input
                    id="address_line1"
                    placeholder="Storgatan 1"
                    {...register('address_line1')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">Postnummer</Label>
                    <Input
                      id="postal_code"
                      placeholder="123 45"
                      {...register('postal_code')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Ort</Label>
                    <Input
                      id="city"
                      placeholder="Stockholm"
                      {...register('city')}
                    />
                  </div>
                </div>
              </div>
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
