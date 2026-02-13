'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ProgressSegment {
  value: number
  color: string
  label?: string
}

interface SegmentedProgressProps {
  segments: ProgressSegment[]
  total: number
  height?: string
  className?: string
  showLabels?: boolean
}

export function SegmentedProgress({
  segments,
  total,
  height = 'h-2',
  className,
  showLabels = false,
}: SegmentedProgressProps) {
  const percentages = segments.map((segment) => ({
    ...segment,
    percentage: total > 0 ? (segment.value / total) * 100 : 0,
  }))

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-secondary',
          height
        )}
      >
        <div className="flex h-full w-full">
          {percentages.map((segment, index) => (
            <div
              key={index}
              className={cn(
                'h-full transition-all duration-700 ease-out',
                index === 0 && 'rounded-l-full',
                index === percentages.length - 1 && 'rounded-r-full'
              )}
              style={{
                width: `${segment.percentage}%`,
                backgroundColor: segment.color,
              }}
            />
          ))}
        </div>
      </div>
      {showLabels && (
        <div className="flex justify-between mt-2 text-xs">
          {percentages.map((segment, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-muted-foreground">
                {segment.label || `${segment.percentage.toFixed(0)}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Nordic color scheme for progress bars
export const PROGRESS_COLORS = {
  success: 'hsl(150 30% 40%)',        // Forest green
  warning: 'hsl(38 70% 55%)',         // Warm honey
  destructive: 'hsl(0 45% 55%)',      // Muted rose
  primary: 'hsl(145 20% 36%)',        // Sage
  muted: 'hsl(30 8% 45%)',            // Stone
  // Tax display - Nordic palette
  disponibelt: '#4d7c65',             // Sage green
  skatt: '#c17f59',                   // Terracotta
  moms: '#b8956c',                    // Warm honey
}

interface TaxProgressProps {
  disponibelt: number
  skattReservation: number
  momsReservation: number
  className?: string
}

export function TaxProgress({
  disponibelt,
  skattReservation,
  momsReservation,
  className,
}: TaxProgressProps) {
  const total = disponibelt + skattReservation + momsReservation

  const segments: ProgressSegment[] = [
    {
      value: disponibelt,
      color: PROGRESS_COLORS.disponibelt,
      label: 'Disponibelt',
    },
    {
      value: skattReservation,
      color: PROGRESS_COLORS.skatt,
      label: 'Skatt',
    },
  ]

  if (momsReservation > 0) {
    segments.push({
      value: momsReservation,
      color: PROGRESS_COLORS.moms,
      label: 'Moms',
    })
  }

  return (
    <SegmentedProgress
      segments={segments}
      total={total}
      height="h-3"
      className={className}
    />
  )
}
