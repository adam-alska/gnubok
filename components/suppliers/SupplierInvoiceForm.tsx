'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import type { Supplier } from '@/types/suppliers'

const itemSchema = z.object({
  description: z.string().min(1, 'Beskrivning krävs'),
  quantity: z.number().min(0),
  unit: z.string().optional(),
  unit_price: z.number(),
  account_number: z.string().optional(),
  vat_rate: z.number().min(0).max(100).optional(),
  cost_center: z.string().optional(),
  project: z.string().optional(),
})

const schema = z.object({
  supplier_id: z.string().min(1, 'Leverantör krävs'),
  invoice_number: z.string().min(1, 'Fakturanummer krävs'),
  ocr_number: z.string().optional(),
  invoice_date: z.string().optional(),
  due_date: z.string().optional(),
  currency: z.string().optional(),
  vat_rate: z.number().min(0).max(100).optional(),
  payment_method: z.string().optional(),
  payment_reference: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'Minst en rad krävs'),
})

type FormData = z.infer<typeof schema>

interface SupplierInvoiceFormProps {
  onSubmit: (data: FormData & { subtotal: number; vat_amount: number; total: number }) => Promise<void>
  isLoading: boolean
  supplierId?: string
}

export default function SupplierInvoiceForm({
  onSubmit,
  isLoading,
  supplierId,
}: SupplierInvoiceFormProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)
  const supabase = createClient()

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
      supplier_id: supplierId || '',
      invoice_number: '',
      ocr_number: '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '',
      currency: 'SEK',
      vat_rate: 25,
      payment_method: '',
      payment_reference: '',
      notes: '',
      items: [
        {
          description: '',
          quantity: 1,
          unit: 'st',
          unit_price: 0,
          account_number: '4000',
          vat_rate: 25,
          cost_center: '',
          project: '',
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const items = watch('items')
  const selectedSupplierId = watch('supplier_id')
  const defaultVatRate = watch('vat_rate')

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unit_price || 0), 0)
  const vatAmount = items.reduce((sum, item) => {
    const lineTotal = (item.quantity || 0) * (item.unit_price || 0)
    const rate = item.vat_rate ?? defaultVatRate ?? 25
    return sum + (lineTotal * rate) / 100
  }, 0)
  const total = subtotal + vatAmount

  useEffect(() => {
    fetchSuppliers()
  }, [])

  // When supplier changes, set default payment terms for due date
  useEffect(() => {
    if (selectedSupplierId) {
      const supplier = suppliers.find((s) => s.id === selectedSupplierId)
      if (supplier) {
        const invoiceDate = watch('invoice_date')
        if (invoiceDate && !watch('due_date')) {
          const date = new Date(invoiceDate)
          date.setDate(date.getDate() + supplier.default_payment_terms)
          setValue('due_date', date.toISOString().split('T')[0])
        }
        // Set default payment method based on supplier's payment info
        if (supplier.bankgiro && !watch('payment_method')) {
          setValue('payment_method', 'bankgiro')
        } else if (supplier.plusgiro && !watch('payment_method')) {
          setValue('payment_method', 'plusgiro')
        }
      }
    }
  }, [selectedSupplierId, suppliers])

  async function fetchSuppliers() {
    setLoadingSuppliers(true)
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name')

    setSuppliers(data || [])
    setLoadingSuppliers(false)
  }

  const onFormSubmit = (data: FormData) => {
    onSubmit({
      ...data,
      subtotal,
      vat_amount: vatAmount,
      total,
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* Supplier selection */}
      <div className="space-y-2">
        <Label>Leverantör *</Label>
        <Controller
          name="supplier_id"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={loadingSuppliers}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSuppliers ? 'Laddar...' : 'Välj leverantör'} />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name} {supplier.org_number ? `(${supplier.org_number})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.supplier_id && (
          <p className="text-sm text-destructive">{errors.supplier_id.message}</p>
        )}
      </div>

      {/* Invoice details */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="inv-number">Fakturanummer (leverantörens) *</Label>
          <Input
            id="inv-number"
            placeholder="12345"
            {...register('invoice_number')}
          />
          {errors.invoice_number && (
            <p className="text-sm text-destructive">{errors.invoice_number.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="inv-ocr">OCR-nummer</Label>
          <Input
            id="inv-ocr"
            placeholder="Betalningsreferens"
            {...register('ocr_number')}
          />
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="inv-date">Fakturadatum</Label>
          <Input
            id="inv-date"
            type="date"
            {...register('invoice_date')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inv-due-date">Förfallodatum</Label>
          <Input
            id="inv-due-date"
            type="date"
            {...register('due_date')}
          />
        </div>
      </div>

      {/* Payment info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Betalningsmetod</Label>
          <Controller
            name="payment_method"
            control={control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj metod" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bankgiro">Bankgiro</SelectItem>
                  <SelectItem value="plusgiro">Plusgiro</SelectItem>
                  <SelectItem value="bank_transfer">Banköverföring</SelectItem>
                  <SelectItem value="swish">Swish</SelectItem>
                  <SelectItem value="cash">Kontant</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inv-payment-ref">Betalningsreferens</Label>
          <Input
            id="inv-payment-ref"
            placeholder="OCR/referens"
            {...register('payment_reference')}
          />
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Fakturarader</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              append({
                description: '',
                quantity: 1,
                unit: 'st',
                unit_price: 0,
                account_number: '4000',
                vat_rate: defaultVatRate ?? 25,
                cost_center: '',
                project: '',
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Lägg till rad
          </Button>
        </div>

        {fields.map((field, index) => (
          <Card key={field.id}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-2">
                  <Label>Beskrivning *</Label>
                  <Input
                    placeholder="Beskrivning av varan/tjänsten"
                    {...register(`items.${index}.description`)}
                  />
                  {errors.items?.[index]?.description && (
                    <p className="text-sm text-destructive">
                      {errors.items[index]?.description?.message}
                    </p>
                  )}
                </div>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-7 text-destructive"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Antal</Label>
                  <Input
                    type="number"
                    step="0.01"
                    {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Enhet</Label>
                  <Input
                    placeholder="st"
                    {...register(`items.${index}.unit`)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Á-pris (exkl. moms)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    {...register(`items.${index}.unit_price`, { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Konto (BAS)</Label>
                  <Input
                    placeholder="4000"
                    {...register(`items.${index}.account_number`)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Moms %</Label>
                  <Input
                    type="number"
                    step="1"
                    {...register(`items.${index}.vat_rate`, { valueAsNumber: true })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Kostnadsställe</Label>
                  <Input
                    placeholder="Valfritt"
                    {...register(`items.${index}.cost_center`)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Projekt</Label>
                  <Input
                    placeholder="Valfritt"
                    {...register(`items.${index}.project`)}
                  />
                </div>
              </div>

              <div className="text-right text-sm text-muted-foreground">
                Radtotal: {formatCurrency((items[index]?.quantity || 0) * (items[index]?.unit_price || 0))}
              </div>
            </CardContent>
          </Card>
        ))}

        {errors.items?.message && (
          <p className="text-sm text-destructive">{errors.items.message}</p>
        )}
      </div>

      {/* Totals */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Netto</span>
              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Moms</span>
              <span className="tabular-nums">{formatCurrency(vatAmount)}</span>
            </div>
            <div className="flex justify-between font-medium border-t pt-2">
              <span>Totalt</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="inv-notes">Anteckningar</Label>
        <Textarea
          id="inv-notes"
          placeholder="Interna anteckningar om fakturan..."
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
            'Registrera faktura'
          )}
        </Button>
      </div>
    </form>
  )
}
