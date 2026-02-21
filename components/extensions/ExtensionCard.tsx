'use client'

import { Card, CardContent } from '@/components/ui/card'
import { resolveIcon } from '@/lib/extensions/icon-resolver'
import type { ExtensionDefinition } from '@/lib/extensions/types'
import CategoryBadge from './CategoryBadge'
import ExtensionToggleButton from './ExtensionToggleButton'
import Link from 'next/link'

export default function ExtensionCard({ extension }: { extension: ExtensionDefinition }) {
  const Icon = resolveIcon(extension.icon)

  return (
    <Card className="group relative">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <Link
                href={`/extensions/${extension.sector}/${extension.slug}`}
                className="text-sm font-medium hover:underline"
              >
                {extension.name}
              </Link>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {extension.description}
              </p>
              <div className="mt-2">
                <CategoryBadge category={extension.category} />
              </div>
            </div>
          </div>
          <ExtensionToggleButton
            sectorSlug={extension.sector}
            extensionSlug={extension.slug}
          />
        </div>
      </CardContent>
    </Card>
  )
}
