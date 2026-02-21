'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface AccountTotal {
  account_number: string
  debit: number
  credit: number
  net: number
}

interface MonthlyTotal {
  month: string
  account_number: string
  debit: number
  credit: number
  net: number
}

interface UseAccountTotalsOptions {
  from: string
  to: string
  dateFrom?: string
  dateTo?: string
  groupBy?: 'month'
}

export function useAccountTotals(options: UseAccountTotalsOptions) {
  const [totals, setTotals] = useState<AccountTotal[]>([])
  const [monthly, setMonthly] = useState<MonthlyTotal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        from: options.from,
        to: options.to,
      })
      if (options.dateFrom) params.set('date_from', options.dateFrom)
      if (options.dateTo) params.set('date_to', options.dateTo)
      if (options.groupBy) params.set('group_by', options.groupBy)

      const res = await fetch(`/api/bookkeeping/account-totals?${params}`)
      if (res.ok) {
        const json = await res.json()
        if (mountedRef.current) {
          setTotals(json.totals ?? [])
          setMonthly(json.monthly ?? [])
        }
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [options.from, options.to, options.dateFrom, options.dateTo, options.groupBy])

  useEffect(() => {
    refresh()
  }, [refresh])

  const totalDebit = totals.reduce((sum, t) => sum + t.debit, 0)
  const totalCredit = totals.reduce((sum, t) => sum + t.credit, 0)
  const totalNet = totals.reduce((sum, t) => sum + t.net, 0)

  return {
    totals,
    monthly,
    isLoading,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    totalNet: Math.round(totalNet * 100) / 100,
    refresh,
  }
}
