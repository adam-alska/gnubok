'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import type { BASAccount } from '@/types'

const CLASS_LABELS: Record<number, string> = {
  1: 'Tillgångar',
  2: 'Eget kapital och skulder',
  3: 'Intäkter',
  4: 'Varor och material',
  5: 'Övriga externa kostnader',
  6: 'Övriga externa kostnader',
  7: 'Personal och avskrivningar',
  8: 'Finansiella poster',
}

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<BASAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedClasses, setExpandedClasses] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchAccounts()
  }, [])

  async function fetchAccounts() {
    const res = await fetch('/api/bookkeeping/accounts')
    const { data } = await res.json()
    setAccounts(data || [])
    setLoading(false)
  }

  const toggleClass = (cls: number) => {
    const next = new Set(expandedClasses)
    if (next.has(cls)) {
      next.delete(cls)
    } else {
      next.add(cls)
    }
    setExpandedClasses(next)
  }

  const filteredAccounts = accounts.filter((a) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      a.account_number.includes(q) ||
      a.account_name.toLowerCase().includes(q)
    )
  })

  const groupedByClass = filteredAccounts.reduce(
    (acc, account) => {
      const cls = account.account_class
      if (!acc[cls]) acc[cls] = []
      acc[cls].push(account)
      return acc
    },
    {} as Record<number, BASAccount[]>
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Laddar kontoplan...
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sök konto (nummer eller namn)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {Object.entries(groupedByClass)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([cls, classAccounts]) => {
            const classNum = Number(cls)
            const isExpanded = expandedClasses.has(classNum) || !!searchQuery

            return (
              <Card key={cls}>
                <button
                  onClick={() => toggleClass(classNum)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-semibold">
                      Klass {cls}: {CLASS_LABELS[classNum] || ''}
                    </span>
                    <Badge variant="secondary">{classAccounts.length} konton</Badge>
                  </div>
                </button>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 w-24">Konto</th>
                          <th className="py-2">Namn</th>
                          <th className="py-2 w-24 text-center">Typ</th>
                          <th className="py-2 w-24 text-center">Normal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classAccounts.map((account) => (
                          <tr
                            key={account.id}
                            className={`border-b last:border-0 ${
                              !account.is_active ? 'opacity-50' : ''
                            }`}
                          >
                            <td className="py-2 font-mono">{account.account_number}</td>
                            <td className="py-2">{account.account_name}</td>
                            <td className="py-2 text-center">
                              <Badge variant="outline" className="text-xs">
                                {account.account_type === 'asset'
                                  ? 'Tillgång'
                                  : account.account_type === 'liability'
                                    ? 'Skuld'
                                    : account.account_type === 'equity'
                                      ? 'EK'
                                      : account.account_type === 'revenue'
                                        ? 'Intäkt'
                                        : 'Kostnad'}
                              </Badge>
                            </td>
                            <td className="py-2 text-center text-xs text-muted-foreground">
                              {account.normal_balance === 'debit' ? 'Debet' : 'Kredit'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                )}
              </Card>
            )
          })}
      </div>
    </div>
  )
}
