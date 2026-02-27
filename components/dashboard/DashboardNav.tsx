'use client'

import { useState, useCallback, useEffect } from 'react'
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
  Upload,
  Calendar,
  Menu,
  X,
  HelpCircle,
  ChevronDown,
  Building2,
  FileInput,
  Store,
} from 'lucide-react'
import { getExtensionDefinition } from '@/lib/extensions/sectors'
import { resolveIcon } from '@/lib/extensions/icon-resolver'
import type { EntityType } from '@/types'

interface DashboardNavProps {
  companyName: string
  entityType: EntityType
  enabledExtensions?: { sector_slug: string; extension_slug: string }[]
  uncategorizedTransactionCount?: number
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
  { href: '/deadlines', label: 'Deadlines', icon: Calendar, group: 'main' },
  { href: '/invoices', label: 'Fakturor', icon: Receipt, group: 'finans' },
  { href: '/customers', label: 'Kunder', icon: Users, group: 'finans' },
  { href: '/suppliers', label: 'Leverantörer', icon: Building2, group: 'finans' },
  { href: '/supplier-invoices', label: 'Leverantörsfakturor', icon: FileInput, group: 'finans' },
  { href: '/transactions', label: 'Transaktioner', icon: ArrowLeftRight, group: 'finans' },
  { href: '/bookkeeping', label: 'Bokföring', icon: BookOpen, group: 'finans' },
  { href: '/reports', label: 'Rapporter', icon: BarChart3, group: 'finans' },
  { href: '/import', label: 'Importera', icon: Upload, group: 'finans' },
  { href: '/help', label: 'Hjälp', icon: HelpCircle, group: 'övrigt' },
  { href: '/settings', label: 'Inställningar', icon: Settings, group: 'övrigt' },
]

const groupLabels: Record<string, string> = {
  main: 'Huvudmeny',
  finans: 'Finans',
  övrigt: 'Övrigt',
}

