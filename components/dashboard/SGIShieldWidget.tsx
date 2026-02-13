'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Shield, Info } from 'lucide-react'

interface SGIShieldWidgetProps {
  daysSinceLastPayout: number | null
}

export default function SGIShieldWidget({
  daysSinceLastPayout,
}: SGIShieldWidgetProps) {
  const maxDays = 90
  const days = daysSinceLastPayout ?? 0
  const progress = daysSinceLastPayout !== null ? Math.min((days / maxDays) * 100, 100) : 0

  // Determine status
  let level: 'green' | 'yellow' | 'red'
  let statusMessage: string | null = null

  if (daysSinceLastPayout === null) {
    level = 'green'
  } else if (days < 30) {
    level = 'green'
  } else if (days < 75) {
    level = 'yellow'
    statusMessage = 'Varning: Logga uppdrag snart'
  } else {
    level = 'red'
    statusMessage = 'Kritiskt: SGI riskerar nollst\u00e4llning'
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield
              className={cn(
                'h-5 w-5',
                level === 'green' && 'text-emerald-500',
                level === 'yellow' && 'text-amber-500',
                level === 'red' && 'text-red-500'
              )}
            />
            <CardTitle className="text-lg">SGI-skydd</CardTitle>
          </div>
          {daysSinceLastPayout !== null && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {days} dagar sedan senast
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {daysSinceLastPayout === null ? (
          <div className="flex items-start gap-3 py-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-muted-foreground">
                Inga utbetalningar registrerade \u00e4nnu
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                SGI (sjukpenninggrundande inkomst) baseras p\u00e5 dina l\u00f6neutbetalningar.
                Logga din f\u00f6rsta utbetalning f\u00f6r att b\u00f6rja sp\u00e5ra.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="w-full h-3 rounded-full overflow-hidden bg-muted mb-2">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  level === 'green' && 'bg-emerald-500',
                  level === 'yellow' && 'bg-amber-500',
                  level === 'red' && 'bg-red-500'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">{days}/{maxDays}</span>
              <span>N\u00e4sta varning: dag 30 {'\u00b7'} Kritisk: dag 75</span>
            </div>

            {/* Status message */}
            {statusMessage && (
              <div className="mt-3">
                <Badge
                  variant={level === 'red' ? 'destructive' : 'warning'}
                  className="text-xs"
                >
                  {statusMessage}
                </Badge>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
