'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import {
  calculateEFTax,
  calculateABTax,
  getEnhancedTaxWarningStatus
} from '@/lib/tax/calculator'
import FSkattWarningCard from '@/components/dashboard/FSkattWarningCard'
import { UpcomingDeadlinesWidget } from '@/components/deadlines/UpcomingDeadlinesWidget'
import { TaxTodoWidget } from '@/components/deadlines/TaxTodoWidget'
import NewUserChecklist from '@/components/onboarding/NewUserChecklist'
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Camera,
  Users,
  Landmark,
  CheckCircle2,
  ClipboardList,
  FileWarning,
} from 'lucide-react'
import { getExtensionDefinition } from '@/lib/extensions/sectors'
import { resolveIcon } from '@/lib/extensions/icon-resolver'
import type { QuickActionDefinition } from '@/lib/extensions/types'
import type { CompanySettings, EntityType, Deadline, ReceiptQueueSummary, OnboardingProgress } from '@/types'

interface DashboardContentProps {
  firstName?: string | null
  settings: CompanySettings | null
  summary: {
    ytd: { income: number; expenses: number; net: number }
    mtd: { income: number; expenses: number; net: number }
    uncategorizedCount: number
    uncategorizedIncome: number
    uncategorizedExpenses: number
    unpaidInvoicesCount: number
    unpaidInvoicesTotal: number
    unpaidVatTotal: number
    overdueInvoicesCount: number
    bankBalance: number | null
    deadlines: Deadline[]
    receiptQueue: ReceiptQueueSummary | null
    missingUnderlagCount: number
  }
  onboardingProgress?: OnboardingProgress
  enabledExtensions?: { sector_slug: string; extension_slug: string }[]
}

