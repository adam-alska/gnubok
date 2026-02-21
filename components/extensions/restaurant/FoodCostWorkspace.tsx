'use client'

import { useState, useEffect } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import KPICard from '@/components/extensions/shared/KPICard'
import DateRangeFilter from '@/components/extensions/shared/DateRangeFilter'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'

export default function FoodCostWorkspace({ userId }: WorkspaceComponentProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [foodCost, setFoodCost] = useState<number>(0)
  const [revenue, setRevenue] = useState<number>(0)
  const [purchases, setPurchases] = useState<number>(0)

  // Set initial date range to current month
  const now = new Date()
  const [dateRange, setDateRange] = useState({
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  })

  useEffect(() => {
    // In a real implementation, this would fetch journal_entry_lines
    // and calculate food cost via the API
    setIsLoading(false)
  }, [dateRange, userId])

  if (isLoading) return <ExtensionLoadingSkeleton />

  return (
    <div className="space-y-6">
      <DateRangeFilter
        onRangeChange={(start, end) => setDateRange({ start, end })}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="Food Cost %"
          value={foodCost}
          suffix="%"
        />
        <KPICard
          label="Varuinköp"
          value={purchases.toLocaleString('sv-SE')}
          suffix="kr"
        />
        <KPICard
          label="Livsmedelsintäkter"
          value={revenue.toLocaleString('sv-SE')}
          suffix="kr"
        />
      </div>

      <div className="rounded-xl border p-6">
        <h3 className="text-sm font-semibold mb-4">Så fungerar det</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Food Cost % beräknas automatiskt utifrån din bokföring. Varuinköp (konton 4000-4999)
          divideras med livsmedelsintäkter (konton 3000-3999). En bra riktvärde för restauranger
          är 25-35%.
        </p>
      </div>
    </div>
  )
}
