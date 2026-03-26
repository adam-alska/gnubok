'use client'

import { useState, useRef } from 'react'
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
  Wallet,
  TrendingUp,
  ClipboardCheck,
} from 'lucide-react'
import { resolveIcon } from '@/lib/extensions/icon-resolver'
import type { EntityType } from '@/types'

interface ExtensionNavItem {
  href: string
  label: string
  icon: string
}

interface DashboardNavProps {
  companyName: string
  entityType: EntityType
  uncategorizedTransactionCount?: number
  pendingOperationsCount?: number
  isSandbox?: boolean
  extensionNavItems?: ExtensionNavItem[]
}

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  group: string
  modes?: EntityType[] // If set, only visible for these entity types. If not set, visible to all.
  hidden?: boolean // Temporarily hide from sidebar
}

// All nav items for sidebar and mobile drawer
const navItems: NavItem[] = [
  { href: '/', label: 'Översikt', icon: LayoutDashboard, group: 'main' },
  { href: '/kpi', label: 'Nyckeltal', icon: TrendingUp, group: 'main' },
  { href: '/deadlines', label: 'Deadlines', icon: Calendar, group: 'main' },
  // AR — Accounts Receivable
  { href: '/invoices', label: 'Fakturor', icon: Receipt, group: 'försäljning' },
  { href: '/customers', label: 'Kunder', icon: Users, group: 'försäljning' },
  // AP — Accounts Payable
  { href: '/expenses', label: 'Utgifter', icon: Wallet, group: 'inköp' },
  // Temporarily hidden pending module rework (see feedback #49)
  { href: '/suppliers', label: 'Leverantörer', icon: Building2, group: 'inköp', hidden: true },
  { href: '/supplier-invoices', label: 'Leverantörsfakturor', icon: FileInput, group: 'inköp', hidden: true },
  // General accounting
  { href: '/pending', label: 'Granskning', icon: ClipboardCheck, group: 'redovisning' },
  { href: '/transactions', label: 'Transaktioner', icon: ArrowLeftRight, group: 'redovisning' },
  { href: '/bookkeeping', label: 'Bokföring', icon: BookOpen, group: 'redovisning' },
  { href: '/reports', label: 'Rapporter', icon: BarChart3, group: 'redovisning' },
  { href: '/import', label: 'Importera', icon: Upload, group: 'redovisning' },
  { href: '/help', label: 'Hjälp', icon: HelpCircle, group: 'övrigt' },
  { href: '/settings', label: 'Inställningar', icon: Settings, group: 'övrigt' },
]

const groupLabels: Record<string, string> = {
  main: 'Huvudmeny',
  försäljning: 'Försäljning',
  inköp: 'Inköp',
  redovisning: 'Redovisning',
  övrigt: 'Övrigt',
}

