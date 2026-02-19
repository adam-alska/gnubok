'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft } from 'lucide-react'
import SupplierInvoiceForm from '@/components/suppliers/SupplierInvoiceForm'

export default function CreateSupplierInvoicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supplierId = searchParams.get('supplier') || undefined
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  async function handleSubmit(data: {
    supplier_id: string
    invoice_number: string
    ocr_number?: string
    invoice_date?: string
    due_date?: string
    currency?: string
    vat_rate?: number
    payment_method?: string
    payment_reference?: string
    notes?: string
    subtotal: number
    vat_amount: number
    total: number
    items: Array<{
      description: string
      quantity: number
      unit?: string
      unit_price: number
      account_number?: string
      vat_rate?: number
      cost_center?: string
      project?: string
    }>
  }) {
    setIsCreating(true)

    try {
      const response = await fetch('/api/supplier-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte registrera faktura',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Faktura registrerad',
          description: `Faktura ${data.invoice_number} har registrerats`,
        })
        router.push('/supplier-invoices')
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte registrera faktura',
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/supplier-invoices"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Tillbaka till leverantörsfakturor
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Registrera leverantörsfaktura</h1>
        <p className="text-muted-foreground">
          Registrera en inkommande faktura från en leverantör
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <SupplierInvoiceForm
            onSubmit={handleSubmit}
            isLoading={isCreating}
            supplierId={supplierId}
          />
        </CardContent>
      </Card>
    </div>
  )
}
