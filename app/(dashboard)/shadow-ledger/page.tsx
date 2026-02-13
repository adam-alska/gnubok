'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import ShadowLedgerList from '@/components/shadow-ledger/ShadowLedgerList'
import { formatCurrency } from '@/lib/utils'
import {
  Plus,
  Wallet,
  ArrowDownToLine,
  Receipt,
  ShieldAlert,
  PiggyBank,
  Landmark,
} from 'lucide-react'
import type { ShadowLedgerEntry, ShadowLedgerSummary } from '@/types'

export default function ShadowLedgerPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // State
  const [entries, setEntries] = useState<ShadowLedgerEntry[]>([])
  const [summary, setSummary] = useState<ShadowLedgerSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)

  // Year filter
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(
    searchParams.get('year') || currentYear.toString()
  )
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i)

  // Fetch entries + summary
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [entriesRes, summaryRes] = await Promise.all([
        fetch(`/api/shadow-ledger?year=${selectedYear}`),
        fetch(`/api/shadow-ledger/summary?year=${selectedYear}`),
      ])

      if (entriesRes.ok) {
        const entriesData = await entriesRes.json()
        setEntries(entriesData.data || [])
      }

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json()
        setSummary(summaryData.data || null)
      }
    } catch (error) {
      console.error('Failed to fetch shadow ledger:', error)
      toast({
        title: 'Fel',
        description: 'Kunde inte h\u00e4mta skuggbokf\u00f6ring',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [selectedYear, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Year change
  const handleYearChange = (year: string) => {
    setSelectedYear(year)
    router.push(`/shadow-ledger?year=${year}`)
  }

  // Delete entry
  const handleDelete = async (id: string) => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/shadow-ledger/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Kunde inte ta bort post')
      }

      toast({ title: 'Post borttagen' })
      fetchData()
    } catch (error) {
      toast({
        title: 'Fel',
        description:
          error instanceof Error ? error.message : 'Kunde inte ta bort post',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // Summary cards data
  const summaryCards = summary
    ? [
        {
          label: 'Brutto i \u00e5r',
          value: formatCurrency(summary.total_gross),
          icon: Wallet,
          color: 'text-emerald-600',
        },
        {
          label: 'Netto i \u00e5r',
          value: formatCurrency(summary.total_net),
          icon: ArrowDownToLine,
          color: 'text-sky-600',
        },
        {
          label: 'Avgifter betalda',
          value: formatCurrency(summary.total_fees),
          icon: Receipt,
          color: 'text-amber-600',
        },
        {
          label: 'Skatt inneh\u00e5llen',
          value: formatCurrency(summary.total_tax_withheld),
          icon: Landmark,
          color: 'text-red-600',
        },
        {
          label: 'Pension avsatt',
          value: formatCurrency(summary.total_pension),
          icon: PiggyBank,
          color: 'text-violet-600',
        },
        {
          label: 'Virtuell skatteskuld',
          value: formatCurrency(summary.virtual_tax_debt),
          icon: ShieldAlert,
          color: 'text-destructive',
        },
      ]
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Skuggbokf\u00f6ring</h1>
          <p className="text-muted-foreground">
            \u00d6versikt \u00f6ver utbetalningar, avgifter och skatt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedYear} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild>
            <Link href="/shadow-ledger/new">
              <Plus className="mr-2 h-4 w-4" />
              Ny post
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-28 mb-2" />
                <Skeleton className="h-8 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaryCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                  <span className="text-sm text-muted-foreground">
                    {card.label}
                  </span>
                </div>
                <p className="text-2xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Entry List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <ShadowLedgerList
          entries={entries}
          onDelete={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </div>
  )
}