export default function DashboardNav({ companyName, entityType, uncategorizedTransactionCount = 0, pendingOperationsCount = 0, isSandbox = false, extensionNavItems = [] }: DashboardNavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Auto-expand Övrigt when the user is on one of its pages, or when manually toggled
  const isOnOvrigtPage = ['/help', '/settings', '/e/'].some(p => pathname.startsWith(p))
  const [manualOvrigtExpanded, setManualOvrigtExpanded] = useState(false)
  const isOvrigtExpanded = isOnOvrigtPage || manualOvrigtExpanded
  const openMobileMenu = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setIsClosing(false)
    setIsMobileMenuOpen(true)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push(isSandbox ? '/sandbox' : '/login')
  }

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname.startsWith(href)
  }

  const closeMobileMenu = () => {
    setIsClosing(true)
    closeTimerRef.current = setTimeout(() => {
      setIsMobileMenuOpen(false)
      setIsClosing(false)
      closeTimerRef.current = null
    }, 200)
  }

  // Filter nav items by entity type, hidden flag, and conditional visibility
  const filteredItems = navItems.filter(item => {
    if (item.hidden) return false
    if (item.modes && !item.modes.includes(entityType)) return false
    // Only show Granskning when there are pending operations
    if (item.href === '/pending' && pendingOperationsCount === 0) return false
    return true
  })

  const mainItems = filteredItems.filter(i => i.group === 'main')
  const övrigtItems = filteredItems.filter(i => i.group === 'övrigt')

  // Groups rendered as distinct sidebar sections (AR, AP, Accounting)
  const sidebarGroups = [
    { key: 'försäljning', items: filteredItems.filter(i => i.group === 'försäljning'), spacing: 'mb-4' },
    { key: 'inköp', items: filteredItems.filter(i => i.group === 'inköp'), spacing: 'mb-4' },
    { key: 'redovisning', items: filteredItems.filter(i => i.group === 'redovisning'), spacing: 'mb-6' },
  ] as const

  const mobileNavItems = [
    { href: '/', label: 'Översikt', icon: LayoutDashboard },
    { href: '/invoices', label: 'Fakturor', icon: Receipt },
    { href: '/transactions', label: 'Transaktioner', icon: ArrowLeftRight },
  ]

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-[232px] md:flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-r border-border/30 bg-card/90">
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
                <p className="px-3 mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
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
                            ? 'bg-primary/12 text-foreground font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        )}
                      >
                        <Icon className={cn(
                          "mr-2.5 h-[15px] w-[15px] flex-shrink-0",
                          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                        )} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* AR / AP / Accounting groups */}
              {sidebarGroups.map(({ key, items, spacing }) => (
                <div key={key} className={spacing}>
                  <p className="px-3 mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                    {groupLabels[key]}
                  </p>
                  <div className="space-y-px">
                    {items.map((item) => {
                      const Icon = item.icon
                      const active = isActive(item.href)
                      const badge = item.href === '/transactions' && uncategorizedTransactionCount > 0
                        ? uncategorizedTransactionCount
                        : item.href === '/pending' && pendingOperationsCount > 0
                          ? pendingOperationsCount
                          : null
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'group flex items-center px-3 py-[7px] text-[13px] transition-colors duration-150 rounded-lg',
                            active
                              ? 'bg-primary/12 text-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                          )}
                        >
                          <Icon className={cn(
                            "mr-2.5 h-[15px] w-[15px] flex-shrink-0",
                            active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
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
              ))}

              {/* Övrigt group - collapsible */}
              <div className="mb-4">
                <button
                  onClick={() => setManualOvrigtExpanded(!isOvrigtExpanded)}
                  className="w-full flex items-center justify-between px-3 mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.08em] hover:text-muted-foreground transition-colors"
                >
                  <span>{groupLabels.övrigt}</span>
                  <ChevronDown className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    isOvrigtExpanded && "rotate-180"
                  )} />
                </button>
                {isOvrigtExpanded && (
                  <div className="space-y-px animate-fade-in">
                    {extensionNavItems.map((item) => {
                      const Icon = resolveIcon(item.icon)
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'group flex items-center px-3 py-[7px] text-[13px] transition-colors duration-150 rounded-lg',
                            active
                              ? 'bg-primary/12 text-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                          )}
                        >
                          <Icon className={cn(
                            "mr-2.5 h-[15px] w-[15px] flex-shrink-0",
                            active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                          )} />
                          {item.label}
                        </Link>
                      )
                    })}
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
                              ? 'bg-primary/12 text-foreground font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                          )}
                        >
                          <Icon className={cn(
                            "mr-2.5 h-[15px] w-[15px] flex-shrink-0",
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
          <div className="flex-shrink-0 px-3 py-3 border-t border-border/30">
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-foreground text-[13px] h-9 px-3"
              onClick={handleLogout}
            >
              <LogOut className="mr-2.5 h-[15px] w-[15px]" />
              {isSandbox ? 'Avsluta sandbox' : 'Logga ut'}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/98 backdrop-blur-sm border-t border-border/40" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} aria-label="Mobilnavigation">
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

      {/* Mobile menu — bottom sheet */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              "md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-50",
              isClosing ? "animate-out fade-out duration-200" : "animate-in fade-in duration-300"
            )}
            onClick={closeMobileMenu}
            aria-hidden="true"
          />
          {/* Bottom sheet */}
          <div
            className={cn(
              "md:hidden fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-2xl border-t border-border/40 overflow-y-auto overscroll-contain",
              isClosing
                ? "animate-out slide-out-to-bottom duration-200"
                : "animate-in slide-in-from-bottom duration-300"
            )}
            style={{ maxHeight: '85dvh', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            role="dialog"
            aria-label="Navigeringsmeny"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-card rounded-t-2xl">
              <div className="w-8 h-1 rounded-full bg-muted-foreground/25" />
            </div>

            {/* Header */}
            <div className="px-4 pb-2 flex items-center justify-between">
              <p className="font-medium text-sm truncate">{companyName}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 -mr-1"
                onClick={closeMobileMenu}
                aria-label="Stäng meny"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Navigation */}
            <div className="px-2">
              {/* Main items */}
              <div className="space-y-0.5">
                {mainItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobileMenu}
                      className={cn(
                        'flex items-center gap-3 px-3 min-h-[44px] rounded-lg transition-colors',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground active:bg-muted/60'
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px] flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  )
                })}
              </div>

              {/* AR / AP / Accounting groups (mobile) */}
              {sidebarGroups.map(({ key, items }) => (
                <div key={key}>
                  <div className="flex items-center gap-3 my-1.5 px-3">
                    <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.08em]">{groupLabels[key]}</span>
                    <div className="flex-1 h-px bg-border/30" />
                  </div>
                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const Icon = item.icon
                      const active = isActive(item.href)
                      const badge = item.href === '/transactions' && uncategorizedTransactionCount > 0
                        ? uncategorizedTransactionCount
                        : item.href === '/pending' && pendingOperationsCount > 0
                          ? pendingOperationsCount
                          : null
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={closeMobileMenu}
                          className={cn(
                            'flex items-center gap-3 px-3 min-h-[44px] rounded-lg transition-colors',
                            active
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-foreground active:bg-muted/60'
                          )}
                        >
                          <Icon className={cn("h-[18px] w-[18px] flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                          <span className="text-sm flex-1">{item.label}</span>
                          {badge !== null && (
                            <span className="min-w-[20px] h-[20px] flex items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1.5">
                              {badge > 99 ? '99+' : badge}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Övrigt divider */}
              <div className="flex items-center gap-3 my-1.5 px-3">
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-[0.08em]">Övrigt</span>
                <div className="flex-1 h-px bg-border/30" />
              </div>

              {/* Other items */}
              <div className="space-y-0.5">
                {extensionNavItems.map((item) => {
                  const Icon = resolveIcon(item.icon)
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobileMenu}
                      className={cn(
                        'flex items-center gap-3 px-3 min-h-[44px] rounded-lg transition-colors',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground active:bg-muted/60'
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px] flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  )
                })}
                {övrigtItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobileMenu}
                      className={cn(
                        'flex items-center gap-3 px-3 min-h-[44px] rounded-lg transition-colors',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground active:bg-muted/60'
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px] flex-shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-sm">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>

            {/* Logout */}
            <div className="px-2 py-2 mt-1 border-t border-border/30">
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground active:text-foreground text-sm h-11 px-3"
                onClick={() => {
                  closeMobileMenu()
                  handleLogout()
                }}
              >
                <LogOut className="mr-3 h-[18px] w-[18px]" />
                {isSandbox ? 'Avsluta sandbox' : 'Logga ut'}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