export default function DashboardContent({ firstName, settings, summary, onboardingProgress, enabledExtensions }: DashboardContentProps) {
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [liveExtensions, setLiveExtensions] = useState(enabledExtensions ?? [])

  useEffect(() => {
    setLiveExtensions(enabledExtensions ?? [])
  }, [enabledExtensions])

  useEffect(() => {
    const handler = ((e: CustomEvent<{ sector_slug: string; extension_slug: string; enabled: boolean }>) => {
      setLiveExtensions(prev => {
        if (e.detail.enabled) {
          if (prev.some(x => x.sector_slug === e.detail.sector_slug && x.extension_slug === e.detail.extension_slug)) return prev
          return [...prev, { sector_slug: e.detail.sector_slug, extension_slug: e.detail.extension_slug }]
        }
        return prev.filter(x => !(x.sector_slug === e.detail.sector_slug && x.extension_slug === e.detail.extension_slug))
      })
    }) as EventListener
    window.addEventListener('extension-toggle-changed', handler)
    return () => window.removeEventListener('extension-toggle-changed', handler)
  }, [])

  const entityType = (settings?.entity_type as EntityType) || 'enskild_firma'
  const preliminaryTaxMonthly = settings?.preliminary_tax_monthly || 0
  const currentMonth = new Date().getMonth() + 1
  const preliminaryTaxPaidYTD = preliminaryTaxMonthly * currentMonth

  const totalTaxableIncome = summary.ytd.net

  const taxEstimate =
    entityType === 'enskild_firma'
      ? calculateEFTax(totalTaxableIncome, preliminaryTaxPaidYTD, null, summary.unpaidVatTotal)
      : calculateABTax(totalTaxableIncome, 0, preliminaryTaxPaidYTD, summary.unpaidVatTotal)

  const taxWarning = getEnhancedTaxWarningStatus(taxEstimate, preliminaryTaxMonthly, currentMonth)

  const formatLargeNumber = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const isNewUser = onboardingProgress && !onboardingProgress.hasInvoices && !onboardingProgress.hasCustomers

  // Build alert items for "Att hantera" section
  const alertItems: React.ReactNode[] = []

  if (summary.overdueInvoicesCount > 0) {
    alertItems.push(
      <Link key="overdue" href="/invoices?status=unpaid" className="group">
        <Card className="h-full border-l-2 border-l-destructive hover:bg-muted/20 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Receipt className="h-4 w-4 text-destructive flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">Förfallna fakturor</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.overdueInvoicesCount} st
                  </p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  if (summary.unpaidInvoicesCount > 0 && summary.overdueInvoicesCount < summary.unpaidInvoicesCount) {
    alertItems.push(
      <Link key="unpaid" href="/invoices?status=unpaid" className="group">
        <Card className="h-full border-l-2 border-l-warning hover:bg-muted/20 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Receipt className="h-4 w-4 text-warning-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">Obetalda fakturor</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.unpaidInvoicesCount - summary.overdueInvoicesCount} st · {formatCurrency(summary.unpaidInvoicesTotal)}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  if (summary.uncategorizedCount > 0) {
    alertItems.push(
      <Link key="transactions" href="/transactions" className="group">
        <Card className="h-full border-l-2 border-l-warning hover:bg-muted/20 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ArrowLeftRight className="h-4 w-4 text-warning-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">Transaktioner</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.uncategorizedCount} obokförda
                  </p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  if (summary.receiptQueue && (summary.receiptQueue.pending_review_count > 0 || summary.receiptQueue.unmatched_receipts_count > 0)) {
    alertItems.push(
      <Link key="receipts" href="/receipts" className="group">
        <Card className="h-full border-l-2 border-l-primary hover:bg-muted/20 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Camera className="h-4 w-4 text-primary flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">Kvitton</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.receiptQueue.pending_review_count > 0
                      ? `${summary.receiptQueue.pending_review_count} att granska`
                      : `${summary.receiptQueue.unmatched_receipts_count} omatchade`}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  if (summary.missingUnderlagCount > 0) {
    alertItems.push(
      <Link key="missing-underlag" href="/bookkeeping?missingUnderlag=true" className="group">
        <Card className="h-full border-l-2 border-l-warning hover:bg-muted/20 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileWarning className="h-4 w-4 text-warning-foreground flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">Saknade underlag</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.missingUnderlagCount} verifikationer utan underlag
                  </p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  const MAX_VISIBLE_ALERTS = 3
  const visibleAlerts = showAllAlerts ? alertItems : alertItems.slice(0, MAX_VISIBLE_ALERTS)
  const hasMoreAlerts = alertItems.length > MAX_VISIBLE_ALERTS

  // Build extension quick actions from enabled extensions
  const extensionQuickActions: (QuickActionDefinition & { key: string })[] = liveExtensions
    .map(toggle => {
      const def = getExtensionDefinition(toggle.sector_slug, toggle.extension_slug)
      if (!def?.quickAction) return null
      return { ...def.quickAction, key: `${toggle.sector_slug}/${toggle.extension_slug}` }
    })
    .filter((a): a is QuickActionDefinition & { key: string } => a !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  // Quick action items
  const quickActions = [
    { href: '/invoices/new', icon: Receipt, label: 'Ny faktura', desc: 'Skapa och skicka', accent: true },
    { href: '/customers', icon: Users, label: 'Ny kund', desc: 'Lägg till kunduppgifter' },
    { href: '/transactions', icon: ArrowLeftRight, label: 'Transaktioner', desc: 'Bokför' },
  ]

  return (
    <div className="stagger-enter">
      {/* Header */}
      <header className="mb-10">
        <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">
          {(() => {
            const hour = new Date().getHours()
            if (hour < 12) return 'Godmorgon'
            if (hour < 18) return 'God eftermiddag'
            return 'God kväll'
          })()}{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">
          {summary.overdueInvoicesCount > 0
            ? `${summary.overdueInvoicesCount} förfallna fakturor kräver åtgärd`
            : summary.deadlines.filter(d => !d.is_completed && new Date(d.due_date) <= new Date()).length > 0
              ? `${summary.deadlines.filter(d => !d.is_completed && new Date(d.due_date) <= new Date()).length} passerade deadlines`
              : 'Allt är som det ska'}
        </p>
      </header>

      {/* Status pills */}
      {(() => {
        const passedDeadlines = summary.deadlines.filter(d => !d.is_completed && new Date(d.due_date) <= new Date())
        const todoItems: { label: string; href: string; count: number; variant: 'destructive' | 'warning' | 'default' }[] = []

        if (passedDeadlines.length > 0) {
          todoItems.push({ label: 'passerade deadlines', href: '/deadlines', count: passedDeadlines.length, variant: 'destructive' })
        }
        if (summary.overdueInvoicesCount > 0) {
          todoItems.push({ label: 'förfallna fakturor', href: '/invoices?status=unpaid', count: summary.overdueInvoicesCount, variant: 'destructive' })
        }
        if (summary.uncategorizedCount > 0) {
          todoItems.push({ label: 'obokförda', href: '/transactions', count: summary.uncategorizedCount, variant: 'warning' })
        }
        if (summary.receiptQueue && summary.receiptQueue.pending_review_count > 0) {
          todoItems.push({ label: 'kvitton att granska', href: '/receipts', count: summary.receiptQueue.pending_review_count, variant: 'default' })
        }
        if (summary.missingUnderlagCount > 0) {
          todoItems.push({ label: 'saknade underlag', href: '/bookkeeping?missingUnderlag=true', count: summary.missingUnderlagCount, variant: 'warning' })
        }

        if (todoItems.length === 0) return null

        return (
          <section className="mb-10">
            <div className="flex flex-wrap gap-1.5">
              {todoItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Badge
                    variant={item.variant === 'destructive' ? 'destructive' : item.variant === 'warning' ? 'outline' : 'secondary'}
                    className="px-2.5 py-1 text-xs cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {item.count} {item.label}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        )
      })()}

      {/* New user checklist */}
      {onboardingProgress && (
        <section className="mb-10">
          <NewUserChecklist
            hasCustomers={onboardingProgress.hasCustomers}
            hasInvoices={onboardingProgress.hasInvoices}
            hasBankConnected={onboardingProgress.hasBankConnected}
            hasReceipts={onboardingProgress.hasReceipts}
          />
        </section>
      )}

      {/* 4 Key Summary Cards */}
      {(() => {
        const passedDeadlinesCount = summary.deadlines.filter(d => !d.is_completed && new Date(d.due_date) <= new Date()).length
        const pendingReceiptsCount = summary.receiptQueue
          ? summary.receiptQueue.pending_review_count + summary.receiptQueue.unmatched_receipts_count
          : 0
        const todoCount = summary.uncategorizedCount + summary.overdueInvoicesCount + pendingReceiptsCount + passedDeadlinesCount

        return (
          <section className="mb-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Card 1: Resultat */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Resultat</span>
                  </div>
                  <p className={cn(
                    'font-display text-xl font-medium tabular-nums leading-tight',
                    summary.mtd.net >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {formatLargeNumber(summary.mtd.net)}
                    <span className="text-sm ml-0.5 text-muted-foreground font-normal">kr</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatCurrency(summary.ytd.net)} i år
                  </p>
                </CardContent>
              </Card>

              {/* Card 2: Att få betalt */}
              <Link href="/invoices?status=unpaid">
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Att få betalt</span>
                    </div>
                    <p className="font-display text-xl font-medium tabular-nums leading-tight">
                      {summary.unpaidInvoicesCount}
                      <span className="text-sm ml-0.5 text-muted-foreground font-normal">st</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatCurrency(summary.unpaidInvoicesTotal)}
                    </p>
                  </CardContent>
                </Card>
              </Link>

              {/* Card 3: Banksaldo */}
              {summary.bankBalance !== null ? (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Banksaldo</span>
                    </div>
                    <p className="font-display text-xl font-medium tabular-nums leading-tight">
                      {formatLargeNumber(summary.bankBalance)}
                      <span className="text-sm ml-0.5 text-muted-foreground font-normal">kr</span>
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Link href="/import">
                  <Card className="h-full hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Banksaldo</span>
                      </div>
                      <p className="text-sm font-medium text-primary">Koppla bank</p>
                      <p className="text-[11px] text-muted-foreground mt-1">Importera transaktioner</p>
                    </CardContent>
                  </Card>
                </Link>
              )}

              {/* Card 4: Att göra */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Att göra</span>
                  </div>
                  {todoCount > 0 ? (
                    <>
                      <p className="font-display text-xl font-medium tabular-nums leading-tight text-warning-foreground">
                        {todoCount}
                        <span className="text-sm ml-0.5 text-muted-foreground font-normal">st</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Åtgärder att hantera
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <p className="text-sm font-medium text-success">Allt klart!</p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        )
      })()}

      {/* Quick actions */}
      <section id="quick-actions" className="mb-10">
        <h2 className="font-display text-lg font-medium mb-4">Snabbåtgärder</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.href} href={action.href} className="group">
                <div className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors duration-150',
                  action.accent
                    ? 'border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.06]'
                    : 'border-border/40 hover:bg-muted/30'
                )}>
                  <div className={cn(
                    'p-2 rounded-lg',
                    action.accent ? 'bg-primary/8' : 'bg-muted/50'
                  )}>
                    <Icon className={cn(
                      'h-4 w-4',
                      action.accent ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{action.label}</p>
                    <p className="text-xs text-muted-foreground truncate hidden md:block">{action.desc}</p>
                  </div>
                </div>
              </Link>
            )
          })}
          {/* Extension quick actions */}
          {extensionQuickActions.map((action) => {
            const Icon = resolveIcon(action.icon)
            if (action.href) {
              return (
                <Link key={action.key} href={action.href} className="group">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 hover:bg-muted/30 transition-colors duration-150">
                    <div className="p-2 rounded-lg bg-muted/50">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{action.label}</p>
                      <p className="text-xs text-muted-foreground truncate hidden md:block">{action.description}</p>
                    </div>
                  </div>
                </Link>
              )
            }
            return (
              <button
                key={action.key}
                onClick={() => window.dispatchEvent(new Event(action.event!))}
                className="group text-left"
              >
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 hover:bg-muted/30 transition-colors duration-150">
                  <div className="p-2 rounded-lg bg-muted/50">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{action.label}</p>
                    <p className="text-xs text-muted-foreground truncate hidden md:block">{action.description}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Upcoming deadlines — always visible */}
      {summary.deadlines && summary.deadlines.length > 0 && (
        <section className="mb-10">
          <UpcomingDeadlinesWidget deadlines={summary.deadlines} maxItems={8} />
        </section>
      )}

      {/* Tax todo widget — visible when there are incomplete tax deadlines */}
      {summary.deadlines?.some(d => d.deadline_type === 'tax' && !d.is_completed) && (
        <section className="mb-10">
          <TaxTodoWidget deadlines={summary.deadlines} />
        </section>
      )}

      {/* Alerts section — always visible */}
      {alertItems.length > 0 && (
        <section id="alerts-section" className="mb-10">
          <h2 className="font-display text-lg font-medium mb-4">Att hantera</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {visibleAlerts}
          </div>
          {hasMoreAlerts && !showAllAlerts && (
            <button
              onClick={() => setShowAllAlerts(true)}
              className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Visa alla ({alertItems.length})
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </section>
      )}

      {/* Collapsible details section */}
      <button
        onClick={() => setShowMore(!showMore)}
        className="mb-6 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
      >
        {showMore ? (
          <>
            Dölj detaljer
            <ChevronUp className="h-3.5 w-3.5" />
          </>
        ) : (
          <>
            Visa detaljer
            <ChevronDown className="h-3.5 w-3.5" />
          </>
        )}
      </button>

      {showMore && (
        <div>
          {/* F-skatt warning */}
          <section id="fskatt-section" className="mb-10">
            <FSkattWarningCard
              warningStatus={taxWarning}
              onAdjustClick={() => { window.location.href = '/settings' }}
            />
          </section>

          {/* Uncategorized transactions warning */}
          {summary.uncategorizedCount > 0 && (summary.uncategorizedIncome > 0 || summary.uncategorizedExpenses > 0) && (
            <section className="mb-10">
              <Link href="/transactions?tab=uncategorized" className="group">
                <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-warning/30 bg-warning/[0.03] hover:bg-warning/[0.06] transition-colors">
                  <ArrowLeftRight className="h-4 w-4 text-warning-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {summary.uncategorizedCount} obokförda transaktioner
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {summary.uncategorizedIncome > 0 && (
                        <span>{formatCurrency(summary.uncategorizedIncome)} intäkter</span>
                      )}
                      {summary.uncategorizedIncome > 0 && summary.uncategorizedExpenses > 0 && ', '}
                      {summary.uncategorizedExpenses > 0 && (
                        <span>{formatCurrency(summary.uncategorizedExpenses)} kostnader</span>
                      )}
                      {' '}saknas i resultatet
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground flex-shrink-0 mt-0.5 transition-colors" />
                </div>
              </Link>
            </section>
          )}

          {/* Income/Expenses */}
          <section className="mb-10">
            <h2 className="font-display text-lg font-medium mb-4">Resultat</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-3.5 w-3.5 text-success" />
                    <span className="text-sm text-muted-foreground">Intäkter</span>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-medium tabular-nums leading-tight">
                      {formatLargeNumber(summary.mtd.income)}
                      <span className="text-base ml-1 text-muted-foreground font-normal">kr</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">denna månad</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/30">
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs text-muted-foreground">I år</p>
                      <p className="text-sm font-medium tabular-nums">{formatCurrency(summary.ytd.income)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-sm text-muted-foreground">Kostnader</span>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-medium tabular-nums leading-tight">
                      {formatLargeNumber(summary.mtd.expenses)}
                      <span className="text-base ml-1 text-muted-foreground font-normal">kr</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">denna månad</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/30">
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs text-muted-foreground">I år</p>
                      <p className="text-sm font-medium tabular-nums">{formatCurrency(summary.ytd.expenses)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
