'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DocumentStatusBadge } from '@/components/invoices/DocumentStatusBadge'
import { ConversionPipeline } from '@/components/invoices/ConversionPipeline'
import {
  Loader2,
  ArrowLeft,
  Receipt,
  Building,
  Mail,
  Phone,
  MapPin,
  XCircle,
  CheckCircle,
  Truck,
  Package,
  FileText,
} from 'lucide-react'
import type { Order, OrderItem } from '@/types/invoices-enhanced'
import type { Customer } from '@/types'

interface OrderWithRelations extends Omit<Order, 'quote'> {
  customer: Customer
  items: OrderItem[]
  quote?: { id: string; quote_number: string; status: string } | null
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const supabase = createClient()

  const [order, setOrder] = useState<OrderWithRelations | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConverting, setIsConverting] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    fetchOrder()
  }, [id])

  async function fetchOrder() {
    setIsLoading(true)

    const { data, error } = await supabase
      .from('orders')
      .select('*, customer:customers(*), items:order_items(*), quote:quotes(id, quote_number, status)')
      .eq('id', id)
      .single()

    if (error || !data) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta order',
        variant: 'destructive',
      })
      router.push('/orders')
      return
    }

    if (data.items) {
      (data.items as Array<{ sort_order: number }>).sort((a, b) => a.sort_order - b.sort_order)
    }

    setOrder(data as unknown as OrderWithRelations)
    setIsLoading(false)
  }

  async function convertToInvoice() {
    if (!order) return
    setIsConverting(true)

    try {
      const response = await fetch(`/api/orders/${order.id}/convert`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Konvertering misslyckades')
      }

      toast({
        title: 'Faktura skapad',
        description: 'Ordern har konverterats till en faktura',
      })

      router.push(`/invoices/${result.data.id}`)
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Något gick fel',
        variant: 'destructive',
      })
    } finally {
      setIsConverting(false)
    }
  }

  async function updateStatus(status: string) {
    if (!order) return
    setIsUpdating(true)

    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        throw new Error('Kunde inte uppdatera status')
      }

      toast({ title: 'Uppdaterad', description: 'Status har ändrats' })
      fetchOrder()
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte uppdatera status',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!order) return null

  const customer = order.customer
  const canInvoice = !['invoiced', 'cancelled'].includes(order.status)

  // Build pipeline stages
  const pipelineStages = [
    {
      type: 'quote' as const,
      id: order.quote_id || order.quote?.id || null,
      number: order.quote?.quote_number || null,
      status: order.quote?.status || null,
      date: null,
    },
    {
      type: 'order' as const,
      id: order.id,
      number: order.order_number,
      status: order.status,
      date: order.order_date,
    },
    {
      type: 'invoice' as const,
      id: order.converted_to_invoice_id,
      number: null,
      status: null,
      date: null,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{order.order_number}</h1>
              <DocumentStatusBadge type="order" status={order.status} />
            </div>
            <p className="text-muted-foreground">
              Skapad {formatDate(order.created_at)}
              {order.delivery_date && ` - Leverans ${formatDate(order.delivery_date)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canInvoice && (
            <Button onClick={convertToInvoice} disabled={isConverting}>
              {isConverting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Receipt className="mr-2 h-4 w-4" />
              )}
              Skapa faktura
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline */}
      <ConversionPipeline stages={pipelineStages} currentStage="order" />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Kund
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="font-medium text-lg">{customer.name}</p>
                {customer.org_number && (
                  <p className="text-muted-foreground">Org.nr: {customer.org_number}</p>
                )}
                <div className="flex flex-wrap gap-4 pt-2">
                  {customer.email && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      {customer.email}
                    </div>
                  )}
                  {customer.phone && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {customer.phone}
                    </div>
                  )}
                </div>
                {(customer.address_line1 || customer.city) && (
                  <div className="flex items-start gap-1 text-sm text-muted-foreground pt-1">
                    <MapPin className="h-4 w-4 mt-0.5" />
                    <div>
                      {customer.address_line1 && <p>{customer.address_line1}</p>}
                      <p>
                        {customer.postal_code} {customer.city}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Orderrader</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                  <div className="col-span-5">Beskrivning</div>
                  <div className="col-span-2 text-right">Antal</div>
                  <div className="col-span-1 text-center">Enhet</div>
                  <div className="col-span-2 text-right">a-pris</div>
                  <div className="col-span-2 text-right">Summa</div>
                </div>

                {order.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-4 text-sm">
                    <div className="col-span-5">{item.description}</div>
                    <div className="col-span-2 text-right">{item.quantity}</div>
                    <div className="col-span-1 text-center">{item.unit}</div>
                    <div className="col-span-2 text-right">
                      {formatCurrency(item.unit_price, order.currency)}
                    </div>
                    <div className="col-span-2 text-right font-medium">
                      {formatCurrency(item.line_total, order.currency)}
                    </div>
                  </div>
                ))}

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delsumma</span>
                    <span>{formatCurrency(Number(order.subtotal), order.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Moms ({order.vat_rate || 25}%)</span>
                    <span>{formatCurrency(Number(order.vat_amount), order.currency)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Totalt</span>
                    <span>{formatCurrency(Number(order.total), order.currency)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Delivery address & Notes */}
          {(order.delivery_address || order.notes) && (
            <Card>
              <CardHeader>
                <CardTitle>Leverans och anteckningar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {order.delivery_address && (
                  <div>
                    <p className="text-sm font-medium mb-1">Leveransadress</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                      {order.delivery_address}
                    </p>
                  </div>
                )}
                {order.notes && (
                  <div>
                    <p className="text-sm font-medium mb-1">Anteckningar</p>
                    <p className="text-sm text-muted-foreground">{order.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Detaljer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ordernummer</span>
                <span className="font-medium">{order.order_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Orderdatum</span>
                <span>{formatDate(order.order_date)}</span>
              </div>
              {order.delivery_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Leveransdatum</span>
                  <span>{formatDate(order.delivery_date)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valuta</span>
                <span>{order.currency}</span>
              </div>
              {order.your_reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Er referens</span>
                  <span>{order.your_reference}</span>
                </div>
              )}
              {order.our_reference && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vår referens</span>
                  <span>{order.our_reference}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          {order.status !== 'invoiced' && order.status !== 'cancelled' && (
            <Card>
              <CardHeader>
                <CardTitle>Åtgärder</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {order.status === 'draft' && (
                  <Button
                    className="w-full"
                    onClick={() => updateStatus('confirmed')}
                    disabled={isUpdating}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Bekräfta order
                  </Button>
                )}
                {order.status === 'confirmed' && (
                  <Button
                    className="w-full"
                    onClick={() => updateStatus('in_progress')}
                    disabled={isUpdating}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Markera som pågående
                  </Button>
                )}
                {(order.status === 'confirmed' || order.status === 'in_progress') && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => updateStatus('delivered')}
                    disabled={isUpdating}
                  >
                    <Truck className="mr-2 h-4 w-4" />
                    Markera som levererad
                  </Button>
                )}
                {canInvoice && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={convertToInvoice}
                    disabled={isConverting}
                  >
                    {isConverting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Receipt className="mr-2 h-4 w-4" />
                    )}
                    Skapa faktura
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => updateStatus('cancelled')}
                  disabled={isUpdating}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Makulera
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Source quote reference */}
          {order.quote && (
            <Card className="border-primary/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-2">Skapad från offert</p>
                <Link href={`/quotes/${order.quote.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    <FileText className="mr-2 h-4 w-4" />
                    Visa offert {order.quote.quote_number}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Invoice reference */}
          {order.converted_to_invoice_id && (
            <Card className="border-success/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-2">Faktura skapad</p>
                <Link href={`/invoices/${order.converted_to_invoice_id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    <Receipt className="mr-2 h-4 w-4" />
                    Visa faktura
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
