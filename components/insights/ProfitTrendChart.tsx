'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MonthlyTrendPoint } from '@/types/financial-insights'

interface ProfitTrendChartProps {
  data: MonthlyTrendPoint[]
  loading?: boolean
}

export default function ProfitTrendChart({ data, loading }: ProfitTrendChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Resultatutveckling</CardTitle>
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
          <CardTitle>Resultatutveckling</CardTitle>
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

  const hasNegative = data.some(d => d.profit < 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Resultatutveckling</CardTitle>
        <p className="text-sm text-muted-foreground">Manadsresultat senaste 12 manaderna</p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
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
              <Tooltip content={<ProfitTooltip />} />
              {hasNegative && (
                <ReferenceLine
                  y={0}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              )}
              <Line
                type="monotone"
                dataKey="profit"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ fill: 'hsl(var(--primary))', r: 3 }}
                activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function ProfitTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null

  const profit = payload[0].value

  const formatSEK = (amount: number) =>
    new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)

  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg">
      <p className="font-medium text-sm mb-1">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-xs text-muted-foreground">Resultat</span>
        <span className={`text-xs font-medium tabular-nums ${profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {formatSEK(profit)}
        </span>
      </div>
    </div>
  )
}
