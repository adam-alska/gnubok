'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Clock,
  Shield,
  Banknote,
  PiggyBank,
  Calendar,
} from 'lucide-react'
import type { FinancialInsight, InsightType, InsightSeverity } from '@/types/financial-insights'

interface InsightCardProps {
  insight: FinancialInsight
  onDismiss?: (id: string) => void
}

const typeIcons: Record<InsightType, React.ElementType> = {
  cash_flow_warning: Banknote,
  spending_anomaly: TrendingUp,
  tax_optimization: PiggyBank,
  revenue_trend: TrendingDown,
  overdue_alert: Clock,
  seasonal_pattern: Calendar,
  savings_opportunity: DollarSign,
  compliance_reminder: Shield,
}

const severityConfig: Record<InsightSeverity, {
  icon: React.ElementType
  borderClass: string
  iconClass: string
  bgClass: string
}> = {
  critical: {
    icon: AlertTriangle,
    borderClass: 'border-l-4 border-l-destructive',
    iconClass: 'text-destructive',
    bgClass: 'bg-destructive/10',
  },
  warning: {
    icon: AlertCircle,
    borderClass: 'border-l-4 border-l-amber-500',
    iconClass: 'text-amber-600',
    bgClass: 'bg-amber-500/10',
  },
  info: {
    icon: Info,
    borderClass: 'border-l-4 border-l-blue-500',
    iconClass: 'text-blue-600',
    bgClass: 'bg-blue-500/10',
  },
}

export default function InsightCard({ insight, onDismiss }: InsightCardProps) {
  const [isDismissing, setIsDismissing] = useState(false)

  const TypeIcon = typeIcons[insight.insight_type] || Info
  const config = severityConfig[insight.severity]

  const handleDismiss = async () => {
    setIsDismissing(true)
    try {
      await fetch(`/api/insights/${insight.id}/dismiss`, { method: 'POST' })
      onDismiss?.(insight.id)
    } catch {
      setIsDismissing(false)
    }
  }

  return (
    <AnimatePresence>
      {!isDismissing && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -100, height: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className={`${config.borderClass} hover:shadow-md transition-shadow`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg flex-shrink-0 ${config.bgClass}`}>
                  <TypeIcon className={`h-4 w-4 ${config.iconClass}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-sm leading-tight">{insight.title}</h4>
                    <button
                      onClick={handleDismiss}
                      className="p-1 rounded-md hover:bg-muted transition-colors flex-shrink-0 -mt-0.5"
                      title="Avfarda"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>

                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {insight.description}
                  </p>

                  {insight.action_url && insight.action_text && (
                    <Link href={insight.action_url}>
                      <Button variant="ghost" size="sm" className="h-7 px-2 mt-2 text-xs gap-1">
                        {insight.action_text}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
