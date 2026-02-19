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
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DocumentStatusBadge } from '@/components/invoices/DocumentStatusBadge'
import { Plus, Search, FileText, Loader2 } from 'lucide-react'
import { QUOTE_STATUS_LABELS } from '@/types/invoices-enhanced'
import type { Quote, QuoteStatus } from '@/types/invoices-enhanced'

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    fetchQuotes()
  }, [])

  async function fetchQuotes() {
    setIsLoading(true)
    const { data, error } = await supabase
      .from('quotes')
      .select('*, customer:customers(id, name, email)')
      .order('quote_date', { ascending: false })

    if (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta offerter',
        variant: 'destructive',
      })
    } else {
      setQuotes((data || []) as Quote[])
    }
    setIsLoading(false)
  }

  const filteredQuotes = quotes.filter((quote) => {
    const customer = quote.customer as { name: string } | undefined
    const matchesSearch =
      quote.quote_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'active' && ['draft', 'sent'].includes(quote.status)) ||
      quote.status === activeTab

    return matchesSearch && matchesTab
  })

  const stats = {
    total: quotes.length,
    active: quotes.filter((q) => ['draft', 'sent'].includes(q.status)).length,
    accepted: quotes.filter((q) => q.status === 'accepted').length,
    totalValue: quotes
      .filter((q) => ['draft', 'sent', 'accepted'].includes(q.status))
      .reduce((sum, q) => sum + Number(q.total), 0),
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offerter"
        description="Skapa och hantera dina offerter"
        action={
          <Link href="/quotes/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ny offert
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
                <FileText className="h-6 w-6 text-primary" />
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
                <FileText className="h-6 w-6 text-warning" />
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
                <FileText className="h-6 w-6 text-success" />
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
            placeholder="Sök på offertnummer eller kund..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">Alla</TabsTrigger>
            <TabsTrigger value="active">Aktiva</TabsTrigger>
            <TabsTrigger value="accepted">Accepterade</TabsTrigger>
            <TabsTrigger value="converted">Konverterade</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredQuotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">
              {quotes.length === 0 ? 'Inga offerter ännu' : 'Inga träffar'}
            </h3>
            <p className="text-muted-foreground text-center mt-1 mb-4">
              {quotes.length === 0
                ? 'Skapa din första offert för att komma igång'
                : `Inga offerter matchar "${searchTerm}"`}
            </p>
            {quotes.length === 0 && (
              <Link href="/quotes/create">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Skapa offert
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredQuotes.map((quote) => {
            const customer = quote.customer as { name: string } | undefined
            const isExpired =
              quote.status === 'sent' && new Date(quote.valid_until) < new Date()

            return (
              <Link key={quote.id} href={`/quotes/${quote.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer border-l-4 border-l-primary/20">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{quote.quote_number}</p>
                            <DocumentStatusBadge type="quote" status={quote.status} />
                            {isExpired && (
                              <Badge variant="warning">Utgången</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {customer?.name} - {formatDate(quote.quote_date)}
                            {quote.valid_until && ` - Giltig till ${formatDate(quote.valid_until)}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium tabular-nums">
                          {formatCurrency(Number(quote.total), quote.currency)}
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
