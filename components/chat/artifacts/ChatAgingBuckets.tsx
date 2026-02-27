'use client'

import type { AgingBucketsArtifact } from '@/types/chat'

const BUCKET_COLORS = [
  'bg-green-500',
  'bg-yellow-400',
  'bg-orange-400',
  'bg-red-400',
  'bg-red-600',
]

interface ChatAgingBucketsProps {
  artifact: AgingBucketsArtifact
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('sv-SE').format(Math.round(amount))
}

export function ChatAgingBuckets({ artifact }: ChatAgingBucketsProps) {
  const { title, buckets, total } = artifact

  const maxAmount = Math.max(...buckets.map((b) => b.amount), 1)

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-sm font-bold tabular-nums">
          {formatAmount(total)} kr
        </span>
      </div>

      {/* Stacked bar */}
      {total > 0 && (
        <div className="flex h-6 rounded-md overflow-hidden mb-3">
          {buckets.map((bucket, i) => {
            const widthPercent = (bucket.amount / total) * 100
            if (widthPercent < 0.5) return null
            return (
              <div
                key={i}
                className={`${BUCKET_COLORS[i % BUCKET_COLORS.length]} transition-all`}
                style={{ width: `${widthPercent}%` }}
                title={`${bucket.label}: ${formatAmount(bucket.amount)} kr`}
              />
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div className="space-y-1.5">
        {buckets.map((bucket, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-sm ${BUCKET_COLORS[i % BUCKET_COLORS.length]}`}
              />
              <span className="text-muted-foreground">{bucket.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">
                {bucket.count} st
              </span>
              <span className="font-medium tabular-nums">
                {formatAmount(bucket.amount)} kr
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
