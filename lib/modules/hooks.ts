'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/use-toast'

/**
 * Generic CRUD hook for module data tables.
 * Handles loading, fetching, creating, updating, deleting with toast notifications.
 */
export function useModuleData<T extends { id: string }>(options: {
  table: string
  userIdColumn?: string  // default: 'user_id'
  orderBy?: { column: string; ascending?: boolean }
  filters?: Record<string, unknown>
}) {
  const [data, setData] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()
  const supabase = createClient()

  const fetch = useCallback(async () => {
    setIsLoading(true)
    let query = supabase.from(options.table).select('*')

    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        query = query.eq(key, value)
      })
    }

    if (options.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true })
    }

    const { data: result, error } = await query
    if (error) {
      toast({ title: 'Fel', description: error.message, variant: 'destructive' })
    } else {
      setData(result as T[])
    }
    setIsLoading(false)
  }, [options.table, options.filters, options.orderBy])

  const create = useCallback(async (item: Omit<T, 'id'>) => {
    const { error } = await supabase.from(options.table).insert(item)
    if (error) {
      toast({ title: 'Fel', description: error.message, variant: 'destructive' })
      return false
    }
    toast({ title: 'Sparat' })
    await fetch()
    return true
  }, [options.table, fetch])

  const update = useCallback(async (id: string, updates: Partial<T>) => {
    const { error } = await supabase.from(options.table).update(updates).eq('id', id)
    if (error) {
      toast({ title: 'Fel', description: error.message, variant: 'destructive' })
      return false
    }
    toast({ title: 'Uppdaterat' })
    await fetch()
    return true
  }, [options.table, fetch])

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from(options.table).delete().eq('id', id)
    if (error) {
      toast({ title: 'Fel', description: error.message, variant: 'destructive' })
      return false
    }
    toast({ title: 'Borttaget' })
    await fetch()
    return true
  }, [options.table, fetch])

  useEffect(() => { fetch() }, [fetch])

  return { data, isLoading, fetch, create, update, remove }
}

/**
 * Hook for managing dialog state (open/close, editing item)
 */
export function useModuleDialog<T>() {
  const [isOpen, setIsOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<T | null>(null)

  const openCreate = useCallback(() => {
    setEditingItem(null)
    setIsOpen(true)
  }, [])

  const openEdit = useCallback((item: T) => {
    setEditingItem(item)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setEditingItem(null)
  }, [])

  return { isOpen, editingItem, isEditing: editingItem !== null, openCreate, openEdit, close }
}
