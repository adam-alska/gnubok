'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { MONTH_NAMES_SV } from '@/types/budget-costcenters'

interface MonthlyTrendChartProps {
  budgetMonths: number[]
  actualMonths: number[]
  title?: string
  className?: string
}

export default function MonthlyTrendChart({
  budgetMonths,
  actualMonths,
  title = 'Budget vs Utfall',
  className,
}: MonthlyTrendChartProps) {
  const data = MONTH_NAMES_SV.map((month, i) => ({
    name: month,
    Budget: Math.round(budgetMonths[i] || 0),
    Utfall: Math.round(actualMonths[i] || 0),
  }))

  const formatValue = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(0)}k`
    }
    return value.toString()
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis
                tickFormatter={formatValue}
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <Tooltip
                formatter={(value) =>
                  new Intl.NumberFormat('sv-SE', {
                    style: 'currency',
                    currency: 'SEK',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }).format(value as number)
                }
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  borderColor: 'hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--popover-foreground))',
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="Budget"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="Utfall"
                stroke="hsl(142 76% 36%)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
