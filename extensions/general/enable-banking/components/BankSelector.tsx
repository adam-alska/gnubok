'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Search, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Bank {
  name: string
  country: string
  logo?: string
  bic?: string
}

interface BankSelectorProps {
  onConnect: (bank: Bank) => void
  isConnecting?: boolean
  connectingBankName?: string | null
  className?: string
}

const POPULAR_BANK_NAMES = [
  'Nordea',
  'SEB',
  'Swedbank',
  'Handelsbanken',
  'Länsförsäkringar',
  'Skandia',
  'Danske Bank',
]

export function BankSelector({
  onConnect,
  isConnecting = false,
  connectingBankName = null,
  className,
}: BankSelectorProps) {
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchBanks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/extensions/ext/enable-banking/banks')
      if (!res.ok) throw new Error('Kunde inte hämta banklistan')
      const data = await res.json()
      setBanks(data.banks || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Något gick fel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBanks()
  }, [fetchBanks])

  const popularBanks = useMemo(
    () =>
      POPULAR_BANK_NAMES.map((name) =>
        banks.find((b) => b.name === name)
      ).filter((b): b is Bank => b !== undefined),
    [banks]
  )

  const filteredBanks = useMemo(() => {
    if (!searchQuery.trim()) {
      // Show all banks except popular ones
      const popularSet = new Set(POPULAR_BANK_NAMES)
      return banks
        .filter((b) => !popularSet.has(b.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    }
    const q = searchQuery.toLowerCase()
    return banks
      .filter((b) => b.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  }, [banks, searchQuery])

  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        {/* Popular banks skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-11 rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
        <div className="h-9 rounded-md bg-muted animate-pulse" />
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-10 rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex flex-col items-center gap-3 py-8', className)}>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchBanks}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Försök igen
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Popular banks grid */}
      {popularBanks.length > 0 && !searchQuery.trim() && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {popularBanks.map((bank) => {
            const connecting = isConnecting && connectingBankName === bank.name
            return (
              <button
                key={bank.name}
                type="button"
                disabled={isConnecting}
                onClick={() => onConnect(bank)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                  'hover:bg-muted/50 hover:border-primary/30',
                  connecting && 'border-primary bg-primary/5',
                  isConnecting && !connecting && 'opacity-50 cursor-not-allowed'
                )}
              >
                {connecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : bank.logo ? (
                  <img
                    src={bank.logo}
                    alt=""
                    className="h-4 w-4 object-contain"
                  />
                ) : null}
                <span className="truncate">{bank.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Sök bland alla banker..."
          className="pl-9 h-9"
        />
      </div>

      {/* Bank list */}
      <div className="max-h-[280px] overflow-auto space-y-1 rounded-lg border p-1">
        {filteredBanks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {searchQuery.trim() ? 'Inga banker matchar sökningen' : 'Inga banker tillgängliga'}
          </p>
        ) : (
          filteredBanks.map((bank) => {
            const connecting = isConnecting && connectingBankName === bank.name
            return (
              <button
                key={bank.name}
                type="button"
                disabled={isConnecting}
                onClick={() => onConnect(bank)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors text-left',
                  'hover:bg-muted/50',
                  connecting && 'bg-primary/5',
                  isConnecting && !connecting && 'opacity-50 cursor-not-allowed'
                )}
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                ) : bank.logo ? (
                  <img
                    src={bank.logo}
                    alt=""
                    className="h-4 w-4 object-contain flex-shrink-0"
                  />
                ) : (
                  <div className="h-4 w-4 flex-shrink-0" />
                )}
                <span>{bank.name}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
