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
  Users,
  ArrowLeftRight,
  BookOpen,
  BarChart3,
  Settings,
  LogOut,
  Calculator,
  Upload,
  Calendar,
  Camera,
  Menu,
  X,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { EntityType } from '@/types'

interface DashboardNavProps {
  companyName: string
  entityType: EntityType
}

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  group: string
  modes?: EntityType[] // If set, only visible for these entity types. If not set, visible to all.
}

// All nav items for sidebar and mobile drawer
const navItems: NavItem[] = [
  { href: '/', label: 'Översikt', icon: LayoutDashboard, group: 'main' },
  { href: '/calendar', label: 'Kalender', icon: Calendar, group: 'main' },
  { href: '/invoices', label: 'Fakturor', icon: Receipt, group: 'finans' },
  { href: '/customers', label: 'Kunder', icon: Users, group: 'finans' },
  { href: '/transactions', label: 'Transaktioner', icon: ArrowLeftRight, group: 'finans' },
  { href: '/receipts', label: 'Kvitton', icon: Camera, group: 'finans' },
  { href: '/deductions', label: 'Avdrag', icon: Calculator, group: 'finans' },
  { href: '/bookkeeping', label: 'Bokföring', icon: BookOpen, group: 'finans' },
  { href: '/import', label: 'Importera', icon: Upload, group: 'övrigt' },
  { href: '/reports', label: 'Rapporter', icon: BarChart3, group: 'övrigt' },
  { href: '/help', label: 'Hjälp', icon: HelpCircle, group: 'övrigt' },
  { href: '/settings', label: 'Inställningar', icon: Settings, group: 'övrigt' },
]

const groupLabels: Record<string, string> = {
  main: 'Huvudmeny',
  finans: 'Finans',
  övrigt: 'Övrigt',
}

export default function DashboardNav({ companyName, entityType }: DashboardNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isOvrigtExpanded, setIsOvrigtExpanded] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname.startsWith(href)
  }

  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  // Filter nav items by entity type
  const filteredItems = navItems.filter(item =>
    !item.modes || item.modes.includes(entityType)
  )

  const mainItems = filteredItems.filter(i => i.group === 'main')
  const finansItems = filteredItems.filter(i => i.group === 'finans')
  const övrigtItems = filteredItems.filter(i => i.group === 'övrigt')

  const mobileNavItems = [
    { href: '/', label: 'Översikt', icon: LayoutDashboard },
    { href: '/invoices', label: 'Fakturor', icon: Receipt },
    { href: '/receipts/scan', label: 'Skanna', icon: Camera, isScan: true },
    { href: '/transactions', label: 'Transaktioner', icon: ArrowLeftRight },
  ]

  return (
    <>
      {/* Desktop sidebar */}
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
                <div className="space-y-0.5">
                  {mainItems.map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'group flex items-center px-3 py-2 text-sm transition-all duration-200 rounded-lg',
                          active
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                        )}
                      >
                        <Icon className={cn(
                          "mr-3 h-4 w-4 flex-shrink-0",
                          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* Separator */}
              <div className="border-t border-border/40 mx-3 mb-4" />

              {/* Finans group */}
              <div className="mb-4">
                <p className="px-3 mb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  {groupLabels.finans}
                </p>
                <div className="space-y-0.5">
                  {finansItems.map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'group flex items-center px-3 py-2 text-sm transition-all duration-200 rounded-lg',
                          active
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                        )}
                      >
                        <Icon className={cn(
                          "mr-3 h-4 w-4 flex-shrink-0",
                          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
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
                  <div className="space-y-0.5 animate-fade-in">
                    {övrigtItems.map((item) => {
                      const Icon = item.icon
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'group flex items-center px-3 py-2 text-sm transition-all duration-200 rounded-lg',
                            active
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                          )}
                        >
                          <Icon className={cn(
                            "mr-3 h-4 w-4 flex-shrink-0",
                            active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                          )} />
                          {item.label}
                        </Link>
                      )
                    })}
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

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/98 backdrop-blur-sm border-t border-border/40" aria-label="Mobilnavigation">
        <div className="flex items-center justify-around h-16 px-2">
          {mobileNavItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
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
                {mainItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobileMenu}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>

              {/* Finance section */}
              <div className="mb-4">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Finans
                </p>
                {finansItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobileMenu}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>

              {/* Other section */}
              <div className="mb-4">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Övrigt
                </p>
                {övrigtItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobileMenu}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  )
                })}
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
