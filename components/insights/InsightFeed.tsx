'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, Sparkles, RefreshCw } from 'lucide-react'
import InsightCard from './InsightCard'
import type { FinancialInsight } from '@/types/financial-insights'

interface InsightFeedProps {
  insights: FinancialInsight[]
  onRefresh?: () => void
  loading?: boolean
  maxVisible?: number
}

export default function InsightFeed({
  insights: initialInsights,
  onRefresh,
  loading,
  maxVisible = 4,
}: InsightFeedProps) {
  const [insights, setInsights] = useState(initialInsights)
  const [showAll, setShowAll] = useState(false)

  const activeInsights = insights.filter((i) => !i.is_dismissed)
  const unreadCount = activeInsights.filter((i) => !i.is_read).length
  const visibleInsights = showAll ? activeInsights : activeInsights.slice(0, maxVisible)
  const hasMore = activeInsights.length > maxVisible

  const handleDismiss = (id: string) => {
    setInsights((prev) => prev.filter((i) => i.id !== id))
  }

  if (activeInsights.length === 0 && !loading) {
    return (
      <div className="text-center py-8">
        <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">Inga aktiva insikter just nu</p>
        <p className="text-xs text-muted-foreground mt-1">
          Vi bevakar din ekonomi och meddelar dig om nagot viktigt hander
        </p>
        {onRefresh && (
          <Button variant="ghost" size="sm" onClick={onRefresh} className="mt-3 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Kontrollera nu
          </Button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-medium">Insikter</h3>
          {unreadCount > 0 && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0">
              {unreadCount} nya
            </Badge>
          )}
        </div>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted/30 animate-pulse rounded-xl" />
          ))
        ) : (
          visibleInsights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} onDismiss={handleDismiss} />
          ))
        )}
      </div>

      {hasMore && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          Visa alla ({activeInsights.length})
          <ChevronDown className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
