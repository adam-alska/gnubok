'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { SectorGroupEntry } from '@/hooks/useNavModules'

interface NavModuleSectionProps {
  sectorGroups: SectorGroupEntry[]
  activeHref: string
  /** Called after clicking a link (used by mobile drawer to close) */
  onNavigate?: () => void
  /** Desktop vs mobile styling variant */
  variant?: 'desktop' | 'mobile'
}

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname.startsWith(href)
}

export default function NavModuleSection({
  sectorGroups,
  activeHref,
  onNavigate,
  variant = 'desktop',
}: NavModuleSectionProps) {
  const [expandedSectors, setExpandedSectors] = useState<Record<string, boolean>>({})
  const isMobile = variant === 'mobile'

  const toggleSector = (slug: string) => {
    setExpandedSectors(prev => ({ ...prev, [slug]: !(prev[slug] ?? false) }))
  }

  if (sectorGroups.length === 0) return null

  return (
    <div className="mb-4">
      <p
        className={cn(
          'text-muted-foreground uppercase tracking-wider font-medium',
          isMobile
            ? 'px-3 py-2 text-xs'
            : 'px-3 mb-2 text-[11px]'
        )}
      >
        Dina moduler
      </p>
      {sectorGroups.map(([sectorSlug, group]) => {
        const SectorIcon = group.icon
        const expanded = expandedSectors[sectorSlug] ?? false
        return (
          <div key={sectorSlug} className="mb-2">
            <button
              onClick={() => toggleSector(sectorSlug)}
              className={cn(
                'w-full flex items-center justify-between font-medium text-muted-foreground/70 tracking-wider hover:text-foreground transition-colors',
                isMobile
                  ? 'px-3 py-1.5 text-xs'
                  : 'px-3 py-1 text-[11px]'
              )}
            >
              <span className="flex items-center gap-1.5">
                <SectorIcon className={isMobile ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
                {group.name}
              </span>
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            {expanded && (
              <div className={cn(isMobile ? 'animate-fade-in' : 'space-y-0.5 animate-fade-in')}>
                {group.modules.map((item) => {
                  const Icon = item.icon
                  const active = isActive(activeHref, item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        isMobile
                          ? 'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors'
                          : 'group flex items-center px-3 py-2 text-sm transition-all duration-200 rounded-lg',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : isMobile
                            ? 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                      )}
                    >
                      <Icon
                        className={cn(
                          isMobile
                            ? 'h-5 w-5'
                            : 'mr-3 h-4 w-4 flex-shrink-0',
                          !isMobile && (active
                            ? 'text-primary'
                            : 'text-muted-foreground group-hover:text-foreground'),
                          isMobile && active && 'text-primary',
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
