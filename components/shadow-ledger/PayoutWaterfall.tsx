'use client'

import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'

interface PayoutWaterfallProps {
  grossAmount: number
  platformFee: number
  serviceFee: number
  pensionDeduction: number
  socialFees: number
  incomeTaxWithheld: number
  netAmount: number
}

interface Segment {
  label: string
  amount: number
  color: string
  isDeduction: boolean
  isPension?: boolean
}

export default function PayoutWaterfall({
  grossAmount,
  platformFee,
  serviceFee,
  pensionDeduction,
  socialFees,
  incomeTaxWithheld,
  netAmount,
}: PayoutWaterfallProps) {
  if (grossAmount <= 0) return null

  const segments: Segment[] = [
    {
      label: 'Brutto',
      amount: grossAmount,
      color: 'bg-emerald-500',
      isDeduction: false,
    },
    {
      label: 'Plattformsavgift',
      amount: platformFee,
      color: 'bg-orange-400',
      isDeduction: true,
    },
    {
      label: 'Serviceavgift',
      amount: serviceFee,
      color: 'bg-amber-500',
      isDeduction: true,
    },
    {
      label: 'Pension',
      amount: pensionDeduction,
      color: 'bg-violet-500',
      isDeduction: true,
      isPension: true,
    },
    {
      label: 'Arbetsgivaravgifter',
      amount: socialFees,
      color: 'bg-rose-400',
      isDeduction: true,
    },
    {
      label: 'Skatt',
      amount: incomeTaxWithheld,
      color: 'bg-red-500',
      isDeduction: true,
    },
    {
      label: 'Netto',
      amount: netAmount,
      color: 'bg-sky-500',
      isDeduction: false,
    },
  ].filter((s) => s.amount > 0)

  // Total for percentage calculation is the gross amount
  const total = grossAmount

  return (
    <div className="space-y-3">
      {/* Stacked bar */}
      <div className="flex h-8 w-full overflow-hidden rounded-lg bg-muted">
        {segments.map((segment) => {
          const widthPercent = Math.max((segment.amount / total) * 100, 2)
          return (
            <div
              key={segment.label}
              className={cn(
                segment.color,
                'relative flex items-center justify-center overflow-hidden transition-all duration-300',
                segment.isPension && 'ring-2 ring-violet-300 ring-inset'
              )}
              style={{ width: `${widthPercent}%` }}
              title={`${segment.label}: ${formatCurrency(segment.amount)}`}
            >
              {widthPercent > 8 && (
                <span className="truncate px-1 text-[10px] font-medium text-white">
                  {formatCurrency(segment.amount)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-1.5">
            <div
              className={cn(
                'h-2.5 w-2.5 rounded-sm',
                segment.color,
                segment.isPension && 'ring-1 ring-violet-300'
              )}
            />
            <span className="text-xs text-muted-foreground">
              {segment.isDeduction ? '\u2212' : ''}
              {segment.label}:{' '}
              <span className="font-medium text-foreground">
                {formatCurrency(segment.amount)}
              </span>
              {segment.isPension && (
                <span className="ml-1 text-[10px] font-medium text-violet-500">
                  (dold kostnad)
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
