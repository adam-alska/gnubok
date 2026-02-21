'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ExtensionCategory } from '@/lib/extensions/types'

const CATEGORY_CONFIG: Record<ExtensionCategory, { label: string; className: string }> = {
  accounting: { label: 'Bokföring & Skatt', className: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800' },
  reports: { label: 'Branschrapporter', className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800' },
  import: { label: 'Smart Import', className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' },
  operations: { label: 'Verktyg', className: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700' },
}

export default function CategoryBadge({ category }: { category: ExtensionCategory }) {
  const config = CATEGORY_CONFIG[category]
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', config.className)}>
      {config.label}
    </Badge>
  )
}
