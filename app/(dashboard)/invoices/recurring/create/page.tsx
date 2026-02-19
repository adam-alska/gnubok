'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { RecurringInvoiceForm } from '@/components/invoices/RecurringInvoiceForm'

export default function CreateRecurringInvoicePage() {
  const router = useRouter()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ny aterkommande faktura</h1>
          <p className="text-muted-foreground">
            Skapa en mall for automatisk fakturagenerering
          </p>
        </div>
      </div>

      <RecurringInvoiceForm />
    </div>
  )
}
