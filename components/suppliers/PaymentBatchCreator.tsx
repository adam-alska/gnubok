'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Banknote } from 'lucide-react'
import SupplierInvoiceList from './SupplierInvoiceList'
import type { SupplierInvoice } from '@/types/suppliers'

interface PaymentBatchCreatorProps {
  onCreated?: (paymentId: string) => void
}

export default function PaymentBatchCreator({ onCreated }: PaymentBatchCreatorProps) {
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchApprovedInvoices()
  }, [])

  async function fetchApprovedInvoices() {
    setIsLoading(true)

    const { data, error } = await supabase
      .from('supplier_invoices')
      .select('*, supplier:suppliers(id, name, bankgiro, plusgiro)')
      .in('status', ['approved', 'attested'])
      .order('due_date', { ascending: true })

    if (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta fakturor',
        variant: 'destructive',
      })
    } else {
      setInvoices((data || []) as SupplierInvoice[])
    }

    setIsLoading(false)
  }

  function handleSelectChange(id: string, selected: boolean) {
    const next = new Set(selectedIds)
    if (selected) {
      next.add(id)
    } else {
      next.delete(id)
    }
    setSelectedIds(next)
  }

  function handleSelectAll(selected: boolean) {
    if (selected) {
      setSelectedIds(new Set(invoices.map((inv) => inv.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const selectedInvoices = invoices.filter((inv) => selectedIds.has(inv.id))
  const totalAmount = selectedInvoices.reduce((sum, inv) => sum + inv.total, 0)

  async function handleCreateBatch() {
    if (selectedIds.size === 0) {
      toast({
        title: 'Välj fakturor',
        description: 'Välj minst en faktura att inkludera i betalningen',
        variant: 'destructive',
      })
      return
    }

    setIsCreating(true)

    try {
      const response = await fetch('/api/supplier-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_date: paymentDate,
          invoice_ids: Array.from(selectedIds),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte skapa betalning',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Betalning skapad',
          description: `${selectedIds.size} fakturor inkluderade, totalt ${formatCurrency(totalAmount)}`,
        })
        setSelectedIds(new Set())
        fetchApprovedInvoices()
        onCreated?.(result.data.id)
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte skapa betalning',
        variant: 'destructive',
      })
    } finally {
      setIsCreating(false)
    }
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Selection summary */}
      {selectedIds.size > 0 && (
        <Card className="border-primary/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {selectedIds.size} faktura{selectedIds.size !== 1 ? 'or' : ''} valda
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {formatCurrency(totalAmount)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="space-y-1">
                  <Label htmlFor="batch-date" className="text-xs">Betalningsdatum</Label>
                  <Input
                    id="batch-date"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-40"
                  />
                </div>
                <Button onClick={handleCreateBatch} disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Skapar...
                    </>
                  ) : (
                    <>
                      <Banknote className="mr-2 h-4 w-4" />
                      Skapa betalning
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center">
              <Banknote className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Inga fakturor att betala</h3>
              <p className="text-muted-foreground mt-1">
                Det finns inga godkända leverantörsfakturor redo för betalning.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <SupplierInvoiceList
          invoices={invoices}
          selectable
          selectedIds={selectedIds}
          onSelectChange={handleSelectChange}
          onSelectAll={handleSelectAll}
          showSupplier
        />
      )}
    </div>
  )
}
