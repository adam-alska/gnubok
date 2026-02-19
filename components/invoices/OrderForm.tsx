'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import type { Customer, Currency } from '@/types'

const itemSchema = z.object({
  description: z.string().min(1, 'Beskrivning krävs'),
  quantity: z.number().min(0.01, 'Minst 0.01'),
  unit: z.string().min(1, 'Enhet krävs'),
  unit_price: z.number().min(0, 'Pris måste vara positivt'),
})

const schema = z.object({
  customer_id: z.string().min(1, 'Välj en kund'),
  order_date: z.string().min(1, 'Orderdatum krävs'),
  delivery_date: z.string().optional(),
  currency: z.enum(['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK']),
  your_reference: z.string().optional(),
  our_reference: z.string().optional(),
  delivery_address: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Minst en rad krävs'),
})

type FormData = z.infer<typeof schema>

const currencies: Currency[] = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK']
const units = ['st', 'tim', 'dag', 'man', 'km', 'kg']

export function OrderForm() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: '',
      order_date: '',
      currency: 'SEK',
      items: [{ description: '', quantity: 1, unit: 'st', unit_price: 0 }],
    },
  })

  useEffect(() => {
    setValue('order_date', format(new Date(), 'yyyy-MM-dd'))
  }, [setValue])

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const watchItems = watch('items')
  const watchCurrency = watch('currency')

  useEffect(() => {
    async function fetchCustomers() {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true })

      if (!error && data) {
        setCustomers(data)
      }
      setIsLoading(false)
    }
    fetchCustomers()
  }, [supabase])

  const subtotal = watchItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.unit_price || 0), 0)

  async function onSubmit(data: FormData) {
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte skapa order')
      }

      toast({
        title: 'Order skapad',
        description: `Order ${result.data.order_number} har skapats`,
      })

      router.push(`/orders/${result.data.id}`)
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle>Kund</CardTitle>
              <CardDescription>Välj kund för ordern</CardDescription>
            </CardHeader>
            <CardContent>
              <Controller
                name="customer_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Välj kund" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.customer_id && (
                <p className="text-sm text-destructive mt-2">{errors.customer_id.message}</p>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Orderrader</CardTitle>
              <CardDescription>Lägg till produkter eller tjänster</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid gap-4 md:grid-cols-12 items-start">
                    <div className="md:col-span-5 space-y-2">
                      <Label>Beskrivning</Label>
                      <Input
                        placeholder="T.ex. Konsulttjänst"
                        {...register(`items.${index}.description`)}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <Label>Antal</Label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <Label>Enhet</Label>
                      <Controller
                        name={`items.${index}.unit`}
                        control={control}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {units.map((unit) => (
                                <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <Label>a-pris</Label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register(`items.${index}.unit_price`, { valueAsNumber: true })}
                      />
                    </div>
                    <div className="md:col-span-1 flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => append({ description: '', quantity: 1, unit: 'st', unit_price: 0 })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Lägg till rad
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Delivery & Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Leverans och anteckningar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Leveransadress (valfritt)</Label>
                <Textarea
                  placeholder="Leveransadress om den skiljer sig från kundadressen..."
                  {...register('delivery_address')}
                />
              </div>
              <div className="space-y-2">
                <Label>Anteckningar</Label>
                <Textarea
                  placeholder="Valfria anteckningar..."
                  {...register('notes')}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Orderdetaljer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Valuta</Label>
                <Controller
                  name="currency"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>Orderdatum</Label>
                <Input type="date" {...register('order_date')} />
              </div>

              <div className="space-y-2">
                <Label>Leveransdatum (valfritt)</Label>
                <Input type="date" {...register('delivery_date')} />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Er referens</Label>
                <Input {...register('your_reference')} />
              </div>
              <div className="space-y-2">
                <Label>Vår referens</Label>
                <Input {...register('our_reference')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summering</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delsumma</span>
                <span>{formatCurrency(subtotal, watchCurrency)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Totalt (exkl. moms)</span>
                <span>{formatCurrency(subtotal, watchCurrency)}</span>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Skapar...
              </>
            ) : (
              'Skapa order'
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
