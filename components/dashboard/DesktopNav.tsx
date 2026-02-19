'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LogOut, ChevronDown, ChevronUp } from 'lucide-react'
import type { EntityType } from '@/types'
import type { SectorGroupEntry } from '@/hooks/useNavModules'
import NavItems from './NavItems'
import NavModuleSection from './NavModuleSection'
import { navItems, groupLabels, type NavItemDef } from './nav-config'

interface DesktopNavProps {
  companyName: string
  entityType: EntityType
  sectorGroups: SectorGroupEntry[]
}

export default function DesktopNav({ companyName, entityType, sectorGroups }: DesktopNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [isOvrigtExpanded, setIsOvrigtExpanded] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Filter nav items by entity type
  const filteredItems = navItems.filter(item =>
    !item.modes || item.modes.includes(entityType)
  )

  const mainItems: NavItemDef[] = filteredItems.filter(i => i.group === 'main')
  const finansItems: NavItemDef[] = filteredItems.filter(i => i.group === 'finans')
  const modulerItems: NavItemDef[] = filteredItems.filter(i => i.group === 'moduler')
  const övrigtItems: NavItemDef[] = filteredItems.filter(i => i.group === 'övrigt')

  return (
    <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-60 md:flex-col">
      <div className="flex min-h-0 flex-1 flex-col border-r border-border/40 bg-card">
        <div className="flex flex-1 flex-col overflow-y-auto pt-8 pb-4">
          {/* Logo */}
          <div className="px-6 mb-10">
            <h1 className="font-display text-lg font-medium tracking-tight truncate">
              {companyName}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 tracking-wide uppercase">
              Ekonomi
            </p>
          </div>

          {/* Navigation with group headers */}
          <nav className="flex-1 px-3" aria-label="Huvudnavigation">
            {/* Huvudmeny group */}
            <div className="mb-4">
              <p className="px-3 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {groupLabels.main}
              </p>
              <NavItems items={mainItems} activeHref={pathname} variant="desktop" />
            </div>

            {/* Separator */}
            <div className="border-t border-border/40 mx-3 mb-4" />

            {/* Finans group */}
            <div className="mb-4">
              <p className="px-3 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {groupLabels.finans}
              </p>
              <NavItems items={finansItems} activeHref={pathname} variant="desktop" />
            </div>

            {/* Separator */}
            <div className="border-t border-border/40 mx-3 mb-4" />

            {/* Dina moduler - sector groups with enabled modules */}
            {sectorGroups.length > 0 && (
              <>
                <NavModuleSection
                  sectorGroups={sectorGroups}
                  activeHref={pathname}
                  variant="desktop"
                />
                {/* Separator */}
                <div className="border-t border-border/40 mx-3 mb-4" />
              </>
            )}

            {/* Moduler group - browse/manage modules */}
            <div className="mb-4">
              <p className="px-3 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {groupLabels.moduler}
              </p>
              <NavItems items={modulerItems} activeHref={pathname} variant="desktop" />
            </div>

            {/* Separator */}
            <div className="border-t border-border/40 mx-3 mb-4" />

            {/* Övrigt group - collapsible */}
            <div className="mb-4">
              <button
                onClick={() => setIsOvrigtExpanded(!isOvrigtExpanded)}
                className="w-full flex items-center justify-between px-3 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
              >
                <span>{groupLabels.övrigt}</span>
                {isOvrigtExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              {isOvrigtExpanded && (
                <div className="animate-fade-in">
                  <NavItems items={övrigtItems} activeHref={pathname} variant="desktop" />
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Logout button */}
        <div className="flex-shrink-0 p-4 border-t border-border/40">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground text-sm"
            onClick={handleLogout}
          >
            <LogOut className="mr-3 h-4 w-4" />
            Logga ut
          </Button>
        </div>
      </div>
    </aside>
  )
}
