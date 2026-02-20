'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { addDays, format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { getVatRules, getVatTreatmentLabel } from '@/lib/invoice/vat-rules'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Loader2, Plus, Trash2, ArrowLeft, Send } from 'lucide-react'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { InvoiceReviewContent } from '@/components/invoices/InvoiceReviewContent'
import type { Customer, Currency, CreateInvoiceInput } from '@/types'

const itemSchema = z.object({
  description: z.string().min(1, 'Beskrivning krävs'),
  quantity: z.number().min(0.01, 'Minst 0.01'),
  unit: z.string().min(1, 'Enhet krävs'),
  unit_price: z.number().min(0, 'Pris måste vara positivt'),
})

const schema = z.object({
  customer_id: z.string().min(1, 'Välj en kund'),
  invoice_date: z.string().min(1, 'Fakturadatum krävs'),
  due_date: z.string().min(1, 'Förfallodatum krävs'),
  currency: z.enum(['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK']),
  your_reference: z.string().optional(),
  our_reference: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Minst en rad krävs'),
})

type FormData = z.infer<typeof schema>

const currencies: Currency[] = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK']
const units = ['st', 'tim', 'dag', 'mån', 'km', 'kg']

export default function NewInvoicePage() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()
  const searchParams = useSearchParams()
  const preselectedCustomerId = searchParams.get('customer_id')

  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showReview, setShowReview] = useState(false)
  const [pendingData, setPendingData] = useState<FormData | null>(null)
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null)
  const [showSendPrompt, setShowSendPrompt] = useState(false)
  const [isSending, setIsSending] = useState(false)

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
      invoice_date: '',
      due_date: '',
      currency: 'SEK',
      items: [{ description: '', quantity: 1, unit: 'st', unit_price: 0 }],
    },
  })

  // Set date defaults on client only to avoid hydration mismatch
  useEffect(() => {
    setValue('invoice_date', format(new Date(), 'yyyy-MM-dd'))
    setValue('due_date', format(addDays(new Date(), 30), 'yyyy-MM-dd'))
  }, [])

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const watchItems = watch('items')
  const watchCurrency = watch('currency')
  const watchCustomerId = watch('customer_id')

  useEffect(() => {
    fetchCustomers()
  }, [])

  useEffect(() => {
    if (watchCustomerId) {
      const customer = customers.find((c) => c.id === watchCustomerId)
      setSelectedCustomer(customer || null)

      // Update due date based on customer payment terms
      if (customer?.default_payment_terms) {
        setValue(
          'due_date',
          format(addDays(new Date(), customer.default_payment_terms), 'yyyy-MM-dd')
        )
      }
    }
  }, [watchCustomerId, customers, setValue])

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta kunder',
        variant: 'destructive',
      })
    } else {
      setCustomers(data || [])
    }
    setIsLoading(false)
  }

  const subtotal = watchItems.reduce((sum, item) => {
    return sum + (item.quantity || 0) * (item.unit_price || 0)
  }, 0)

  const vatRules = selectedCustomer
    ? getVatRules(selectedCustomer.customer_type, selectedCustomer.vat_number_validated)
    : null

  const vatAmount = vatRules ? subtotal * (vatRules.rate / 100) : 0
  const total = subtotal + vatAmount

  function onSubmit(data: FormData) {
    setPendingData(data)
    setShowReview(true)
  }

  async function handleConfirm() {
    if (!pendingData) return
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingData as CreateInvoiceInput),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte skapa faktura')
      }

      toast({
        title: 'Faktura skapad',
        description: `Faktura ${result.data.invoice_number} har skapats`,
      })

      setShowReview(false)

      // If customer has email, offer to send immediately
      if (selectedCustomer?.email) {
        setCreatedInvoiceId(result.data.id)
        setShowSendPrompt(true)
      } else {
        router.push(`/invoices/${result.data.id}`)
      }
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

  async function handleSendNow() {
    if (!createdInvoiceId) return
    setIsSending(true)

    try {
      const response = await fetch(`/api/invoices/${createdInvoiceId}/send`, {
        method: 'POST',
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Kunde inte skicka faktura')
      }

      toast({
        title: 'Faktura skickad',
        description: `Fakturan har skickats till ${selectedCustomer?.email}`,
      })
    } catch (error) {
      toast({
        title: 'Fel vid skickning',
        description: error instanceof Error ? error.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsSending(false)
      setShowSendPrompt(false)
      router.push(`/invoices/${createdInvoiceId}`)
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ny faktura</h1>
          <p className="text-muted-foreground">Skapa en ny faktura</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer selection */}
            <Card>
              <CardHeader>
                <CardTitle>Kund</CardTitle>
                <CardDescription>Välj vilken kund fakturan ska skickas till</CardDescription>
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

                {selectedCustomer && vatRules && (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <p className="text-sm">
                      <strong>Momsbehandling:</strong> {getVatTreatmentLabel(vatRules.treatment)}
                    </p>
                    {vatRules.reverseChargeText && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Omvänd skattskyldighet tillämpas
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Invoice items */}
            <Card>
              <CardHeader>
                <CardTitle>Fakturarader</CardTitle>
                <CardDescription>Lägg till produkter eller tjänster</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid gap-4 md:grid-cols-12 items-start">
                      <div className="md:col-span-5 space-y-2">
                        <Label>Beskrivning</Label>
                        <Input
                          placeholder="T.ex. Instagram-kampanj"
                          {...register(`items.${index}.description`)}
                        />
                        {errors.items?.[index]?.description && (
                          <p className="text-sm text-destructive">
                            {errors.items[index].description?.message}
                          </p>
                        )}
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
                                  <SelectItem key={unit} value={unit}>
                                    {unit}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label>à-pris</Label>
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
                    onClick={() =>
                      append({ description: '', quantity: 1, unit: 'st', unit_price: 0 })
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Lägg till rad
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Anteckningar</CardTitle>
                <CardDescription>Valfritt meddelande på fakturan</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="T.ex. betalningsvillkor eller tack för samarbetet..."
                  {...register('notes')}
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Invoice details */}
            <Card>
              <CardHeader>
                <CardTitle>Fakturadetaljer</CardTitle>
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

                <div className="space-y-2">
                  <Label>Fakturadatum</Label>
                  <Input type="date" {...register('invoice_date')} />
                </div>

                <div className="space-y-2">
                  <Label>Förfallodatum</Label>
                  <Input type="date" {...register('due_date')} />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Er referens</Label>
                  <Input
                    placeholder="Kontaktperson hos kund"
                    {...register('your_reference')}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Vår referens</Label>
                  <Input placeholder="Ditt namn" {...register('our_reference')} />
                </div>
              </CardContent>
            </Card>

            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Summering</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delsumma</span>
                  <span>{formatCurrency(subtotal, watchCurrency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Moms ({vatRules?.rate || 25}%)
                  </span>
                  <span>{formatCurrency(vatAmount, watchCurrency)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Totalt</span>
                  <span>{formatCurrency(total, watchCurrency)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
              Granska & skapa
            </Button>
          </div>
        </div>
      </form>

      {selectedCustomer && vatRules && (
        <ConfirmationDialog
          open={showReview}
          onOpenChange={setShowReview}
          onConfirm={handleConfirm}
          isSubmitting={isSubmitting}
          title="Granska faktura"
          warningText="En faktura skapas och en verifikation bokförs. Verifikationen kan inte ändras efteråt."
        >
          <InvoiceReviewContent
            customer={selectedCustomer}
            invoiceDate={pendingData?.invoice_date || ''}
            dueDate={pendingData?.due_date || ''}
            currency={(pendingData?.currency || 'SEK') as Currency}
            items={pendingData?.items || []}
            subtotal={subtotal}
            vatRate={vatRules.rate}
            vatAmount={vatAmount}
            total={total}
            vatTreatment={vatRules.treatment}
            yourReference={pendingData?.your_reference}
            ourReference={pendingData?.our_reference}
            notes={pendingData?.notes}
          />
        </ConfirmationDialog>
      )}

      {/* Send now prompt dialog */}
      <Dialog open={showSendPrompt} onOpenChange={(open) => {
        if (!open && createdInvoiceId) {
          setShowSendPrompt(false)
          router.push(`/invoices/${createdInvoiceId}`)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skicka fakturan nu?</DialogTitle>
            <DialogDescription>
              Fakturan skapades. Vill du skicka den till {selectedCustomer?.email} direkt?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowSendPrompt(false)
                if (createdInvoiceId) router.push(`/invoices/${createdInvoiceId}`)
              }}
              disabled={isSending}
            >
              Skicka senare
            </Button>
            <Button onClick={handleSendNow} disabled={isSending}>
              {isSending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {isSending ? 'Skickar...' : 'Skicka nu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
