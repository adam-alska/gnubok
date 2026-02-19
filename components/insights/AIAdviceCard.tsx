'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Banknote,
  Landmark,
  Lightbulb,
} from 'lucide-react'
import type { AIAdvice, AIAdviceItem } from '@/types/financial-insights'

interface AIAdviceCardProps {
  initialAdvice?: AIAdvice | null
}

const categoryIcons: Record<AIAdviceItem['category'], React.ElementType> = {
  cost_reduction: TrendingDown,
  revenue_growth: TrendingUp,
  cash_flow: Banknote,
  tax: Landmark,
  general: Lightbulb,
}

const categoryLabels: Record<AIAdviceItem['category'], string> = {
  cost_reduction: 'Kostnadsoptimering',
  revenue_growth: 'Intaktsokring',
  cash_flow: 'Kassaflode',
  tax: 'Skatt',
  general: 'Allmant',
}

const priorityVariants: Record<AIAdviceItem['priority'], 'destructive' | 'warning' | 'secondary'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
}

export default function AIAdviceCard({ initialAdvice }: AIAdviceCardProps) {
  const [advice, setAdvice] = useState<AIAdvice | null>(initialAdvice || null)
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/insights/ai-advice', { method: 'POST' })
      if (res.ok) {
        const { data } = await res.json()
        setAdvice(data)
      }
    } catch (err) {
      console.error('Failed to generate AI advice:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI-radgivare</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGenerate}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {advice ? 'Uppdatera' : 'Generera rad'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Personliga insikter baserade pa din ekonomiska data
        </p>
      </CardHeader>
      <CardContent>
        {loading && !advice ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                <div className="h-3 w-full bg-muted/50 animate-pulse rounded" />
                <div className="h-3 w-3/4 bg-muted/30 animate-pulse rounded" />
              </div>
            ))}
          </div>
        ) : advice && advice.insights.length > 0 ? (
          <div className="space-y-4">
            {advice.insights.map((item, index) => {
              const Icon = categoryIcons[item.category] || Lightbulb
              return (
                <div
                  key={index}
                  className="flex gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-primary/10 h-fit flex-shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-medium text-sm">{item.title}</h4>
                      <Badge
                        variant={priorityVariants[item.priority]}
                        className="text-[9px] px-1.5 py-0 flex-shrink-0"
                      >
                        {item.priority === 'high' ? 'Hog' : item.priority === 'medium' ? 'Medel' : 'Lag'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                    <span className="inline-block text-[10px] text-muted-foreground mt-1.5 bg-muted/50 px-1.5 py-0.5 rounded">
                      {categoryLabels[item.category]}
                    </span>
                  </div>
                </div>
              )
            })}
            {advice.cached && (
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Genererad {new Date(advice.generatedAt).toLocaleDateString('sv-SE')} (cachad)
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-1">
              Fa personliga insikter med AI
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Baserat pa din ekonomiska data ger vi dig konkreta rad
            </p>
            <Button onClick={handleGenerate} disabled={loading} size="sm" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Generera insikter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
