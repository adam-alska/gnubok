'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Plus, Search, Wallet, Clock, AlertCircle } from 'lucide-react'
import type { SupplierInvoice } from '@/types'

type ExpenseInvoice = SupplierInvoice & { supplier?: { id: string; name: string } }

const UNPAID_STATUSES = ['registered', 'approved', 'overdue', 'partially_paid']
const PAID_STATUSES = ['paid', 'credited']

function getSimplifiedStatus(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive'; borderColor: string } {
  switch (status) {
    case 'registered':
    case 'approved':
      return { label: 'Obetald', variant: 'default', borderColor: 'border-l-warning' }
    case 'overdue':
      return { label: 'Förfallen', variant: 'destructive', borderColor: 'border-l-destructive' }
    case 'partially_paid':
      return { label: 'Delbetald', variant: 'default', borderColor: 'border-l-orange-400' }
    case 'paid':
      return { label: 'Betald', variant: 'secondary', borderColor: 'border-l-success' }
    case 'credited':
      return { label: 'Krediterad', variant: 'secondary', borderColor: 'border-l-muted-foreground/30' }
    default:
      return { label: status, variant: 'secondary', borderColor: 'border-l-muted-foreground/30' }
  }
}

function getRelativeTimeLabel(dueDateStr: string, status: string): { text: string; color: string } | null {
  if (PAID_STATUSES.includes(status)) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(dueDateStr)
  dueDate.setHours(0, 0, 0, 0)
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)} dagar försenad`, color: 'text-destructive' }
  } else if (diffDays === 0) {
    return { text: 'Förfaller idag', color: 'text-warning-foreground' }
  } else if (diffDays <= 3) {
    return { text: `${diffDays} dagar kvar`, color: 'text-warning-foreground' }
  } else if (diffDays <= 7) {
    return { text: `${diffDays} dagar kvar`, color: 'text-muted-foreground' }
  }
  return null
}

export default function ExpensesPage() {
  const [invoices, setInvoices] = useState<ExpenseInvoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('unpaid')
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchExpenses()
  }, [])

  async function fetchExpenses() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('supplier_invoices')
      .select('*, supplier:suppliers(id, name)')
      .order('due_date', { ascending: true })

    if (error) {
      toast({ title: 'Fel', description: 'Kunde inte hämta utgifter', variant: 'destructive' })
    } else {
      setInvoices(data || [])
    }
    setIsLoading(false)
  }

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      (inv.supplier?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.supplier_invoice_number.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesTab =
      activeTab === 'unpaid'
        ? UNPAID_STATUSES.includes(inv.status)
        : PAID_STATUSES.includes(inv.status)

    return matchesSearch && matchesTab
  })

  const unpaidInvoices = invoices.filter((i) => UNPAID_STATUSES.includes(i.status))
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue')

  const stats = {
    unpaidAmount: unpaidInvoices.reduce((sum, i) => sum + i.remaining_amount, 0),
    unpaidCount: unpaidInvoices.length,
    overdueAmount: overdueInvoices.reduce((sum, i) => sum + i.remaining_amount, 0),
    overdueCount: overdueInvoices.length,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utgifter"
        description="Registrera och hantera dina utgifter"
        action={
          <Link href="/expenses/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ny utgift
            </Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Att betala</p>
                <p className="text-2xl font-bold tabular-nums">{formatCurrency(stats.unpaidAmount)}</p>
                <p className="text-xs text-muted-foreground">{stats.unpaidCount} utgifter</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
                <AlertCircle className={`h-6 w-6 ${stats.overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
              <div>
                {stats.overdueCount > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">Förfallet</p>
                    <p className="text-2xl font-bold tabular-nums text-destructive">{formatCurrency(stats.overdueAmount)}</p>
                    <p className="text-xs text-muted-foreground">{stats.overdueCount} utgifter</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Totalt antal</p>
                    <p className="text-2xl font-bold tabular-nums">{invoices.length}</p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and tabs */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök på leverantör eller fakturanummer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="unpaid">Att betala</TabsTrigger>
            <TabsTrigger value="paid">Betalda</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Expense list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-5 bg-muted rounded w-32" />
                    <div className="h-4 bg-muted rounded w-48" />
                  </div>
                  <div className="h-8 bg-muted rounded w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredInvoices.length === 0 ? (
        <Card>
          <CardContent>
            {searchTerm ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Inga träffar</h3>
                <p className="text-muted-foreground text-center mt-1">
                  Inga utgifter matchar &quot;{searchTerm}&quot;
                </p>
              </div>
            ) : invoices.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Inga utgifter ännu"
                description="Registrera din första utgift. Vi bokför automatiskt och håller koll på betalningar."
                actionLabel="Ny utgift"
                actionHref="/expenses/new"
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Inga utgifter i denna kategori</h3>
                <p className="text-muted-foreground text-center mt-1">
                  Prova att byta flik för att se fler utgifter
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredInvoices.map((inv) => {
            const status = getSimplifiedStatus(inv.status)
            const relativeTime = inv.due_date ? getRelativeTimeLabel(inv.due_date, inv.status) : null

            return (
              <Link key={inv.id} href={`/expenses/${inv.id}`}>
                <Card className={`hover:border-primary/50 transition-colors cursor-pointer border-l-4 ${status.borderColor} ${inv.status === 'overdue' ? 'ring-1 ring-destructive/20' : ''}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          <Wallet className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{inv.supplier?.name || 'Okänd leverantör'}</p>
                            <Badge variant={status.variant as 'default' | 'secondary' | 'destructive'}>
                              {status.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-muted-foreground">
                              {inv.supplier_invoice_number} · Förfaller {inv.due_date}
                            </p>
                            {relativeTime && (
                              <span className={`text-xs font-medium ${relativeTime.color}`}>
                                {relativeTime.text}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium tabular-nums">
                          {formatCurrency(inv.total, inv.currency)}
                        </p>
                        {inv.remaining_amount !== inv.total && inv.remaining_amount > 0 && (
                          <p className="text-sm text-muted-foreground tabular-nums">
                            Kvar: {formatCurrency(inv.remaining_amount, inv.currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
