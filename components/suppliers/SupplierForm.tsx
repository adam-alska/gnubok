'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import type { CreateSupplierInput } from '@/types/suppliers'

const schema = z.object({
  name: z.string().min(1, 'Namn krävs'),
  org_number: z.string().optional(),
  vat_number: z.string().optional(),
  email: z.string().email('Ogiltig e-postadress').optional().or(z.literal('')),
  phone: z.string().optional(),
  address_line1: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  bankgiro: z.string().optional(),
  plusgiro: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  clearing_number: z.string().optional(),
  account_number: z.string().optional(),
  default_payment_terms: z.number().min(0).optional(),
  category: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface SupplierFormProps {
  onSubmit: (data: CreateSupplierInput) => Promise<void>
  isLoading: boolean
  initialData?: Partial<FormData>
}

export default function SupplierForm({
  onSubmit,
  isLoading,
  initialData,
}: SupplierFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name || '',
      org_number: initialData?.org_number || '',
      vat_number: initialData?.vat_number || '',
      email: initialData?.email || '',
      phone: initialData?.phone || '',
      address_line1: initialData?.address_line1 || '',
      postal_code: initialData?.postal_code || '',
      city: initialData?.city || '',
      country: initialData?.country || 'SE',
      bankgiro: initialData?.bankgiro || '',
      plusgiro: initialData?.plusgiro || '',
      iban: initialData?.iban || '',
      bic: initialData?.bic || '',
      clearing_number: initialData?.clearing_number || '',
      account_number: initialData?.account_number || '',
      default_payment_terms: initialData?.default_payment_terms ?? 30,
      category: initialData?.category || '',
      notes: initialData?.notes || '',
    },
  })

  const onFormSubmit = (data: FormData) => {
    onSubmit({
      ...data,
      email: data.email || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="supplier-name">Namn *</Label>
        <Input
          id="supplier-name"
          placeholder="Leverantörsnamn"
          {...register('name')}
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="supplier-email">E-post</Label>
          <Input
            id="supplier-email"
            type="email"
            placeholder="faktura@leverantor.se"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier-phone">Telefon</Label>
          <Input
            id="supplier-phone"
            placeholder="+46 8 123 45 67"
            {...register('phone')}
          />
        </div>
      </div>

      {/* Business info */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="font-medium">Företagsuppgifter</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="supplier-org-number">Organisationsnummer</Label>
            <Input
              id="supplier-org-number"
              placeholder="XXXXXX-XXXX"
              {...register('org_number')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-vat-number">VAT-nummer</Label>
            <Input
              id="supplier-vat-number"
              placeholder="SE123456789001"
              {...register('vat_number')}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier-category">Kategori</Label>
          <Input
            id="supplier-category"
            placeholder="t.ex. Kontorsmaterial, IT, Konsult"
            {...register('category')}
          />
        </div>
      </div>

      {/* Address */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="font-medium">Adress</h3>
        <div className="space-y-2">
          <Label htmlFor="supplier-address">Gatuadress</Label>
          <Input
            id="supplier-address"
            placeholder="Leverantörsgatan 1"
            {...register('address_line1')}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="supplier-postal-code">Postnummer</Label>
            <Input
              id="supplier-postal-code"
              placeholder="123 45"
              {...register('postal_code')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-city">Ort</Label>
            <Input
              id="supplier-city"
              placeholder="Stockholm"
              {...register('city')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-country">Land</Label>
            <Input
              id="supplier-country"
              placeholder="SE"
              {...register('country')}
            />
          </div>
        </div>
      </div>

      {/* Payment info */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="font-medium">Betalningsuppgifter</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="supplier-bankgiro">Bankgiro</Label>
            <Input
              id="supplier-bankgiro"
              placeholder="123-4567"
              {...register('bankgiro')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-plusgiro">Plusgiro</Label>
            <Input
              id="supplier-plusgiro"
              placeholder="12 34 56-7"
              {...register('plusgiro')}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="supplier-clearing">Clearingnummer</Label>
            <Input
              id="supplier-clearing"
              placeholder="1234"
              {...register('clearing_number')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-account">Kontonummer</Label>
            <Input
              id="supplier-account"
              placeholder="1234567890"
              {...register('account_number')}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="supplier-iban">IBAN</Label>
            <Input
              id="supplier-iban"
              placeholder="SE12 3456 7890 1234 5678 9012"
              {...register('iban')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-bic">BIC/SWIFT</Label>
            <Input
              id="supplier-bic"
              placeholder="NDEASESS"
              {...register('bic')}
            />
          </div>
        </div>
      </div>

      {/* Payment terms */}
      <div className="space-y-2">
        <Label htmlFor="supplier-payment-terms">Betalningsvillkor (dagar)</Label>
        <Input
          id="supplier-payment-terms"
          type="number"
          {...register('default_payment_terms', { valueAsNumber: true })}
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="supplier-notes">Anteckningar</Label>
        <Textarea
          id="supplier-notes"
          placeholder="Interna anteckningar om leverantören..."
          {...register('notes')}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sparar...
            </>
          ) : (
            'Spara leverantör'
          )}
        </Button>
      </div>
    </form>
  )
}
