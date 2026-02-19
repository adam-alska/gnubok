'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MonthlyTrendPoint } from '@/types/financial-insights'

interface RevenueTrendChartProps {
  data: MonthlyTrendPoint[]
  loading?: boolean
}

export default function RevenueTrendChart({ data, loading }: RevenueTrendChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Intakter vs Kostnader</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] bg-muted/30 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Intakter vs Kostnader</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
            Ingen data tillganglig
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatSEK = (value: number) => {
    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`
    return String(value)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Intakter vs Kostnader</CardTitle>
        <p className="text-sm text-muted-foreground">Senaste 12 manaderna</p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={formatSEK}
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={55}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs">{value === 'revenue' ? 'Intakter' : 'Kostnader'}</span>
                )}
              />
              <Bar
                dataKey="revenue"
                name="revenue"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
              <Bar
                dataKey="expenses"
                name="expenses"
                fill="hsl(var(--muted-foreground) / 0.3)"
                radius={[4, 4, 0, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function TrendTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string }>
  label?: string
}) {
  if (!active || !payload) return null

  const formatSEK = (amount: number) =>
    new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)

  const revenue = payload.find(p => p.dataKey === 'revenue')?.value || 0
  const expenses = payload.find(p => p.dataKey === 'expenses')?.value || 0
  const profit = revenue - expenses

  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg">
      <p className="font-medium text-sm mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-xs text-muted-foreground">Intakter</span>
          <span className="text-xs font-medium tabular-nums">{formatSEK(revenue)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-xs text-muted-foreground">Kostnader</span>
          <span className="text-xs font-medium tabular-nums">{formatSEK(expenses)}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t">
          <span className="text-xs font-medium">Resultat</span>
          <span className={`text-xs font-medium tabular-nums ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {formatSEK(profit)}
          </span>
        </div>
      </div>
    </div>
  )
}
