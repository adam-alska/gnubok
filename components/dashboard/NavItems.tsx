'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface NavItemDef {
  href: string
  label: string
  icon: LucideIcon
}

interface NavItemsProps {
  items: NavItemDef[]
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

export default function NavItems({
  items,
  activeHref,
  onNavigate,
  variant = 'desktop',
}: NavItemsProps) {
  const isMobile = variant === 'mobile'

  return (
    <div className={isMobile ? undefined : 'space-y-0.5'}>
      {items.map((item) => {
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
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
