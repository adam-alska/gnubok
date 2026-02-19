'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, Info, Loader2 } from 'lucide-react'
import type { YearEndChecklist, YearEndChecklistItem, ChecklistCategory } from '@/types/year-end'
import { CHECKLIST_CATEGORY_LABELS } from '@/types/year-end'

interface ChecklistSectionProps {
  checklist: YearEndChecklist
  closingId: string
  disabled?: boolean
  onItemToggle?: (updatedChecklist: YearEndChecklist) => void
}

const CATEGORY_ORDER: ChecklistCategory[] = [
  'preparation',
  'verification',
  'adjustments',
  'closing',
]

const CATEGORY_ICONS: Record<ChecklistCategory, string> = {
  preparation: '1',
  verification: '2',
  adjustments: '3',
  closing: '4',
}

export function ChecklistSection({
  checklist,
  closingId,
  disabled = false,
  onItemToggle,
}: ChecklistSectionProps) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  const groupedItems = CATEGORY_ORDER.map((category) => ({
    category,
    label: CHECKLIST_CATEGORY_LABELS[category],
    items: checklist.items.filter((item) => item.category === category),
  }))

  async function toggleItem(item: YearEndChecklistItem) {
    if (disabled || loadingKey) return

    setLoadingKey(item.key)

    try {
      const res = await fetch(`/api/year-end/${closingId}/checklist`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: item.key,
          isCompleted: !item.isCompleted,
        }),
      })

      const result = await res.json()
      if (result.data && onItemToggle) {
        onItemToggle(result.data)
      }
    } catch {
      // Silently fail - user can retry
    } finally {
      setLoadingKey(null)
    }
  }

  const completedCount = checklist.items.filter((i) => i.isCompleted).length
  const totalCount = checklist.items.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {completedCount} av {totalCount} avklarade
            </span>
            <span className="text-sm text-muted-foreground">{progressPercent}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Category sections */}
      {groupedItems.map(({ category, label, items }) => {
        if (items.length === 0) return null

        const categoryCompleted = items.filter((i) => i.isCompleted).length
        const allDone = categoryCompleted === items.length

        return (
          <Card key={category}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                      allDone
                        ? 'bg-green-100 text-green-700'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {allDone ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      CATEGORY_ICONS[category]
                    )}
                  </div>
                  <CardTitle className="text-lg">{label}</CardTitle>
                </div>
                <Badge
                  className={
                    allDone
                      ? 'bg-green-100 text-green-800'
                      : 'bg-muted text-muted-foreground'
                  }
                >
                  {categoryCompleted}/{items.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {items.map((item) => (
                <ChecklistItem
                  key={item.key}
                  item={item}
                  loading={loadingKey === item.key}
                  disabled={disabled}
                  onToggle={() => toggleItem(item)}
                />
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function ChecklistItem({
  item,
  loading,
  disabled,
  onToggle,
}: {
  item: YearEndChecklistItem
  loading: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
        item.isCompleted
          ? 'bg-green-50/50 dark:bg-green-950/20'
          : 'hover:bg-muted/50'
      } ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
      onClick={() => !disabled && !loading && onToggle()}
    >
      <div className="mt-0.5">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Checkbox
            checked={item.isCompleted}
            disabled={disabled}
            onCheckedChange={() => {}}
            className="pointer-events-none"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${
              item.isCompleted ? 'line-through text-muted-foreground' : ''
            }`}
          >
            {item.title}
          </span>
          {item.isRequired && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              Obligatorisk
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {item.description}
        </p>
        {item.isCompleted && item.completedAt && (
          <p className="text-[10px] text-green-600 mt-1">
            Avklarad {new Date(item.completedAt).toLocaleDateString('sv-SE')}
          </p>
        )}
      </div>
      {!item.isCompleted && !item.isRequired && (
        <Info className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />
      )}
    </div>
  )
}
