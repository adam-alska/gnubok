'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DocumentStatusBadge } from './DocumentStatusBadge'
import { FileText, ShoppingCart, Receipt, ArrowRight, Check, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PipelineStage {
  type: 'quote' | 'order' | 'invoice'
  id: string | null
  number: string | null
  status: string | null
  date: string | null
}

interface ConversionPipelineProps {
  stages: PipelineStage[]
  currentStage: 'quote' | 'order' | 'invoice'
}

const stageConfig = {
  quote: {
    label: 'Offert',
    icon: FileText,
    href: (id: string) => `/quotes/${id}`,
  },
  order: {
    label: 'Order',
    icon: ShoppingCart,
    href: (id: string) => `/orders/${id}`,
  },
  invoice: {
    label: 'Faktura',
    icon: Receipt,
    href: (id: string) => `/invoices/${id}`,
  },
}

const stageOrder: Array<'quote' | 'order' | 'invoice'> = ['quote', 'order', 'invoice']

export function ConversionPipeline({ stages, currentStage }: ConversionPipelineProps) {
  const stageMap = new Map(stages.map((s) => [s.type, s]))
  const currentIndex = stageOrder.indexOf(currentStage)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Dokumentflode
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1">
          {stageOrder.map((stageType, index) => {
            const stage = stageMap.get(stageType)
            const config = stageConfig[stageType]
            const Icon = config.icon
            const isCurrent = stageType === currentStage
            const isCompleted = stage?.id != null && index < currentIndex
            const isFuture = !stage?.id && index > currentIndex
            const isActive = stage?.id != null

            return (
              <div key={stageType} className="flex items-center gap-1 flex-1">
                {/* Stage */}
                <div className="flex-1">
                  {isActive && stage?.id ? (
                    <Link href={config.href(stage.id)}>
                      <div
                        className={cn(
                          'flex flex-col items-center gap-1 p-2 rounded-lg transition-colors',
                          isCurrent
                            ? 'bg-primary/10 ring-1 ring-primary/20'
                            : 'hover:bg-muted',
                          isCompleted && 'opacity-70'
                        )}
                      >
                        <div
                          className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center',
                            isCurrent
                              ? 'bg-primary text-primary-foreground'
                              : isCompleted
                              ? 'bg-success/20 text-success'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {isCompleted ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <span className="text-xs font-medium">{config.label}</span>
                        {stage?.number && (
                          <span className="text-xs text-muted-foreground">{stage.number}</span>
                        )}
                        {stage?.status && (
                          <DocumentStatusBadge
                            type={stageType}
                            status={stage.status}
                            className="text-[10px] px-1.5 py-0"
                          />
                        )}
                      </div>
                    </Link>
                  ) : (
                    <div
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded-lg',
                        isFuture && 'opacity-40'
                      )}
                    >
                      <div
                        className={cn(
                          'h-8 w-8 rounded-full flex items-center justify-center',
                          isCurrent
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {isFuture ? (
                          <Circle className="h-4 w-4" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                      </div>
                      <span className="text-xs font-medium">{config.label}</span>
                      {isFuture && (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Arrow between stages */}
                {index < stageOrder.length - 1 && (
                  <ArrowRight
                    className={cn(
                      'h-4 w-4 flex-shrink-0',
                      index < currentIndex
                        ? 'text-success'
                        : 'text-muted-foreground/30'
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
