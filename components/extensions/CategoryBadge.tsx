'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ExtensionCategory } from '@/lib/extensions/types'

const CATEGORY_CONFIG: Record<ExtensionCategory, { label: string; className: string }> = {
  accounting: { label: 'Bokföring & Skatt', className: 'bg-rose-100 text-rose-700 border-rose-200' },
  reports: { label: 'Branschrapporter', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  import: { label: 'Smart Import', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  operations: { label: 'Verktyg', className: 'bg-slate-100 text-slate-700 border-slate-200' },
}

export default function CategoryBadge({ category }: { category: ExtensionCategory }) {
  const config = CATEGORY_CONFIG[category]
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', config.className)}>
      {config.label}
    </Badge>
  )
}
