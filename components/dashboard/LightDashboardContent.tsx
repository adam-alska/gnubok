'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import SafeToSpendGauge from '@/components/dashboard/SafeToSpendGauge'
import SGIShieldWidget from '@/components/dashboard/SGIShieldWidget'
import GiftTaxDebtCard from '@/components/dashboard/GiftTaxDebtCard'
import RecentPayoutsCard from '@/components/dashboard/RecentPayoutsCard'
import {
  Banknote,
  Camera,
  Megaphone,
  Gift,
} from 'lucide-react'

interface RecentEntry {
  id: string
  date: string
  description: string | null
  gross_amount: number
  net_amount: number
  service_fee: number
  pension_deduction: number
  social_fees: number
  income_tax_withheld: number
  platform_fee: number
  type: string
  provider: string | null
}

interface LightDashboardContentProps {
  firstName: string | null
  bankBalance: number | null
  giftTaxDebt: number
  taxableGiftCount: number
  effectiveRate: number
  daysSinceLastPayout: number | null
  recentEntries: RecentEntry[]
  hobbyReserve?: number
}

export default function LightDashboardContent({
  firstName,
  bankBalance,
  giftTaxDebt,
  taxableGiftCount,
  effectiveRate,
  daysSinceLastPayout,
  recentEntries,
  hobbyReserve = 0,
}: LightDashboardContentProps) {
  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Godmorgon'
    if (hour < 18) return 'God eftermiddag'
    return 'God kv\u00e4ll'
  })()

  const quickActions = [
    {
      href: '/shadow-ledger/new',
      icon: Banknote,
      label: 'Logga utbetalning',
    },
    {
      href: '/receipts/scan',
      icon: Camera,
      label: 'Skanna kvitto',
    },
    {
      href: '/campaigns/new',
      icon: Megaphone,
      label: 'Nytt samarbete',
    },
    {
      href: '/gifts',
      icon: Gift,
      label: 'Ny g\u00e5va',
    },
  ]

  return (
    <div className="stagger-enter">
      {/* Greeting header */}
      <header className="mb-10">
        <h1 className="font-display text-4xl md:text-5xl font-medium tracking-tight">
          {greeting}{firstName ? `, ${firstName}` : ''}!
        </h1>
      </header>

      {/* SafeToSpendGauge - full width */}
      <section className="mb-6">
        <SafeToSpendGauge
          bankBalance={bankBalance ?? 0}
          giftTaxDebt={giftTaxDebt}
          hobbyReserve={hobbyReserve}
        />
      </section>

      {/* SGIShieldWidget - full width */}
      <section className="mb-6">
        <SGIShieldWidget daysSinceLastPayout={daysSinceLastPayout} />
      </section>

      {/* GiftTaxDebtCard + RecentPayoutsCard side by side on md+ */}
      <section className="grid md:grid-cols-2 gap-6 mb-10">
        <GiftTaxDebtCard
          virtualTaxDebt={giftTaxDebt}
          taxableGiftCount={taxableGiftCount}
          effectiveRate={effectiveRate}
        />
        <RecentPayoutsCard entries={recentEntries} />
      </section>

      {/* Quick actions row */}
      <section className="mb-12">
        <h2 className="font-display text-xl font-medium mb-4">Snabb\u00e5tg\u00e4rder</h2>
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link key={action.href} href={action.href}>
                <Button variant="outline" size="default" className="gap-2">
                  <Icon className="h-4 w-4" />
                  {action.label}
                </Button>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
