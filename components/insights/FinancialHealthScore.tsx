'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import type { FinancialHealthScore as HealthScoreType } from '@/types/financial-insights'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface FinancialHealthScoreProps {
  score: HealthScoreType | null
  loading?: boolean
}

export default function FinancialHealthScore({ score, loading }: FinancialHealthScoreProps) {
  const [animatedScore, setAnimatedScore] = useState(0)

  useEffect(() => {
    if (score) {
      const timer = setTimeout(() => setAnimatedScore(score.overall), 300)
      return () => clearTimeout(timer)
    }
  }, [score])

  if (loading || !score) {
    return (
      <Card className="h-full">
        <CardContent className="p-6 flex flex-col items-center justify-center min-h-[200px]">
          <div className="w-32 h-32 rounded-full bg-muted animate-pulse" />
          <div className="h-4 w-24 bg-muted animate-pulse rounded mt-4" />
        </CardContent>
      </Card>
    )
  }

  const getScoreColor = (value: number): string => {
    if (value >= 70) return '#22c55e' // green
    if (value >= 40) return '#f59e0b' // amber
    return '#ef4444' // red
  }

  const getScoreLabel = (value: number): string => {
    if (value >= 80) return 'Utmarkt'
    if (value >= 70) return 'Bra'
    if (value >= 50) return 'OK'
    if (value >= 30) return 'Behover forbattring'
    return 'Kritiskt'
  }

  const color = getScoreColor(animatedScore)
  const circumference = 2 * Math.PI * 56 // radius = 56
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference

  const TrendIcon = ({ trend }: { trend: 'improving' | 'stable' | 'declining' }) => {
    if (trend === 'improving') return <TrendingUp className="h-3.5 w-3.5 text-green-500" />
    if (trend === 'declining') return <TrendingDown className="h-3.5 w-3.5 text-red-500" />
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
  }

  return (
    <Card className="h-full">
      <CardContent className="p-6">
        <div className="flex flex-col items-center">
          {/* Circular Score */}
          <div className="relative w-36 h-36 mb-4">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
              {/* Background circle */}
              <circle
                cx="64"
                cy="64"
                r="56"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-muted/30"
              />
              {/* Score arc */}
              <motion.circle
                cx="64"
                cy="64"
                r="56"
                fill="none"
                stroke={color}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
              />
            </svg>
            {/* Score number in center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                className="font-display text-4xl font-bold tabular-nums"
                style={{ color }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {animatedScore}
              </motion.span>
              <span className="text-xs text-muted-foreground">av 100</span>
            </div>
          </div>

          <p className="font-medium text-sm mb-1" style={{ color }}>
            {getScoreLabel(animatedScore)}
          </p>
          <p className="text-xs text-muted-foreground mb-5">Finansiell halsa</p>

          {/* Factor breakdown */}
          <div className="w-full space-y-3">
            {score.factors.map((factor) => (
              <div key={factor.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendIcon trend={factor.trend} />
                  <span className="text-xs text-muted-foreground">{factor.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: getScoreColor(factor.score) }}
                      initial={{ width: 0 }}
                      animate={{ width: `${factor.score}%` }}
                      transition={{ duration: 0.8, delay: 0.5 }}
                    />
                  </div>
                  <span className="text-xs font-medium tabular-nums w-6 text-right">{factor.score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
