'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface MonthlyData {
  month: string
  income: number
  expenses: number
}

interface IncomeChartProps {
  monthlyData: MonthlyData[]
}

export function IncomeChart({ monthlyData }: IncomeChartProps) {
  const { trendPercent, trendDirection } = useMemo(() => {
    if (monthlyData.length < 2) return { trendPercent: 0, trendDirection: 'flat' as const }
    const current = monthlyData[monthlyData.length - 1]
    const previous = monthlyData[monthlyData.length - 2]
    if (previous.income === 0) return { trendPercent: 0, trendDirection: 'flat' as const }
    const percent = Math.round(((current.income - previous.income) / previous.income) * 100)
    return {
      trendPercent: Math.abs(percent),
      trendDirection: percent > 0 ? 'up' as const : percent < 0 ? 'down' as const : 'flat' as const,
    }
  }, [monthlyData])

  if (monthlyData.length === 0) return null

  const formatAmount = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${Math.round(value / 1000)}k`
    return String(value)
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">Intäkter vs kostnader</span>
          {trendDirection !== 'flat' && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trendDirection === 'up' ? 'text-success' : 'text-destructive'}`}>
              {trendDirection === 'up' ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trendPercent}% vs förra månaden
            </div>
          )}
          {trendDirection === 'flat' && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Minus className="h-3 w-3" />
              Oförändrat
            </div>
          )}
        </div>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(145, 20%, 36%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(145, 20%, 36%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0, 45%, 55%)" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="hsl(0, 45%, 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'hsl(30, 8%, 45%)' }}
                tickLine={false}
                axisLine={false}
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
                  return [
                    new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(value),
                    name === 'income' ? 'Intäkter' : 'Kostnader',
                  ]
                }}
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="hsl(145, 20%, 36%)"
                strokeWidth={2}
                fill="url(#incomeGradient)"
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stroke="hsl(0, 45%, 55%)"
                strokeWidth={1.5}
                fill="url(#expenseGradient)"
                strokeDasharray="4 4"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-primary rounded" />
            Intäkter
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-destructive rounded border-dashed" style={{ borderTop: '2px dashed hsl(0, 45%, 55%)' }} />
            Kostnader
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
