'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, FileInput, AlertCircle, Clock } from 'lucide-react'
import Link from 'next/link'
import type { SupplierInvoice } from '@/types'

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const statusColors: Record<string, string> = {
  registered: 'bg-blue-100 text-blue-800',
  approved: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-success/10 text-success',
  partially_paid: 'bg-orange-100 text-orange-800',
  overdue: 'bg-destructive/10 text-destructive',
  disputed: 'bg-purple-100 text-purple-800',
  credited: 'bg-gray-100 text-gray-800',
}

const statusLabels: Record<string, string> = {
  registered: 'Registrerad',
  approved: 'Godkänd',
  paid: 'Betald',
  partially_paid: 'Delbetald',
  overdue: 'Förfallen',
  disputed: 'Tvist',
  credited: 'Krediterad',
}

export default function SupplierInvoicesPage() {
  const [invoices, setInvoices] = useState<(SupplierInvoice & { supplier?: { id: string; name: string } })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    fetchInvoices()
  }, [])

  async function fetchInvoices() {
    setIsLoading(true)
    const res = await fetch('/api/supplier-invoices?status=all')
    const { data } = await res.json()
    setInvoices(data || [])
    setIsLoading(false)
  }

  const filteredInvoices = invoices.filter((inv) => {
    switch (activeTab) {
      case 'registered': return inv.status === 'registered'
      case 'approved': return inv.status === 'approved'
      case 'to_pay': return inv.status === 'approved' || inv.status === 'overdue'
      case 'paid': return inv.status === 'paid'
      default: return true
    }
  })

  // Summary stats
  const totalUnpaid = invoices
    .filter((i) => !['paid', 'credited'].includes(i.status))
    .reduce((sum, i) => sum + i.remaining_amount, 0)
  const overdueAmount = invoices
    .filter((i) => i.status === 'overdue')
    .reduce((sum, i) => sum + i.remaining_amount, 0)
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leverantörsfakturor</h1>
          <p className="text-muted-foreground">
            Registrera och hantera inkommande fakturor
          </p>
        </div>
        <Link href="/supplier-invoices/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Registrera faktura
          </Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <FileInput className="h-4 w-4" />
              Totalt obetalt
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatAmount(totalUnpaid)} kr</p>
            <p className="text-xs text-muted-foreground">
              {invoices.filter((i) => !['paid', 'credited'].includes(i.status)).length} fakturor
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Förfallet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{formatAmount(overdueAmount)} kr</p>
            <p className="text-xs text-muted-foreground">{overdueCount} fakturor</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Antal fakturor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{invoices.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Alla</TabsTrigger>
          <TabsTrigger value="registered">Registrerade</TabsTrigger>
          <TabsTrigger value="approved">Godkända</TabsTrigger>
          <TabsTrigger value="to_pay">Att betala</TabsTrigger>
          <TabsTrigger value="paid">Betalda</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Laddar fakturor...
              </CardContent>
            </Card>
          ) : filteredInvoices.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileInput className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Inga fakturor</h3>
                <p className="text-muted-foreground text-center mt-1">
                  {activeTab === 'all'
                    ? 'Registrera din första leverantörsfaktura'
                    : 'Inga fakturor i denna kategori'}
                </p>
                {activeTab === 'all' && (
                  <Link href="/supplier-invoices/new">
                    <Button className="mt-4">
                      <Plus className="mr-2 h-4 w-4" />
                      Registrera faktura
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-3">Ankomst</th>
                      <th className="p-3">Leverantör</th>
                      <th className="p-3">Fakturanr</th>
                      <th className="p-3">Fakturadatum</th>
                      <th className="p-3">Förfaller</th>
                      <th className="p-3 text-right">Belopp</th>
                      <th className="p-3 text-right">Kvar att betala</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="p-3 font-mono">{inv.arrival_number}</td>
                        <td className="p-3">
                          <Link href={`/suppliers/${inv.supplier_id}`} className="hover:underline">
                            {inv.supplier?.name || '-'}
                          </Link>
                        </td>
                        <td className="p-3">
                          <Link href={`/supplier-invoices/${inv.id}`} className="text-primary hover:underline">
                            {inv.supplier_invoice_number}
                          </Link>
                        </td>
                        <td className="p-3">{inv.invoice_date}</td>
                        <td className="p-3">{inv.due_date}</td>
                        <td className="p-3 text-right font-mono">{formatAmount(inv.total)}</td>
                        <td className="p-3 text-right font-mono">{formatAmount(inv.remaining_amount)}</td>
                        <td className="p-3">
                          <Badge className={statusColors[inv.status] || ''}>
                            {statusLabels[inv.status] || inv.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
