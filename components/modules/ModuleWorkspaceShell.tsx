'use client'

import Link from 'next/link'
import { ArrowLeft, Settings } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CATEGORY_LABELS, type ModuleCategory } from '@/lib/modules-data'

interface ModuleWorkspaceShellProps {
  title: string
  description?: string
  category: ModuleCategory
  sectorName?: string
  backHref?: string
  settingsHref?: string
  actions?: React.ReactNode
  tabs?: React.ReactNode
  children: React.ReactNode
}

export function ModuleWorkspaceShell({
  title,
  description,
  category,
  sectorName,
  backHref = '/modules',
  settingsHref,
  actions,
  tabs,
  children,
}: ModuleWorkspaceShellProps) {
  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Tillbaka
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="secondary" className="text-xs">
              {CATEGORY_LABELS[category]}
            </Badge>
            {sectorName && (
              <Badge variant="outline" className="text-xs">
                {sectorName}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
          {settingsHref && (
            <Link href={settingsHref}>
              <Button variant="ghost" size="icon" title="Modulinställningar">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Tabs or content */}
      {tabs ? tabs : children}
    </div>
  )
}
