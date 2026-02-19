'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Receipt,
  ArrowLeftRight,
  Camera,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import type { EntityType } from '@/types'
import type { SectorGroupEntry } from '@/hooks/useNavModules'
import NavItems from './NavItems'
import NavModuleSection from './NavModuleSection'
import { navItems, groupLabels, type NavItemDef } from './nav-config'

interface MobileNavProps {
  companyName: string
  entityType: EntityType
  sectorGroups: SectorGroupEntry[]
}

const mobileBottomItems = [
  { href: '/', label: 'Översikt', icon: LayoutDashboard },
  { href: '/invoices', label: 'Fakturor', icon: Receipt },
  { href: '/receipts/scan', label: 'Skanna', icon: Camera, isScan: true },
  { href: '/transactions', label: 'Transaktioner', icon: ArrowLeftRight },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname.startsWith(href)
}

export default function MobileNav({ companyName, entityType, sectorGroups }: MobileNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const closeMobileMenu = () => setIsMobileMenuOpen(false)

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
    <>
      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/98 backdrop-blur-sm border-t border-border/40" aria-label="Mobilnavigation">
        <div className="flex items-center justify-around h-16 px-2">
          {mobileBottomItems.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)
            const isScan = 'isScan' in item && item.isScan

            if (isScan) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label="Skanna kvitto"
                  className="flex flex-col items-center justify-center flex-1 h-full -mt-3"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-accent text-accent-foreground shadow-md">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="text-[10px] mt-0.5 text-accent font-medium">{item.label}</span>
                </Link>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full text-xs transition-colors duration-200',
                  active
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <Icon className={cn(
                  "h-5 w-5 mb-1",
                  active && "text-primary"
                )} />
                <span className={cn(
                  "truncate",
                  active && "font-medium"
                )}>{item.label}</span>
              </Link>
            )
          })}
          {/* Menu button */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Öppna meny"
            className="flex flex-col items-center justify-center flex-1 h-full text-xs text-muted-foreground transition-colors duration-200"
          >
            <Menu className="h-5 w-5 mb-1" />
            <span>Meny</span>
          </button>
        </div>
      </nav>

      {/* Mobile menu drawer */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div
            className="md:hidden fixed right-0 top-0 bottom-0 w-72 bg-card border-l border-border/40 z-50 overflow-y-auto animate-in slide-in-from-right duration-300"
            role="dialog"
            aria-label="Navigeringsmeny"
          >
            <div className="p-4 border-b border-border/40 flex items-center justify-between">
              <div>
                <p className="font-medium truncate">{companyName}</p>
                <p className="text-xs text-muted-foreground">Meny</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeMobileMenu}
                aria-label="Stäng meny"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Grouped navigation */}
            <div className="p-2">
              {/* Main section */}
              <div className="mb-4">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Huvudmeny
                </p>
                <NavItems items={mainItems} activeHref={pathname} onNavigate={closeMobileMenu} variant="mobile" />
              </div>

              {/* Finance section */}
              <div className="mb-4">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Finans
                </p>
                <NavItems items={finansItems} activeHref={pathname} onNavigate={closeMobileMenu} variant="mobile" />
              </div>

              {/* Dina moduler - sector groups */}
              <NavModuleSection
                sectorGroups={sectorGroups}
                activeHref={pathname}
                onNavigate={closeMobileMenu}
                variant="mobile"
              />

              {/* Moduler section */}
              <div className="mb-4">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Företagsmoduler
                </p>
                <NavItems items={modulerItems} activeHref={pathname} onNavigate={closeMobileMenu} variant="mobile" />
              </div>

              {/* Other section */}
              <div className="mb-4">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Övrigt
                </p>
                <NavItems items={övrigtItems} activeHref={pathname} onNavigate={closeMobileMenu} variant="mobile" />
              </div>

              {/* Logout */}
              <div className="pt-4 border-t border-border/40">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    closeMobileMenu()
                    handleLogout()
                  }}
                >
                  <LogOut className="mr-3 h-5 w-5" />
                  Logga ut
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
