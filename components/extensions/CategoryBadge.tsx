'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ExtensionCategory } from '@/lib/extensions/types'

const CATEGORY_CONFIG: Record<ExtensionCategory, { label: string; className: string }> = {
  accounting: { label: 'Bokföring & Skatt', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  reports: { label: 'Branschrapporter', className: 'bg-primary/10 text-primary border-primary/30' },
  import: { label: 'Smart Import', className: 'bg-success/10 text-success border-success/30' },
  operations: { label: 'Verktyg', className: 'bg-muted text-muted-foreground border-border' },
}

export default function CategoryBadge({ category }: { category: ExtensionCategory }) {
  const config = CATEGORY_CONFIG[category]
  return (
    <Badge variant="outline" className={cn('text-[10px] font-medium', config.className)}>
      {config.label}
    </Badge>
  )
}
