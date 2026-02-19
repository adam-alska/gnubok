'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Calendar, CheckCircle2, Clock } from 'lucide-react'
import { DepreciationPostingPreview } from '@/components/assets/DepreciationPostingPreview'
import { AssetCategoryManager } from '@/components/assets/AssetCategoryManager'
import type { DepreciationPostingPreview as PreviewType } from '@/types/fixed-assets'

const MONTH_NAMES = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
]

export default function DepreciationPage() {
  const { toast } = useToast()
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [selectedYear, setSelectedYear] = useState(String(currentYear))
  const [selectedMonth, setSelectedMonth] = useState(String(currentMonth))
  const [preview, setPreview] = useState<PreviewType[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  // History of posted months
  const [postedMonths, setPostedMonths] = useState<string[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const year = parseInt(selectedYear)
  const month = parseInt(selectedMonth)
  const period = `${year}-${String(month).padStart(2, '0')}`

  const fetchPreview = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/depreciation/preview?year=${year}&month=${month}`)
      const json = await res.json()

      if (json.data) {
        setPreview(json.data.entries || [])
        setTotalAmount(json.data.total_amount || 0)
      }
    } catch {
      toast({
        title: 'Fel',
        description: 'Kunde inte hämta förhandsvisning',
        variant: 'destructive',
      })
    }
    setIsLoading(false)
  }, [year, month, toast])

  const fetchPostedHistory = useCallback(async () => {
    setHistoryLoading(true)
    // Get all posted schedule entries grouped by month for this year
    try {
      const res = await fetch(`/api/assets?status=active&per_page=1`)
      // We'll compute posted months from the preview data:
      // Check each month of the selected year for posted entries
      const months: string[] = []
      for (let m = 1; m <= 12; m++) {
        const checkRes = await fetch(`/api/depreciation/preview?year=${year}&month=${m}`)
        const checkJson = await checkRes.json()
        // If no entries to post, it might mean all are posted for that month
        if (checkJson.data && checkJson.data.count === 0 && m <= currentMonth) {
          months.push(`${year}-${String(m).padStart(2, '0')}`)
        }
      }
      setPostedMonths(months)
    } catch {
      // Ignore - non-critical
    }
    setHistoryLoading(false)
  }, [year, currentMonth])

  useEffect(() => {
    fetchPreview()
  }, [fetchPreview])

  useEffect(() => {
    fetchPostedHistory()
  }, [fetchPostedHistory])

  function handlePosted() {
    fetchPreview()
    fetchPostedHistory()
  }

  // Generate year options
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Avskrivningar"
        description="Bokför månatliga avskrivningar och hantera tillgångskategorier"
        action={
          <Link href="/assets">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka till register
            </Button>
          </Link>
        }
      />

      {/* Period Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Välj period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">År</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Månad</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Posting Preview */}
      <DepreciationPostingPreview
        entries={preview}
        totalAmount={totalAmount}
        period={period}
        isLoading={isLoading}
        onPosted={handlePosted}
      />

      {/* Calendar overview: posted months */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bokförda perioder {year}</CardTitle>
          <CardDescription>
            Översikt över vilka månader som har bokförda avskrivningar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="grid grid-cols-4 md:grid-cols-6 gap-3 animate-pulse">
              {MONTH_NAMES.map((_, i) => (
                <div key={i} className="h-16 bg-muted rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
              {MONTH_NAMES.map((name, i) => {
                const m = i + 1
                const monthKey = `${year}-${String(m).padStart(2, '0')}`
                const isPosted = postedMonths.includes(monthKey)
                const isFuture = year > currentYear || (year === currentYear && m > currentMonth)
                const isCurrent = year === currentYear && m === currentMonth

                return (
                  <button
                    key={m}
                    onClick={() => setSelectedMonth(String(m))}
                    className={`
                      rounded-lg p-3 text-center transition-colors border
                      ${String(m) === selectedMonth ? 'ring-2 ring-primary border-primary' : 'border-border/60'}
                      ${isPosted ? 'bg-success/10' : isFuture ? 'bg-muted/50 opacity-50' : 'bg-card'}
                      hover:border-primary/50
                    `}
                  >
                    <p className="text-xs font-medium">{name.slice(0, 3)}</p>
                    <div className="mt-1 flex justify-center">
                      {isPosted ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : isCurrent ? (
                        <Clock className="h-4 w-4 text-warning-foreground" />
                      ) : isFuture ? (
                        <div className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              Bokförd
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-warning-foreground" />
              Att bokföra
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Manager */}
      <AssetCategoryManager />
    </div>
  )
}
