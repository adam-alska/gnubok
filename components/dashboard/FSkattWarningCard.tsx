'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { formatCurrency } from '@/lib/utils'
import {
  AlertTriangle,
  Info,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useState } from 'react'
import type { TaxWarningStatus } from '@/types'

interface FSkattWarningCardProps {
  warningStatus: TaxWarningStatus
  onAdjustClick?: () => void
}

export default function FSkattWarningCard({
  warningStatus,
  onAdjustClick,
}: FSkattWarningCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Don't show if everything is safe
  if (warningStatus.level === 'safe') {
    return null
  }

  // Icon and colors based on warning level
  const levelConfig = {
    safe: {
      icon: CheckCircle,
      iconColor: 'text-success',
      bgColor: 'bg-success/5',
      borderColor: 'border-success/50',
      badgeVariant: 'outline' as const,
    },
    info: {
      icon: Info,
      iconColor: 'text-primary',
      bgColor: 'bg-primary/5',
      borderColor: 'border-primary/20',
      badgeVariant: 'outline' as const,
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-warning',
      bgColor: 'bg-warning/5',
      borderColor: 'border-warning/50',
      badgeVariant: 'warning' as const,
    },
    danger: {
      icon: AlertCircle,
      iconColor: 'text-destructive',
      bgColor: 'bg-destructive/5',
      borderColor: 'border-destructive/50',
      badgeVariant: 'destructive' as const,
    },
  }

  const config = levelConfig[warningStatus.level]
  const Icon = config.icon

  return (
    <Card className={`${config.borderColor} ${config.bgColor}`}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Main warning */}
          <div className="flex items-start gap-3">
            <Icon className={`h-5 w-5 flex-shrink-0 ${config.iconColor}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <InfoTooltip
                  content={
                    <div className="space-y-2">
                      <p className="font-medium">Vad betyder detta?</p>
                      <p>Vi jämför din beräknade skatt med vad du betalat in via F-skatt hittills i år.</p>
                      <p className="text-xs text-muted-foreground">Om du betalat för lite kan du få restskatt. Justera din månatliga F-skatt för att undvika överraskningar.</p>
                    </div>
                  }
                  side="right"
                >
                  <p className="font-medium">F-skatt varning</p>
                </InfoTooltip>
                <Badge variant={config.badgeVariant}>
                  {Math.round(warningStatus.percentageDifference * 100)}% skillnad
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{warningStatus.message}</p>
            </div>
          </div>

          {/* Expandable projection section */}
          {warningStatus.yearEndProjection && (
            <div className="pt-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Årsprognos
                </span>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              {isExpanded && (
                <div className="mt-3 p-3 rounded-lg bg-background/50 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Beräknad årsskatt</span>
                    <span className="font-medium">
                      {formatCurrency(warningStatus.yearEndProjection.estimatedTotalTax)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Projicerad inbetalning</span>
                    <span className="font-medium">
                      {formatCurrency(warningStatus.yearEndProjection.projectedPreliminaryPayments)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span className="font-medium">Projicerad skillnad</span>
                    <span
                      className={
                        warningStatus.yearEndProjection.projectedDifference > 0
                          ? 'text-destructive font-medium'
                          : 'text-success font-medium'
                      }
                    >
                      {warningStatus.yearEndProjection.projectedDifference > 0 ? '+' : ''}
                      {formatCurrency(warningStatus.yearEndProjection.projectedDifference)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recommendation */}
          {warningStatus.recommendation && (
            <div className="p-3 rounded-lg bg-background/50 border border-border/50">
              <p className="text-sm">
                <span className="font-medium">Rekommendation: </span>
                {warningStatus.recommendation}
              </p>
            </div>
          )}

          {/* Action button */}
          {onAdjustClick && (
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={onAdjustClick}>
                Justera F-skatt
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
