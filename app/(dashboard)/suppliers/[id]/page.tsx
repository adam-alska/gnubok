'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import SupplierForm from '@/components/suppliers/SupplierForm'
import AttestationBadge from '@/components/suppliers/AttestationBadge'
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  Edit2,
  Trash2,
  Loader2,
  Receipt,
  CreditCard,
  Banknote,
} from 'lucide-react'
import type { Supplier, SupplierInvoice, CreateSupplierInput } from '@/types/suppliers'

interface SupplierWithRelations extends Supplier {
  supplier_invoices: Array<{
    id: string
    invoice_number: string
    invoice_date: string | null
    due_date: string | null
    status: SupplierInvoice['status']
    total: number
    currency: string
    paid_at: string | null
  }>
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat('sv-SE').format(new Date(dateStr))
}

export default function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const [supplier, setSupplier] = useState<SupplierWithRelations | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    fetchSupplier()
  }, [id])

  async function fetchSupplier() {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/suppliers/${id}`)
      if (!response.ok) {
        throw new Error('Not found')
      }
      const { data } = await response.json()
      setSupplier(data)
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte hitta leverantören',
        variant: 'destructive',
      })
      router.push('/suppliers')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleUpdate(data: CreateSupplierInput) {
    setIsUpdating(true)
    try {
      const response = await fetch(`/api/suppliers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Update failed')
      }

      toast({
        title: 'Leverantör uppdaterad',
        description: data.name,
      })
      setIsEditOpen(false)
      fetchSupplier()
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte uppdatera leverantören',
        variant: 'destructive',
      })
    } finally {
      setIsUpdating(false)
    }
  }

  async function handleDelete() {
    if (!supplier) return
    if (!confirm(`Ta bort "${supplier.name}"? Detta kan inte ångras.`)) return

    try {
      const response = await fetch(`/api/suppliers/${id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Delete failed')
      }

      toast({
        title: 'Leverantör borttagen',
        description: supplier.name,
      })
      router.push('/suppliers')
    } catch (err) {
      toast({
        title: 'Fel',
        description: err instanceof Error ? err.message : 'Kunde inte ta bort leverantören',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!supplier) return null

  const invoices = supplier.supplier_invoices || []
  const unpaidInvoices = invoices.filter((inv) => !['paid', 'credited'].includes(inv.status))
  const paidInvoices = invoices.filter((inv) => inv.status === 'paid')
  const outstandingBalance = unpaidInvoices.reduce((sum, inv) => sum + inv.total, 0)
  const totalPaid = paidInvoices.reduce((sum, inv) => sum + inv.total, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/suppliers"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka till leverantörer
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{supplier.name}</h1>
              <div className="flex items-center gap-2">
                {supplier.category && <Badge variant="secondary">{supplier.category}</Badge>}
                {!supplier.is_active && <Badge variant="destructive">Inaktiv</Badge>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Redigera
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Ta bort
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Utestående skuld
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(outstandingBalance)}</p>
            <p className="text-xs text-muted-foreground">
              {unpaidInvoices.length} obetalda fakturor
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totalt betalt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(totalPaid)}</p>
            <p className="text-xs text-muted-foreground">
              {paidInvoices.length} betalda fakturor
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Antal fakturor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{invoices.length}</p>
            <p className="text-xs text-muted-foreground">
              Betalningsvillkor: {supplier.default_payment_terms} dagar
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kontaktuppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {supplier.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${supplier.email}`} className="hover:underline">
                  {supplier.email}
                </a>
              </div>
            )}
            {supplier.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {supplier.phone}
              </div>
            )}
            {(supplier.address_line1 || supplier.city) && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  {supplier.address_line1 && <p>{supplier.address_line1}</p>}
                  {(supplier.postal_code || supplier.city) && (
                    <p>{[supplier.postal_code, supplier.city].filter(Boolean).join(' ')}</p>
                  )}
                  {supplier.country && supplier.country !== 'SE' && <p>{supplier.country}</p>}
                </div>
              </div>
            )}
            {!supplier.email && !supplier.phone && !supplier.address_line1 && (
              <p className="text-sm text-muted-foreground">Inga kontaktuppgifter</p>
            )}
          </CardContent>
        </Card>

        {/* Business details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Företagsuppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {supplier.org_number && (
              <div className="text-sm">
                <span className="text-muted-foreground">Org.nr: </span>
                {supplier.org_number}
              </div>
            )}
            {supplier.vat_number && (
              <div className="text-sm">
                <span className="text-muted-foreground">VAT: </span>
                {supplier.vat_number}
              </div>
            )}
            {!supplier.org_number && !supplier.vat_number && (
              <p className="text-sm text-muted-foreground">Inga företagsuppgifter</p>
            )}
          </CardContent>
        </Card>

        {/* Payment details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Betalningsuppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {supplier.bankgiro && (
              <div className="text-sm">
                <span className="text-muted-foreground">Bankgiro: </span>
                {supplier.bankgiro}
              </div>
            )}
            {supplier.plusgiro && (
              <div className="text-sm">
                <span className="text-muted-foreground">Plusgiro: </span>
                {supplier.plusgiro}
              </div>
            )}
            {(supplier.clearing_number || supplier.account_number) && (
              <div className="text-sm">
                <span className="text-muted-foreground">Konto: </span>
                {[supplier.clearing_number, supplier.account_number].filter(Boolean).join('-')}
              </div>
            )}
            {supplier.iban && (
              <div className="text-sm">
                <span className="text-muted-foreground">IBAN: </span>
                {supplier.iban}
              </div>
            )}
            {!supplier.bankgiro && !supplier.plusgiro && !supplier.iban && !supplier.account_number && (
              <p className="text-sm text-muted-foreground">Inga betalningsuppgifter</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {supplier.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Anteckningar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{supplier.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Invoices */}
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices" className="gap-1">
            <Receipt className="h-4 w-4" />
            Fakturor
            {invoices.length > 0 && <Badge variant="secondary" className="ml-1">{invoices.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1">
            <CreditCard className="h-4 w-4" />
            Betalningar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Leverantörsfakturor</CardTitle>
              <Link href={`/supplier-invoices/create?supplier=${id}`}>
                <Button size="sm" variant="outline">
                  <Receipt className="h-4 w-4 mr-1" />
                  Ny faktura
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {invoices.length > 0 ? (
                <div className="space-y-2">
                  {invoices
                    .sort((a, b) => {
                      const dateA = a.due_date || a.invoice_date || ''
                      const dateB = b.due_date || b.invoice_date || ''
                      return dateB.localeCompare(dateA)
                    })
                    .map((invoice) => (
                      <Link
                        key={invoice.id}
                        href={`/supplier-invoices/${invoice.id}`}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div>
                          <p className="font-medium">{invoice.invoice_number}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(invoice.invoice_date)}
                            {invoice.due_date && ` - Förfaller ${formatDate(invoice.due_date)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm tabular-nums font-medium">
                            {formatCurrency(invoice.total)}
                          </span>
                          <AttestationBadge status={invoice.status} size="sm" />
                        </div>
                      </Link>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Inga fakturor kopplade till denna leverantör
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="py-8">
              <div className="flex flex-col items-center text-center">
                <Banknote className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Betalningshistorik</h3>
                <p className="text-muted-foreground mt-1">
                  {paidInvoices.length > 0
                    ? `${paidInvoices.length} betalda fakturor totalt ${formatCurrency(totalPaid)}`
                    : 'Inga betalningar registrerade'}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Redigera leverantör</DialogTitle>
          </DialogHeader>
          <SupplierForm
            onSubmit={handleUpdate}
            isLoading={isUpdating}
            initialData={{
              name: supplier.name,
              org_number: supplier.org_number || undefined,
              vat_number: supplier.vat_number || undefined,
              email: supplier.email || undefined,
              phone: supplier.phone || undefined,
              address_line1: supplier.address_line1 || undefined,
              postal_code: supplier.postal_code || undefined,
              city: supplier.city || undefined,
              country: supplier.country || undefined,
              bankgiro: supplier.bankgiro || undefined,
              plusgiro: supplier.plusgiro || undefined,
              iban: supplier.iban || undefined,
              bic: supplier.bic || undefined,
              clearing_number: supplier.clearing_number || undefined,
              account_number: supplier.account_number || undefined,
              default_payment_terms: supplier.default_payment_terms,
              category: supplier.category || undefined,
              notes: supplier.notes || undefined,
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
