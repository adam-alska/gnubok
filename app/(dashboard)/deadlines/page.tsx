'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/use-toast'
import { DeadlineList } from '@/components/deadlines/DeadlineList'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { Deadline } from '@/types'

export default function DeadlinesPage() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [overdueInvoices, setOverdueInvoices] = useState<{ count: number; total: number }>({ count: 0, total: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    try {
      // Fetch deadlines with customer names
      const { data: deadlinesData, error: deadlinesError } = await supabase
        .from('deadlines')
        .select('*, customer:customers(name)')
        .order('due_date', { ascending: true })

      if (deadlinesError) throw deadlinesError

      // Fetch customers for the form
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id, name')
        .order('name', { ascending: true })

      if (customersError) throw customersError

      // Fetch overdue invoices summary
      const today = new Date().toISOString().split('T')[0]
      const { data: overdueData, error: overdueError } = await supabase
        .from('invoices')
        .select('total_sek, total')
        .in('status', ['sent', 'unpaid'])
        .lt('due_date', today)

      if (overdueError) throw overdueError

      const overdueCount = overdueData?.length || 0
      const overdueTotal = (overdueData || []).reduce(
        (sum, inv) => sum + (inv.total_sek || inv.total || 0),
        0
      )

      setDeadlines(deadlinesData || [])
      setCustomers(customersData || [])
      setOverdueInvoices({ count: overdueCount, total: overdueTotal })
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte hamta data',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDeadlineCreate = async (
    data: Omit<Deadline, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ) => {
    try {
      const response = await fetch('/api/deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to create deadline')
      }

      toast({
        title: 'Deadline skapad',
        description: 'Din deadline har sparats',
      })

      fetchData()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte skapa deadline',
        variant: 'destructive',
      })
      throw error
    }
  }

  const handleDeadlineToggle = async (deadline: Deadline) => {
    try {
      const response = await fetch(`/api/deadlines/${deadline.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed: !deadline.is_completed }),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to toggle deadline')
      }

      toast({
        title: deadline.is_completed ? 'Markerad som ej klar' : 'Markerad som klar',
      })

      fetchData()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte uppdatera deadline',
        variant: 'destructive',
      })
    }
  }

  const handleDeadlineEdit = async (deadline: Deadline) => {
    try {
      const response = await fetch(`/api/deadlines/${deadline.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deadline),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to edit deadline')
      }

      toast({
        title: 'Deadline uppdaterad',
        description: 'Dina ändringar har sparats',
      })

      fetchData()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte uppdatera deadline',
        variant: 'destructive',
      })
    }
  }

  const handleDeadlineDelete = async (deadline: Deadline) => {
    try {
      const response = await fetch(`/api/deadlines/${deadline.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to delete deadline')
      }

      toast({
        title: 'Deadline borttagen',
      })

      fetchData()
    } catch (error) {
      toast({
        title: 'Fel',
        description: error instanceof Error ? error.message : 'Kunde inte ta bort deadline',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deadlines</h1>
        </div>
        <div className="animate-pulse">
          <div className="h-10 bg-muted rounded w-48 mb-4" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Deadlines</h1>
      </div>

      {overdueInvoices.count > 0 && (
        <Link href="/invoices?status=unpaid" className="block group">
          <Card className="border-destructive/50 bg-destructive/5 hover:bg-destructive/10 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Forfallna fakturor</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {overdueInvoices.count} st totalt{' '}
                      {overdueInvoices.total.toLocaleString('sv-SE')} kr
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">{overdueInvoices.count}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      <DeadlineList
        deadlines={deadlines}
        customers={customers}
        onDeadlineCreate={handleDeadlineCreate}
        onDeadlineToggle={handleDeadlineToggle}
        onDeadlineEdit={handleDeadlineEdit}
        onDeadlineDelete={handleDeadlineDelete}
      />
    </div>
  )
}
