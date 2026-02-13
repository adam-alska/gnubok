'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/use-toast'
import { PaymentCalendar } from '@/components/calendar/PaymentCalendar'
import type { Invoice, Deadline } from '@/types'

export default function CalendarPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [deadlines, setDeadlines] = useState<Deadline[]>([])
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setIsLoading(true)

    try {
      // Fetch invoices with customer names
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('*, customer:customers(name)')
        .order('due_date', { ascending: true })

      if (invoicesError) throw invoicesError

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

      setInvoices(invoicesData || [])
      setDeadlines(deadlinesData || [])
      setCustomers(customersData || [])
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta data',
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
      const { error } = await supabase.from('deadlines').insert([data])

      if (error) throw error

      toast({
        title: 'Deadline skapad',
        description: 'Din deadline har sparats',
      })

      fetchData()
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte skapa deadline',
        variant: 'destructive',
      })
      throw error
    }
  }

  const handleDeadlineToggle = async (deadline: Deadline) => {
    try {
      const { error } = await supabase
        .from('deadlines')
        .update({
          is_completed: !deadline.is_completed,
          completed_at: !deadline.is_completed ? new Date().toISOString() : null,
        })
        .eq('id', deadline.id)

      if (error) throw error

      toast({
        title: deadline.is_completed ? 'Markerad som ej klar' : 'Markerad som klar',
      })

      fetchData()
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte uppdatera deadline',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kalender</h1>
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
        <h1 className="text-3xl font-bold tracking-tight">Kalender</h1>
      </div>

      <PaymentCalendar
        invoices={invoices}
        deadlines={deadlines}
        customers={customers}
        onDeadlineCreate={handleDeadlineCreate}
        onDeadlineToggle={handleDeadlineToggle}
      />
    </div>
  )
}
