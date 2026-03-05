'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { KpiCardsArtifact } from '@/types/chat'

interface ChatKpiCardsProps {
  artifact: KpiCardsArtifact
}

export function ChatKpiCards({ artifact }: ChatKpiCardsProps) {
  const { title, cards } = artifact

  return (
    <div className="w-full">
      {title && <h4 className="text-sm font-semibold mb-2">{title}</h4>}
      <div className="grid grid-cols-2 gap-2">
        {cards.map((card, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-3"
          >
            <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold tabular-nums">{card.value}</span>
              {card.trend && (
                <span
                  className={`flex items-center gap-0.5 text-xs ${
                    card.trend === 'up'
                      ? 'text-success'
                      : card.trend === 'down'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  }`}
                >
                  {card.trend === 'up' && <TrendingUp className="h-3 w-3" />}
                  {card.trend === 'down' && <TrendingDown className="h-3 w-3" />}
                  {card.trend === 'flat' && <Minus className="h-3 w-3" />}
                  {card.change}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
