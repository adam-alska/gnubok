'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Search, Loader2, AlertTriangle, Clock, Banknote } from 'lucide-react'
import SupplierInvoiceList from '@/components/suppliers/SupplierInvoiceList'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SupplierInvoice, SupplierInvoiceStatus, Supplier } from '@/types/suppliers'

export default function SupplierInvoicesPage() {
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [summary, setSummary] = useState({ outstanding: 0, overdue_total: 0, overdue_count: 0 })
  const { toast } = useToast()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchInvoices()
    fetchSuppliers()
  }, [statusFilter, supplierFilter])

  async function fetchSuppliers() {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name')

    setSuppliers((data || []) as Supplier[])
  }

  async function fetchInvoices() {
    setIsLoading(true)

    const params = new URLSearchParams()
    params.set('per_page', '100')
    if (statusFilter && statusFilter !== 'all') {
      params.set('status', statusFilter)
    }
    if (supplierFilter && supplierFilter !== 'all') {
      params.set('supplier_id', supplierFilter)
    }

    try {
      const response = await fetch(`/api/supplier-invoices?${params.toString()}`)
      const result = await response.json()

      if (response.ok) {
        setInvoices(result.data || [])
        setSummary(result.summary || { outstanding: 0, overdue_total: 0, overdue_count: 0 })
      } else {
        toast({
          title: 'Fel',
          description: 'Kunde inte hämta fakturor',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta fakturor',
        variant: 'destructive',
      })
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
      const selectableInvoices = filteredInvoices.filter(
        (inv) => ['approved', 'attested'].includes(inv.status)
      )
      setSelectedIds(new Set(selectableInvoices.map((inv) => inv.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  async function handleCreatePayment() {
    if (selectedIds.size === 0) return

    const selectedInvoices = invoices.filter((inv) => selectedIds.has(inv.id))
    const totalAmount = selectedInvoices.reduce((sum, inv) => sum + inv.total, 0)

    try {
      const response = await fetch('/api/supplier-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_date: new Date().toISOString().split('T')[0],
          invoice_ids: Array.from(selectedIds),
        }),
      })

      const result = await response.json()

      if (response.ok) {
        toast({
          title: 'Betalning skapad',
          description: `${selectedIds.size} fakturor, totalt ${formatCurrency(totalAmount)}`,
        })
        setSelectedIds(new Set())
        router.push(`/supplier-payments`)
      } else {
        toast({
          title: 'Fel',
          description: result.error || 'Kunde inte skapa betalning',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte skapa betalning',
        variant: 'destructive',
      })
    }
  }

  const filteredInvoices = invoices.filter((invoice) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      invoice.invoice_number.toLowerCase().includes(term) ||
      invoice.supplier?.name.toLowerCase().includes(term) ||
      invoice.ocr_number?.toLowerCase().includes(term)
    )
  })

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leverantörsfakturor</h1>
          <p className="text-muted-foreground">
            Hantera inkommande fakturor och betalningar
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button onClick={handleCreatePayment}>
              <Banknote className="mr-2 h-4 w-4" />
              Skapa betalning ({selectedIds.size})
            </Button>
          )}
          <Link href="/supplier-invoices/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ny faktura
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Utestående
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatCurrency(summary.outstanding)}</p>
          </CardContent>
        </Card>
        <Card className={summary.overdue_count > 0 ? 'border-destructive/50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Förfallna
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold tabular-nums ${summary.overdue_count > 0 ? 'text-destructive' : ''}`}>
              {formatCurrency(summary.overdue_total)}
            </p>
            {summary.overdue_count > 0 && (
              <p className="text-xs text-destructive">
                {summary.overdue_count} faktura{summary.overdue_count !== 1 ? 'or' : ''}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Banknote className="h-4 w-4" />
              Antal fakturor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{invoices.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök fakturanummer, leverantör, OCR..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla statusar</SelectItem>
              <SelectItem value="draft">Utkast</SelectItem>
              <SelectItem value="received">Mottagen</SelectItem>
              <SelectItem value="attested">Attesterad</SelectItem>
              <SelectItem value="approved">Godkänd</SelectItem>
              <SelectItem value="scheduled">Schemalagd</SelectItem>
              <SelectItem value="paid">Betald</SelectItem>
              <SelectItem value="disputed">Bestridd</SelectItem>
              <SelectItem value="credited">Krediterad</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Leverantör" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla leverantörer</SelectItem>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Invoice list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <SupplierInvoiceList
              invoices={filteredInvoices}
              selectable
              selectedIds={selectedIds}
              onSelectChange={handleSelectChange}
              onSelectAll={handleSelectAll}
              showSupplier
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
