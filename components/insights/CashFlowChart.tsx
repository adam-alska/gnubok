'use client'

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import type { CashFlowForecastDay } from '@/types/financial-insights'

interface CashFlowChartProps {
  forecast: CashFlowForecastDay[]
  loading?: boolean
}

export default function CashFlowChart({ forecast, loading }: CashFlowChartProps) {
  const chartData = useMemo(() => {
    if (!forecast || forecast.length === 0) return []

    return forecast.map((day, index) => {
      const date = new Date(day.date)
      return {
        date: day.date,
        label: date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }),
        balance: day.balance,
        income: day.income,
        expenses: day.expenses,
        // Upper and lower bounds for uncertainty area
        upperBound: Math.round(day.balance * 1.1),
        lowerBound: Math.round(day.balance * 0.9),
        isToday: index === 0,
        items: day.items,
      }
    })
  }, [forecast])

  const firstNegativeDay = useMemo(() => {
    return forecast.find(d => d.balance < 0)
  }, [forecast])

  const minBalance = useMemo(() => {
    if (chartData.length === 0) return 0
    return Math.min(...chartData.map(d => d.lowerBound))
  }, [chartData])

  const maxBalance = useMemo(() => {
    if (chartData.length === 0) return 100000
    return Math.max(...chartData.map(d => d.upperBound))
  }, [chartData])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kassaflodesprognos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] bg-muted/30 animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kassaflodesprognos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] flex items-center justify-center text-muted-foreground">
            Ingen data tillganglig for prognos
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatSEK = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (Math.abs(value) >= 1000) {
      return `${Math.round(value / 1000)}k`
    }
    return String(value)
  }

  // Show every ~15th label to avoid crowding
  const tickInterval = Math.max(1, Math.floor(chartData.length / 6))

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>Kassaflodesprognos</CardTitle>
          {firstNegativeDay && (
            <Badge variant="destructive" className="gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Negativt saldo {new Date(firstNegativeDay.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Projicerat kontosaldo de narmaste {forecast.length} dagarna
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="uncertaintyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.08} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
                interval={tickInterval}
              />
              <YAxis
                tickFormatter={formatSEK}
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
                domain={[Math.min(minBalance, 0) * 1.1, maxBalance * 1.1]}
                width={60}
              />
              <Tooltip content={<CashFlowTooltip />} />

              {/* Zero line - danger zone */}
              <ReferenceLine
                y={0}
                stroke="hsl(var(--destructive))"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  value: 'Nollinje',
                  position: 'right',
                  fill: 'hsl(var(--destructive))',
                  fontSize: 10,
                }}
              />

              {/* Uncertainty band */}
              <Area
                type="monotone"
                dataKey="upperBound"
                stroke="none"
                fill="url(#uncertaintyGradient)"
                fillOpacity={1}
              />
              <Area
                type="monotone"
                dataKey="lowerBound"
                stroke="none"
                fill="transparent"
                fillOpacity={0}
              />

              {/* Main balance line */}
              <Area
                type="monotone"
                dataKey="balance"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                fill="url(#balanceGradient)"
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function CashFlowTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ payload: { date: string; balance: number; income: number; expenses: number; items: CashFlowForecastDay['items'] } }>
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null

  const data = payload[0].payload

  const formatSEK = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg max-w-xs">
      <p className="font-medium text-sm mb-2">{label}</p>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <span className="text-xs text-muted-foreground">Saldo</span>
          <span className={`text-xs font-medium tabular-nums ${data.balance < 0 ? 'text-destructive' : ''}`}>
            {formatSEK(data.balance)}
          </span>
        </div>
        {data.income > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-xs text-green-600">Inbetalningar</span>
            <span className="text-xs tabular-nums">+{formatSEK(data.income)}</span>
          </div>
        )}
        {data.expenses > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-xs text-red-500">Utbetalningar</span>
            <span className="text-xs tabular-nums">-{formatSEK(data.expenses)}</span>
          </div>
        )}
        {data.items && data.items.length > 0 && (
          <div className="border-t pt-1.5 mt-1.5">
            {data.items.slice(0, 4).map((item, i) => (
              <div key={i} className="flex justify-between gap-3 text-[10px] text-muted-foreground">
                <span className="truncate">{item.description}</span>
                <span className="tabular-nums flex-shrink-0">
                  {item.amount > 0 ? '+' : ''}{formatSEK(item.amount)}
                </span>
              </div>
            ))}
            {data.items.length > 4 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                +{data.items.length - 4} fler poster
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
