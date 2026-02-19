'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DocumentStatusBadge } from '@/components/invoices/DocumentStatusBadge'
import { Plus, Search, ShoppingCart, Loader2 } from 'lucide-react'
import type { Order, OrderStatus } from '@/types/invoices-enhanced'

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchOrders()
  }, [])

  async function fetchOrders() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, customer:customers(id, name, email)')
      .order('order_date', { ascending: false })

    if (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta ordrar',
        variant: 'destructive',
      })
    } else {
      setOrders((data || []) as Order[])
    }
    setIsLoading(false)
  }

  const filteredOrders = orders.filter((order) => {
    const customer = order.customer as { name: string } | undefined
    const matchesSearch =
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'active' && ['draft', 'confirmed', 'in_progress'].includes(order.status)) ||
      order.status === activeTab

    return matchesSearch && matchesTab
  })

  const stats = {
    total: orders.length,
    active: orders.filter((o) => ['draft', 'confirmed', 'in_progress'].includes(o.status)).length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
    totalValue: orders
      .filter((o) => !['cancelled'].includes(o.status))
      .reduce((sum, o) => sum + Number(o.total), 0),
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ordrar"
        description="Hantera dina ordrar"
        action={
          <Link href="/orders/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ny order
            </Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Totalt</p>
                <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktiva</p>
                <p className="text-2xl font-bold tabular-nums">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Totalt värde</p>
                <p className="text-2xl font-bold tabular-nums">{formatCurrency(stats.totalValue)}</p>
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
            placeholder="Sök på ordernummer eller kund..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Alla</TabsTrigger>
            <TabsTrigger value="active">Aktiva</TabsTrigger>
            <TabsTrigger value="delivered">Levererade</TabsTrigger>
            <TabsTrigger value="invoiced">Fakturerade</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">
              {orders.length === 0 ? 'Inga ordrar ännu' : 'Inga träffar'}
            </h3>
            <p className="text-muted-foreground text-center mt-1 mb-4">
              {orders.length === 0
                ? 'Skapa din första order eller konvertera en offert'
                : `Inga ordrar matchar "${searchTerm}"`}
            </p>
            {orders.length === 0 && (
              <Link href="/orders/create">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Skapa order
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredOrders.map((order) => {
            const customer = order.customer as { name: string } | undefined

            return (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer border-l-4 border-l-primary/20">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{order.order_number}</p>
                            <DocumentStatusBadge type="order" status={order.status} />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {customer?.name} - {formatDate(order.order_date)}
                            {order.delivery_date && ` - Leverans ${formatDate(order.delivery_date)}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium tabular-nums">
                          {formatCurrency(Number(order.total), order.currency)}
                        </p>
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
