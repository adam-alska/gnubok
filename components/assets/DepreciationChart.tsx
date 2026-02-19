'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { DepreciationScheduleEntry } from '@/types/fixed-assets'

interface DepreciationChartProps {
  entries: DepreciationScheduleEntry[]
  acquisitionCost: number
  residualValue: number
}

export function DepreciationChart({
  entries,
  acquisitionCost,
  residualValue,
}: DepreciationChartProps) {
  const chartData = useMemo(() => {
    if (entries.length === 0) return []

    // Show at most ~60 entries for readability
    const step = entries.length > 60 ? Math.ceil(entries.length / 60) : 1

    const data: Array<{ month: string; bookValue: number; accumulated: number }> = []

    // Add starting point
    data.push({
      month: formatShortPeriod(entries[0].period_date, true),
      bookValue: acquisitionCost,
      accumulated: 0,
    })

    for (let i = 0; i < entries.length; i += step) {
      const entry = entries[i]
      data.push({
        month: formatShortPeriod(entry.period_date, false),
        bookValue: Number(entry.book_value),
        accumulated: Number(entry.accumulated_depreciation),
      })
    }

    // Ensure last entry is included
    const last = entries[entries.length - 1]
    const lastMonth = formatShortPeriod(last.period_date, false)
    if (data[data.length - 1].month !== lastMonth) {
      data.push({
        month: lastMonth,
        bookValue: Number(last.book_value),
        accumulated: Number(last.accumulated_depreciation),
      })
    }

    return data
  }, [entries, acquisitionCost])

  if (entries.length === 0) {
    return null
  }

  const formatAmount = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${Math.round(value / 1000)}k`
    return String(Math.round(value))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bokfort varde over tid</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="bookValueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(145, 20%, 36%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(145, 20%, 36%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'hsl(30, 8%, 45%)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(30, 8%, 45%)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAmount}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(40, 40%, 99%)',
                  border: '1px solid hsl(35, 20%, 88%)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value: number | undefined, name: string | undefined) => {
                  if (value === undefined) return ['-', name || '']
                  const formatted = new Intl.NumberFormat('sv-SE', {
                    style: 'currency',
                    currency: 'SEK',
                    maximumFractionDigits: 0,
                  }).format(value)
                  const label = name === 'bookValue' ? 'Bokfort varde' : 'Ackumulerad avskrivning'
                  return [formatted, label]
                }}
              />
              {residualValue > 0 && (
                <ReferenceLine
                  y={residualValue}
                  stroke="hsl(30, 8%, 65%)"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Restvarde',
                    position: 'right',
                    style: { fontSize: 10, fill: 'hsl(30, 8%, 55%)' },
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="bookValue"
                stroke="hsl(145, 20%, 36%)"
                strokeWidth={2}
                fill="url(#bookValueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-[hsl(145,20%,36%)] rounded" />
            Bokfort varde
          </div>
          {residualValue > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0 border-t-2 border-dashed border-muted-foreground/50" />
              Restvarde
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function formatShortPeriod(dateStr: string, isStart: boolean): string {
  const d = new Date(dateStr + 'T00:00:00')
  const shortMonths = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
    'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
  ]
  if (isStart || d.getMonth() === 0) {
    return `${shortMonths[d.getMonth()]} ${d.getFullYear()}`
  }
  return shortMonths[d.getMonth()]
}
