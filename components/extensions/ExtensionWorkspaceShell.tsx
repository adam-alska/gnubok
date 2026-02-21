'use client'

import type { ExtensionDefinition } from '@/lib/extensions/types'
import { getSector } from '@/lib/extensions/sectors'
import { resolveIcon } from '@/lib/extensions/icon-resolver'
import Link from 'next/link'

export default function ExtensionWorkspaceShell({
  definition,
  children,
}: {
  definition: ExtensionDefinition
  children: React.ReactNode
}) {
  const Icon = resolveIcon(definition.icon)
  const sector = getSector(definition.sector)

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6">
        <Link href="/extensions" className="hover:text-foreground transition-colors">
          Till\u00e4gg
        </Link>
        <span>/</span>
        <Link
          href={`/extensions/${definition.sector}`}
          className="hover:text-foreground transition-colors"
        >
          {sector?.name ?? definition.sector}
        </Link>
        <span>/</span>
        <span className="text-foreground">{definition.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 flex-shrink-0">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{definition.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{definition.description}</p>
        </div>
      </div>

      {/* Extension content */}
      {children}
    </div>
  )
}
