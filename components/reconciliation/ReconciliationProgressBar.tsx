'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ReconciliationProgressBarProps {
  matched: number
  total: number
  className?: string
}

export default function ReconciliationProgressBar({
  matched,
  total,
  className,
}: ReconciliationProgressBarProps) {
  const percent = total > 0 ? Math.round((matched / total) * 100) : 0

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {matched} av {total} avstamda
        </span>
        <span className="font-medium">{percent}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          className={cn(
            'h-full rounded-full',
            percent === 100
              ? 'bg-green-500'
              : percent > 50
              ? 'bg-primary'
              : 'bg-amber-500'
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
