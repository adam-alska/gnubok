'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ChartArtifact } from '@/types/chat'

const DEFAULT_COLORS = [
  'var(--color-chart-1, #3b82f6)',
  'var(--color-chart-2, #10b981)',
  'var(--color-chart-3, #f59e0b)',
  'var(--color-chart-4, #ef4444)',
  'var(--color-chart-5, #8b5cf6)',
  'var(--color-chart-6, #ec4899)',
  'var(--color-chart-7, #06b6d4)',
  'var(--color-chart-8, #84cc16)',
]

function formatValue(value: number, unit?: string): string {
  const formatted = new Intl.NumberFormat('sv-SE').format(Math.round(value))
  return unit ? `${formatted} ${unit}` : formatted
}

interface ChatChartProps {
  artifact: ChartArtifact
}

export function ChatChart({ artifact }: ChatChartProps) {
  const { type, title, data, unit, subtitle } = artifact

  const chartData = data.map((d, i) => ({
    ...d,
    fill: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }))

  return (
    <div className="w-full">
      <div className="mb-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'pie_chart' ? (
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius="80%"
                label={(props) => {
                  const name = props.name ?? ''
                  const percent = typeof props.percent === 'number' ? props.percent : 0
                  return `${name} (${(percent * 100).toFixed(0)}%)`
                }}
                labelLine={false}
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatValue(Number(value ?? 0), unit)}
              />
            </PieChart>
          ) : type === 'line_chart' ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatValue(v, unit)}
                className="text-muted-foreground"
              />
              <Tooltip
                formatter={(value) => formatValue(Number(value ?? 0), unit)}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={DEFAULT_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatValue(v, unit)}
                className="text-muted-foreground"
              />
              <Tooltip
                formatter={(value) => formatValue(Number(value ?? 0), unit)}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
