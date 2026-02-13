'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'
import { cn } from '@/lib/utils'

interface TikTokGrowthChartProps {
  accountId: string
  className?: string
}

type Period = '7d' | '30d' | '90d' | '1y'

interface ChartData {
  date: string
  followers: number
  change: number | null
}

export function TikTokGrowthChart({ accountId, className }: TikTokGrowthChartProps) {
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<ChartData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [accountId, period])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365
      const response = await fetch(
        `/api/tiktok/stats?account_id=${accountId}&days=${days}`
      )
      const result = await response.json()
      setData(result.history || [])
    } catch (error) {
      console.error('Failed to fetch growth data:', error)
    }
    setIsLoading(false)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    if (period === '7d') {
      return date.toLocaleDateString('sv-SE', { weekday: 'short' })
    }
    if (period === '30d') {
      return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    }
    return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
  }

  const formatFollowers = (value: number) => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M'
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K'
    }
    return value.toString()
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            Följare: {payload[0].value.toLocaleString('sv-SE')}
          </p>
          {payload[0].payload.change !== null && (
            <p className={cn(
              'text-sm',
              payload[0].payload.change >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {payload[0].payload.change >= 0 ? '+' : ''}
              {payload[0].payload.change.toLocaleString('sv-SE')} från föregående dag
            </p>
          )}
        </div>
      )
    }
    return null
  }

  const periods: { value: Period; label: string }[] = [
    { value: '7d', label: '7 dagar' },
    { value: '30d', label: '30 dagar' },
    { value: '90d', label: '90 dagar' },
    { value: '1y', label: '1 år' },
  ]

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Följartillväxt</CardTitle>
          <div className="flex gap-1">
            {periods.map((p) => (
              <Button
                key={p.value}
                variant={period === p.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod(p.value)}
                className="text-xs"
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Laddar...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Ingen data tillgänglig</p>
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="followerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickFormatter={formatFollowers}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                  width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="followers"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#followerGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