export default function DashboardNav({ companyName, entityType, enabledExtensions, uncategorizedTransactionCount = 0 }: DashboardNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  // Auto-expand Övrigt when the user is on one of its pages, or when manually toggled
  const isOnOvrigtPage = ['/help', '/settings'].some(p => pathname.startsWith(p))
  const [manualOvrigtExpanded, setManualOvrigtExpanded] = useState(false)
  const isOvrigtExpanded = isOnOvrigtPage || manualOvrigtExpanded
  // Auto-expand Tillägg when on an extension page or marketplace, or when manually toggled (persisted)
  const isOnExtensionPage = pathname.startsWith('/e/') || pathname.startsWith('/extensions')
  const [manualTillaggExpanded, setManualTillaggExpanded] = useState(false)
  const isTillaggExpanded = isOnExtensionPage || manualTillaggExpanded

  // Restore persisted state after hydration to avoid SSR mismatch
  useEffect(() => {
    const stored = localStorage.getItem('tillagg-expanded') === 'true'
    if (stored) setManualTillaggExpanded(true)
  }, [])
  const [liveExtensions, setLiveExtensions] = useState(enabledExtensions ?? [])

  const fetchExtensions = useCallback(async () => {
    try {
      const res = await fetch('/api/extensions/toggles')
      if (res.ok) {
        const { data } = await res.json()
        if (data) setLiveExtensions(data)
      }
    } catch {
      // keep current state on error
    }
  }, [])

  // Fetch extensions on mount if Tillägg starts expanded
  useEffect(() => {
    if (isTillaggExpanded) fetchExtensions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleTillagg = () => {
    const next = !isTillaggExpanded
    setManualTillaggExpanded(next)
    localStorage.setItem('tillagg-expanded', String(next))
    if (next) fetchExtensions()
  }

  const openMobileMenu = () => {
    setIsMobileMenuOpen(true)
    fetchExtensions()
  }

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
    { href: '/transactions', label: 'Transaktioner', icon: ArrowLeftRight },
  ]

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-[232px] md:flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-r border-border/30 bg-card/80">
          <div className="flex flex-1 flex-col overflow-y-auto pt-7 pb-4">
            {/* Company name */}
            <div className="px-5 mb-8">
              <p className="text-[13px] font-semibold text-foreground truncate tracking-[-0.01em]">
                {companyName}
              </p>
            </div>

            {/* Navigation with group headers */}
            <nav className="flex-1 px-3" aria-label="Huvudnavigation">
              {/* Huvudmeny group */}
              <div className="mb-6">
                <p className="px-3 mb-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em]">
                  {groupLabels.main}
                </p>
                <div className="space-y-px">
                  {mainItems.map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'group flex items-center px-3 py-[7px] text-[13px] transition-colors duration-150 rounded-lg',
                          active
                            ? 'bg-primary/8 text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        )}
                      >
                        <Icon className={cn(
                          "mr-2.5 h-[15px] w-[15px] flex-shrink-0",
                          active ? "text-primary" : "text-muted-foreground/70 group-hover:text-muted-foreground"
                        )} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* Finans group */}
              <div className="mb-6">
                <p className="px-3 mb-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em]">
                  {groupLabels.finans}
                </p>
                <div className="space-y-px">
                  {finansItems.map((item) => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    const badge = item.href === '/transactions' && uncategorizedTransactionCount > 0
                      ? uncategorizedTransactionCount
                      : null
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'group flex items-center px-3 py-[7px] text-[13px] transition-colors duration-150 rounded-lg',
                          active
                            ? 'bg-primary/8 text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        )}
                      >
                        <Icon className={cn(
                          "mr-2.5 h-[15px] w-[15px] flex-shrink-0",
                          active ? "text-primary" : "text-muted-foreground/70 group-hover:text-muted-foreground"
                        )} />
                        <span className="flex-1">{item.label}</span>
                        {badge !== null && (
                          <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* Tillägg - collapsible, with marketplace link */}
              <div className="mb-4">
                <button
                  onClick={toggleTillagg}
                  className="w-full flex items-center justify-between px-3 mb-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em] hover:text-muted-foreground transition-colors"
                >
                  <span>Tillägg</span>
                  <ChevronDown className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    isTillaggExpanded && "rotate-180"
                  )} />
                </button>
                {isTillaggExpanded && (
                  <div className="space-y-px animate-fade-in">
                    {liveExtensions.length > 0 ? liveExtensions.map((toggle) => {
                      const def = getExtensionDefinition(toggle.sector_slug, toggle.extension_slug)
                      if (!def) return null
                      const ExtIcon = resolveIcon(def.icon)
                      const href = `/e/${toggle.sector_slug}/${toggle.extension_slug}`
                      const active = isActive(href)
                      return (
                        <Link
                          key={`${toggle.sector_slug}/${toggle.extension_slug}`}
                          href={href}
                          className={cn(
                            'group flex items-center px-3 py-[7px] text-[13px] transition-colors duration-150 rounded-lg',
                            active
                              ? 'bg-primary/8 text-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                          )}
                        >
                          <ExtIcon className={cn(
                            "mr-2.5 h-[15px] w-[15px] flex-shrink-0",
                            active ? "text-primary" : "text-muted-foreground/70 group-hover:text-muted-foreground"
                          )} />
                          {def.name}
                        </Link>
                      )
                    }) : (
                      <p className="px-3 py-2 text-[12px] text-muted-foreground/60">
                        Inga tillägg aktiverade
                      </p>
                    )}
                    <Link
                      href="/extensions"
                      className={cn(
                        'group flex items-center px-3 py-[7px] text-[13px] transition-colors duration-150 rounded-lg',
                        isActive('/extensions')
                          ? 'bg-primary/8 text-foreground font-medium'
                          : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40'
                      )}
                    >
                      <Store className={cn(
                        "mr-2.5 h-[15px] w-[15px] flex-shrink-0",
                        isActive('/extensions') ? "text-primary" : "text-muted-foreground/50 group-hover:text-muted-foreground"
                      )} />
                      Utforska fler...
                    </Link>
                  </div>
                )}
              </div>

              {/* Övrigt group - collapsible */}
              <div className="mb-4">
                <button
                  onClick={() => setManualOvrigtExpanded(!isOvrigtExpanded)}
                  className="w-full flex items-center justify-between px-3 mb-1.5 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-[0.08em] hover:text-muted-foreground transition-colors"
                >
                  <span>{groupLabels.övrigt}</span>
                  <ChevronDown className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    isOvrigtExpanded && "rotate-180"
                  )} />
                </button>
                {isOvrigtExpanded && (
                  <div className="space-y-px animate-fade-in">
                    {övrigtItems.map((item) => {
                      const Icon = item.icon
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'group flex items-center px-3 py-[7px] text-[13px] transition-colors duration-150 rounded-lg',
                            active
                              ? 'bg-primary/8 text-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                          )}
                        >
                          <Icon className={cn(
                            "mr-2.5 h-[15px] w-[15px] flex-shrink-0",
                            active ? "text-primary" : "text-muted-foreground/70 group-hover:text-muted-foreground"
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
          <div className="flex-shrink-0 px-3 py-3 border-t border-border/20">
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-foreground text-[13px] h-9 px-3"
              onClick={handleLogout}
            >
              <LogOut className="mr-2.5 h-[15px] w-[15px]" />
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
            const badge = item.href === '/transactions' && uncategorizedTransactionCount > 0
              ? uncategorizedTransactionCount
              : null

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex flex-col items-center justify-center flex-1 h-full text-xs transition-colors duration-200',
                  active
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <div className="relative">
                  <Icon className={cn(
                    "h-5 w-5 mb-1",
                    active && "text-primary"
                  )} />
                  {badge !== null && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-semibold px-0.5">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "truncate",
                  active && "font-medium"
                )}>{item.label}</span>
              </Link>
            )
          })}
          {/* Menu button */}
          <button
            onClick={openMobileMenu}
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

              {/* Tillägg */}
              <div className="mb-4">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Tillägg
                </p>
                {liveExtensions.length > 0 ? liveExtensions.map((toggle) => {
                  const def = getExtensionDefinition(toggle.sector_slug, toggle.extension_slug)
                  if (!def) return null
                  const ExtIcon = resolveIcon(def.icon)
                  const href = `/e/${toggle.sector_slug}/${toggle.extension_slug}`
                  const active = isActive(href)
                  return (
                    <Link
                      key={`${toggle.sector_slug}/${toggle.extension_slug}`}
                      href={href}
                      onClick={closeMobileMenu}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                      )}
                    >
                      <ExtIcon className="h-5 w-5" />
                      {def.name}
                    </Link>
                  )
                }) : (
                  <p className="px-3 py-2 text-xs text-muted-foreground/60">
                    Inga tillägg aktiverade
                  </p>
                )}
                <Link
                  href="/extensions"
                  onClick={closeMobileMenu}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                    isActive('/extensions')
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground/60 hover:bg-secondary/50 hover:text-foreground'
                  )}
                >
                  <Store className="h-5 w-5" />
                  Utforska fler...
                </Link>
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
