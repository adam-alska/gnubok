'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import {
  calculateEFTax,
  calculateABTax,
  getEnhancedTaxWarningStatus
} from '@/lib/tax/calculator'
import { getSchablonavdragSummary } from '@/lib/tax/schablonavdrag'
import FSkattWarningCard from '@/components/dashboard/FSkattWarningCard'
import { UpcomingDeadlinesWidget } from '@/components/calendar/UpcomingDeadlinesWidget'
import NewUserChecklist from '@/components/onboarding/NewUserChecklist'
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist'
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  ArrowLeftRight,
  ChevronDown,
  ArrowRight,
  Camera,
  HelpCircle,
  Users,
  FileText,
} from 'lucide-react'
import type { CompanySettings, EntityType, MileageEntry, SchablonavdragSettings, Deadline, ReceiptQueueSummary, OnboardingProgress } from '@/types'

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
    mileageEntries: MileageEntry[]
    deadlines: Deadline[]
    receiptQueue: ReceiptQueueSummary | null
  }
  onboardingProgress?: OnboardingProgress
}

export default function DashboardContent({ firstName, settings, summary, onboardingProgress }: DashboardContentProps) {
  const [showAllAlerts, setShowAllAlerts] = useState(false)

  const entityType = (settings?.entity_type as EntityType) || 'enskild_firma'
  const preliminaryTaxMonthly = settings?.preliminary_tax_monthly || 0
  const currentMonth = new Date().getMonth() + 1
  const preliminaryTaxPaidYTD = preliminaryTaxMonthly * currentMonth

  const schablonavdragSettings = (settings as CompanySettings & { schablonavdrag_settings?: SchablonavdragSettings })?.schablonavdrag_settings || null
  const schablonavdragSummary = getSchablonavdragSummary(
    schablonavdragSettings,
    summary.mileageEntries,
    new Date().getFullYear(),
    currentMonth
  )

  const totalTaxableIncome = summary.ytd.net

  const taxEstimate =
    entityType === 'enskild_firma'
      ? calculateEFTax(totalTaxableIncome, preliminaryTaxPaidYTD, schablonavdragSummary, summary.unpaidVatTotal)
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
        <Card className="h-full border-l-4 border-l-destructive hover:border-primary/30 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Receipt className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <p className="font-medium text-sm">Förfallna fakturor</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {summary.overdueInvoicesCount} förfallna
                  </p>
                  <Badge variant="destructive" className="mt-1.5 animate-pulse">
                    Kräver åtgärd
                  </Badge>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  if (summary.unpaidInvoicesCount > 0 && summary.overdueInvoicesCount < summary.unpaidInvoicesCount) {
    alertItems.push(
      <Link key="unpaid" href="/invoices?status=unpaid" className="group">
        <Card className="h-full border-l-4 border-l-warning hover:border-primary/30 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Receipt className="h-4 w-4 text-warning-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">Obetalda fakturor</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {summary.unpaidInvoicesCount - summary.overdueInvoicesCount} obetalda · {formatCurrency(summary.unpaidInvoicesTotal)}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  if (summary.uncategorizedCount > 0) {
    alertItems.push(
      <Link key="transactions" href="/transactions" className="group">
        <Card className="h-full border-l-4 border-l-warning hover:border-primary/30 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <ArrowLeftRight className="h-4 w-4 text-warning-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">Transaktioner</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {summary.uncategorizedCount} okategoriserade
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  if (summary.receiptQueue && (summary.receiptQueue.pending_review_count > 0 || summary.receiptQueue.unmatched_receipts_count > 0)) {
    alertItems.push(
      <Link key="receipts" href="/receipts" className="group">
        <Card className="h-full border-l-4 border-l-primary hover:border-primary/30 transition-colors">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Camera className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium text-sm">Kvitton</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {summary.receiptQueue.pending_review_count > 0
                      ? `${summary.receiptQueue.pending_review_count} att granska`
                      : `${summary.receiptQueue.unmatched_receipts_count} omatchade`}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
            </div>
          </CardContent>
        </Card>
      </Link>
    )
  }

  const MAX_VISIBLE_ALERTS = 3
  const visibleAlerts = showAllAlerts ? alertItems : alertItems.slice(0, MAX_VISIBLE_ALERTS)
  const hasMoreAlerts = alertItems.length > MAX_VISIBLE_ALERTS

  // Quick action items
  const quickActions = [
    { href: '/invoices/new', icon: Receipt, label: 'Ny faktura', desc: 'Skapa och skicka', accent: true },
    { href: '/receipts/scan', icon: Camera, label: 'Skanna kvitto', desc: 'Fotografera & spara' },
    { href: '/customers', icon: Users, label: 'Ny kund', desc: 'Lägg till kunduppgifter' },
    { href: '/transactions', icon: ArrowLeftRight, label: 'Transaktioner', desc: 'Kategorisera' },
  ]

  return (
    <div className="stagger-enter">
      {/* Hero section - personalized greeting */}
      <header className="mb-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight mb-1">
              {(() => {
                const hour = new Date().getHours()
                if (hour < 12) return 'Godmorgon'
                if (hour < 18) return 'God eftermiddag'
                return 'God kväll'
              })()}{firstName ? ` ${firstName}` : ''}{settings?.company_name ? `, ${settings.company_name}` : ''}
            </h1>
            <p className="text-muted-foreground text-lg">
              {summary.overdueInvoicesCount > 0
                ? `${summary.overdueInvoicesCount} förfallna fakturor kräver åtgärd`
                : summary.deadlines.filter(d => !d.is_completed && new Date(d.due_date) <= new Date()).length > 0
                  ? `${summary.deadlines.filter(d => !d.is_completed && new Date(d.due_date) <= new Date()).length} passerade deadlines`
                  : 'Allt är som det ska'}
            </p>
          </div>
          <Link href="/help" className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <HelpCircle className="h-4 w-4" />
            Hjälp
          </Link>
        </div>
      </header>

      {/* TODO section - actionable items */}
      {(() => {
        const passedDeadlines = summary.deadlines.filter(d => !d.is_completed && new Date(d.due_date) <= new Date())
        const todoItems: { label: string; href: string; count: number; variant: 'destructive' | 'warning' | 'default' }[] = []

        if (passedDeadlines.length > 0) {
          todoItems.push({ label: 'passerade deadlines', href: '/calendar', count: passedDeadlines.length, variant: 'destructive' })
        }
        if (summary.overdueInvoicesCount > 0) {
          todoItems.push({ label: 'förfallna fakturor', href: '/invoices?status=unpaid', count: summary.overdueInvoicesCount, variant: 'destructive' })
        }
        if (summary.uncategorizedCount > 0) {
          todoItems.push({ label: 'okategoriserade transaktioner', href: '/transactions', count: summary.uncategorizedCount, variant: 'warning' })
        }
        if (summary.receiptQueue && summary.receiptQueue.pending_review_count > 0) {
          todoItems.push({ label: 'kvitton att granska', href: '/receipts', count: summary.receiptQueue.pending_review_count, variant: 'default' })
        }

        if (todoItems.length === 0) return null

        return (
          <section className="mb-8">
            <div className="flex flex-wrap gap-2">
              {todoItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <Badge
                    variant={item.variant === 'destructive' ? 'destructive' : item.variant === 'warning' ? 'outline' : 'secondary'}
                    className="px-3 py-1.5 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    {item.count} {item.label}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        )
      })()}

      {/* Smart onboarding checklist - shows sector-specific tasks */}
      <OnboardingChecklist className="mb-8" />

      {/* New user checklist */}
      {onboardingProgress && (
        <section className="mb-8">
          <NewUserChecklist
            hasCustomers={onboardingProgress.hasCustomers}
            hasInvoices={onboardingProgress.hasInvoices}
            hasBankConnected={onboardingProgress.hasBankConnected}
            hasReceipts={onboardingProgress.hasReceipts}
          />
        </section>
      )}

      {/* Upcoming deadlines - prominent placement */}
      {summary.deadlines && summary.deadlines.length > 0 && (
        <section className="mb-8">
          <UpcomingDeadlinesWidget deadlines={summary.deadlines} maxItems={8} />
        </section>
      )}

      {/* Quick actions - moved up, as visual cards */}
      <section id="quick-actions" className="mb-12">
        <h2 className="font-display text-xl font-medium mb-6">Snabbåtgärder</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.href} href={action.href} className="group">
                <Card className={`h-full hover-lift text-center ${action.accent ? 'bg-primary/5 border-primary/20' : ''}`}>
                  <CardContent className="p-4 flex flex-col items-center gap-2">
                    <div className={`p-3 rounded-xl ${action.accent ? 'bg-primary/10' : 'bg-muted/50'} group-hover:scale-105 transition-transform`}>
                      <Icon className={`h-5 w-5 ${action.accent ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{action.label}</p>
                      <p className="text-xs text-muted-foreground hidden md:block">{action.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>

      {/* F-skatt warning */}
      <section id="fskatt-section" className="mb-8">
        <FSkattWarningCard
          warningStatus={taxWarning}
          onAdjustClick={() => { window.location.href = '/settings' }}
        />
      </section>

      {/* Alerts section - with urgency indicators and limit */}
      {alertItems.length > 0 && (
        <section id="alerts-section" className="mb-16">
          <h2 className="font-display text-xl font-medium mb-6">Att hantera</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleAlerts}
          </div>
          {hasMoreAlerts && !showAllAlerts && (
            <button
              onClick={() => setShowAllAlerts(true)}
              className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Visa alla ({alertItems.length})
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </section>
      )}

      {/* Uncategorized transactions warning */}
      {summary.uncategorizedCount > 0 && (summary.uncategorizedIncome > 0 || summary.uncategorizedExpenses > 0) && (
        <section className="mb-8">
          <Link href="/transactions?tab=uncategorized">
            <Card className="border-warning/50 bg-warning/5 hover:border-warning transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <ArrowLeftRight className="h-4 w-4 text-warning-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {summary.uncategorizedCount} okategoriserade transaktioner påverkar ditt resultat
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {summary.uncategorizedIncome > 0 && (
                        <span>{formatCurrency(summary.uncategorizedIncome)} i potentiella intäkter</span>
                      )}
                      {summary.uncategorizedIncome > 0 && summary.uncategorizedExpenses > 0 && ' och '}
                      {summary.uncategorizedExpenses > 0 && (
                        <span>{formatCurrency(summary.uncategorizedExpenses)} i potentiella kostnader</span>
                      )}
                      {' '}visas inte i resultatet. Kategorisera dem för korrekt redovisning.
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </section>
      )}

      {/* Income/Expenses - Side by side editorial */}
      <section className="mb-16">
        <h2 className="font-display text-xl font-medium mb-6">Resultat</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="hover-lift">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-sm text-muted-foreground">Intäkter</span>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Denna månad</p>
                  <p className="font-display text-3xl font-medium tabular-nums">
                    {formatLargeNumber(summary.mtd.income)}
                    <span className="text-lg ml-1 text-muted-foreground font-normal">kr</span>
                  </p>
                </div>
                <div className="pt-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">I år totalt</p>
                  <p className="font-display text-xl tabular-nums">
                    {formatCurrency(summary.ytd.income)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="text-sm text-muted-foreground">Kostnader</span>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Denna månad</p>
                  <p className="font-display text-3xl font-medium tabular-nums">
                    {formatLargeNumber(summary.mtd.expenses)}
                    <span className="text-lg ml-1 text-muted-foreground font-normal">kr</span>
                  </p>
                </div>
                <div className="pt-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">I år totalt</p>
                  <p className="font-display text-xl tabular-nums">
                    {formatCurrency(summary.ytd.expenses)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
