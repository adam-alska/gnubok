'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import type { CreateTransactionInput, TransactionCategory, Currency } from '@/types'

const schema = z.object({
  date: z.string().min(1, 'Datum krävs'),
  description: z.string().min(1, 'Beskrivning krävs'),
  amount: z.number().refine((n) => n !== 0, 'Belopp måste anges'),
  currency: z.enum(['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK']),
  category: z.string().optional(),
  is_business: z.boolean().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface TransactionFormProps {
  onSubmit: (data: CreateTransactionInput) => Promise<void>
  isLoading: boolean
}

const categories: { value: TransactionCategory; label: string; isIncome?: boolean }[] = [
  { value: 'income_services', label: 'Intäkt: Tjänster', isIncome: true },
  { value: 'income_products', label: 'Intäkt: Produkter', isIncome: true },
  { value: 'income_other', label: 'Intäkt: Övrigt', isIncome: true },
  { value: 'expense_equipment', label: 'Kostnad: Utrustning' },
  { value: 'expense_software', label: 'Kostnad: Programvara' },
  { value: 'expense_travel', label: 'Kostnad: Resor' },
  { value: 'expense_office', label: 'Kostnad: Kontor' },
  { value: 'expense_marketing', label: 'Kostnad: Marknadsföring' },
  { value: 'expense_professional_services', label: 'Kostnad: Konsulter' },
  { value: 'expense_education', label: 'Kostnad: Utbildning' },
  { value: 'expense_other', label: 'Kostnad: Övrigt' },
  { value: 'private', label: 'Privat (ej avdragsgillt)' },
]

const currencies: Currency[] = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK']

export default function TransactionForm({ onSubmit, isLoading }: TransactionFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: '',
      description: '',
      amount: 0,
      currency: 'SEK',
      category: undefined,
      is_business: undefined,
      notes: '',
    },
  })

  // Set date default on client only to avoid hydration mismatch
  useEffect(() => {
    setValue('date', format(new Date(), 'yyyy-MM-dd'))
  }, [])

  const watchCategory = watch('category')
  const isPrivate = watchCategory === 'private'
  const isIncome = categories.find((c) => c.value === watchCategory)?.isIncome

  const onFormSubmit = (data: FormData) => {
    const isBusiness = data.category ? data.category !== 'private' : undefined

    onSubmit({
      date: data.date,
      description: data.description,
      amount: data.amount,
      currency: data.currency,
      category: data.category as TransactionCategory,
      is_business: isBusiness,
      notes: data.notes,
    })
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date">Datum *</Label>
          <Input id="date" type="date" {...register('date')} />
          {errors.date && (
            <p className="text-sm text-destructive">{errors.date.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Valuta</Label>
          <Controller
            name="currency"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Beskrivning *</Label>
        <Input
          id="description"
          placeholder="T.ex. Adobe Creative Cloud"
          {...register('description')}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">Belopp * (negativt för utgift)</Label>
        <Input
          id="amount"
          type="number"
          step="0.01"
          placeholder="-500"
          {...register('amount', { valueAsNumber: true })}
        />
        {errors.amount && (
          <p className="text-sm text-destructive">{errors.amount.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Ange positivt belopp för intäkter, negativt för kostnader
        </p>
      </div>

      <div className="space-y-2">
        <Label>Kategori (valfritt)</Label>
        <Controller
          name="category"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Välj kategori" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Anteckningar</Label>
        <Textarea
          id="notes"
          placeholder="Valfria anteckningar..."
          {...register('notes')}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sparar...
          </>
        ) : (
          'Spara transaktion'
        )}
      </Button>
    </form>
  )
}
