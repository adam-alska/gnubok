'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, RefreshCw, Calendar, Pause, Play, Loader2 } from 'lucide-react'
import { RECURRING_FREQUENCY_LABELS } from '@/types/invoices-enhanced'
import type { RecurringInvoice, RecurringFrequency } from '@/types/invoices-enhanced'

export default function RecurringInvoicesPage() {
  const [recurring, setRecurring] = useState<RecurringInvoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    fetchRecurring()
  }, [])

  async function fetchRecurring() {
    setIsLoading(true)
    try {
      const response = await fetch('/api/recurring-invoices')
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error)
      }

      setRecurring(result.data || [])
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta återkommande fakturor',
        variant: 'destructive',
      })
    }
    setIsLoading(false)
  }

  async function toggleActive(id: string, currentActive: boolean) {
    try {
      const response = await fetch(`/api/recurring-invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      })

      if (!response.ok) {
        throw new Error('Kunde inte uppdatera')
      }

      toast({
        title: 'Uppdaterad',
        description: currentActive ? 'Pausad' : 'Aktiverad',
      })

      fetchRecurring()
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte uppdatera status',
        variant: 'destructive',
      })
    }
  }

  async function generateNow(id: string) {
    try {
      const response = await fetch(`/api/recurring-invoices/${id}/generate`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte generera faktura')
      }

      toast({
        title: 'Faktura genererad',
        description: 'En ny faktura har skapats från mallen',
      })

      fetchRecurring()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Något gick fel',
        variant: 'destructive',
      })
    }
  }

  const activeCount = recurring.filter((r) => r.is_active).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Återkommande fakturor"
        description="Hantera automatiska fakturor som genereras regelbundet"
        action={
          <Link href="/invoices/recurring/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ny återkommande faktura
            </Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Totalt</p>
                <p className="text-2xl font-bold tabular-nums">{recurring.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                <Play className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktiva</p>
                <p className="text-2xl font-bold tabular-nums">{activeCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : recurring.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Inga återkommande fakturor</h3>
            <p className="text-muted-foreground text-center mt-1 mb-4">
              Skapa en mall för att automatiskt generera fakturor
            </p>
            <Link href="/invoices/recurring/create">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Skapa mall
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {recurring.map((item) => {
            const customer = item.customer as { id: string; name: string; email: string } | undefined
            const itemsTotal = (item.items || []).reduce(
              (sum, i) => sum + i.quantity * i.unit_price,
              0
            )

            return (
              <Card
                key={item.id}
                className={`border-l-4 ${item.is_active ? 'border-l-success' : 'border-l-muted-foreground/30'}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${item.is_active ? 'bg-success/10' : 'bg-muted'}`}>
                        <RefreshCw className={`h-5 w-5 ${item.is_active ? 'text-success' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{item.template_name}</p>
                          <Badge variant={item.is_active ? 'success' : 'secondary'}>
                            {item.is_active ? 'Aktiv' : 'Pausad'}
                          </Badge>
                          <Badge variant="outline">
                            {RECURRING_FREQUENCY_LABELS[item.frequency as RecurringFrequency]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{customer?.name || 'Okänd kund'}</span>
                          <span>-</span>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Nästa: {formatDate(item.next_invoice_date)}</span>
                          </div>
                          {item.generated_count > 0 && (
                            <>
                              <span>-</span>
                              <span>{item.generated_count} genererade</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium tabular-nums mr-2">
                        {formatCurrency(itemsTotal, item.currency)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(item.id, item.is_active)}
                        title={item.is_active ? 'Pausa' : 'Aktivera'}
                      >
                        {item.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generateNow(item.id)}
                        disabled={!item.is_active}
                        title="Generera faktura nu"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
