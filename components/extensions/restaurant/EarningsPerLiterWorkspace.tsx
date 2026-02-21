'use client'

import { useState, useEffect } from 'react'
import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import KPICard from '@/components/extensions/shared/KPICard'
import DateRangeFilter from '@/components/extensions/shared/DateRangeFilter'
import DataEntryForm from '@/components/extensions/shared/DataEntryForm'
import ExtensionLoadingSkeleton from '@/components/extensions/shared/ExtensionLoadingSkeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function EarningsPerLiterWorkspace({ userId }: WorkspaceComponentProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [earningsPerLiter, setEarningsPerLiter] = useState<number>(0)
  const [totalLiters, setTotalLiters] = useState<number>(0)
  const [totalRevenue, setTotalRevenue] = useState<number>(0)

  // Data entry state
  const [liters, setLiters] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [isSubmitting, setIsSubmitting] = useState(false)

  const now = new Date()
  const [dateRange, setDateRange] = useState({
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  })

  useEffect(() => {
    // In a real implementation, this would fetch liter entries and revenue data
    setIsLoading(false)
  }, [dateRange, userId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    // In a real implementation, this would save the liter entry via API
    setIsSubmitting(false)
    setLiters('')
  }

  if (isLoading) return <ExtensionLoadingSkeleton />

  return (
    <div className="space-y-6">
      <DateRangeFilter
        onRangeChange={(start, end) => setDateRange({ start, end })}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="Intäkt per liter"
          value={earningsPerLiter.toLocaleString('sv-SE')}
          suffix="kr/l"
        />
        <KPICard
          label="Totalt liter"
          value={totalLiters.toLocaleString('sv-SE')}
          suffix="l"
        />
        <KPICard
          label="Alkoholintäkter"
          value={totalRevenue.toLocaleString('sv-SE')}
          suffix="kr"
        />
      </div>

      <DataEntryForm
        title="Registrera daglig literförsäljning"
        onSubmit={handleSubmit}
        submitLabel="Registrera"
        isSubmitting={isSubmitting}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="entry-date">Datum</Label>
            <Input
              id="entry-date"
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="liters">Antal liter</Label>
            <Input
              id="liters"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={liters}
              onChange={e => setLiters(e.target.value)}
            />
          </div>
        </div>
      </DataEntryForm>

      <div className="rounded-xl border p-6">
        <h3 className="text-sm font-semibold mb-4">Så fungerar det</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Intäkt per liter beräknas genom att dividera alkoholintäkter med totalt antal sålda
          liter. Registrera daglig literförsäljning ovan. Alkoholintäkter hämtas automatiskt
          från bokföringen.
        </p>
      </div>
    </div>
  )
}
