'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { X, PartyPopper, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { OnboardingChecklistItem } from '@/types/onboarding'

interface OnboardingChecklistProps {
  className?: string
}

export default function OnboardingChecklist({ className }: OnboardingChecklistProps) {
  const [items, setItems] = useState<OnboardingChecklistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)

  // Check localStorage for dismissed state
  useEffect(() => {
    const dismissed = localStorage.getItem('onboarding-checklist-dismissed')
    if (dismissed === 'true') {
      setIsDismissed(true)
    }
  }, [])

  // Fetch checklist items
  useEffect(() => {
    async function loadChecklist() {
      try {
        const res = await fetch('/api/onboarding/checklist')
        const json = await res.json()
        if (json.data) {
          setItems(json.data)
        }
      } catch (err) {
        console.error('Failed to load checklist:', err)
      }
      setIsLoading(false)
    }
    loadChecklist()
  }, [])

  const toggleTask = useCallback(async (taskKey: string, isCompleted: boolean) => {
    // Optimistic update
    setItems(prev =>
      prev.map(item =>
        item.task_key === taskKey
          ? {
              ...item,
              is_completed: isCompleted,
              completed_at: isCompleted ? new Date().toISOString() : null,
            }
          : item
      )
    )

    try {
      await fetch('/api/onboarding/checklist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskKey, isCompleted }),
      })
    } catch (err) {
      console.error('Failed to update task:', err)
      // Revert on error
      setItems(prev =>
        prev.map(item =>
          item.task_key === taskKey
            ? {
                ...item,
                is_completed: !isCompleted,
                completed_at: !isCompleted ? new Date().toISOString() : null,
              }
            : item
        )
      )
    }
  }, [])

  const handleDismiss = () => {
    setIsDismissed(true)
    localStorage.setItem('onboarding-checklist-dismissed', 'true')
  }

  // Don't render if dismissed, loading, or no items
  if (isDismissed || isLoading || items.length === 0) {
    return null
  }

  const completedCount = items.filter(i => i.is_completed).length
  const totalCount = items.length
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
  const allComplete = completedCount === totalCount

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={className}
    >
      <Card className={cn(
        'relative overflow-hidden',
        allComplete && 'border-emerald-300 dark:border-emerald-800'
      )}>
        {/* Decorative top bar */}
        <div className={cn(
          'absolute top-0 left-0 right-0 h-1',
          allComplete ? 'bg-emerald-500' : 'bg-primary'
        )} />

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                {allComplete ? (
                  <>
                    <PartyPopper className="h-5 w-5 text-emerald-500" />
                    <span>Alla steg avklarade!</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 text-primary" />
                    <span>Välkommen! Här är din första vecka</span>
                  </>
                )}
              </CardTitle>
              <CardDescription className="mt-1">
                {allComplete
                  ? 'Bra jobbat! Du har slutfört alla första stegen.'
                  : `${completedCount} av ${totalCount} steg klara`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              {allComplete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleDismiss}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <Progress
            value={progressPercent}
            className={cn('h-2 mt-2', allComplete && '[&>div]:bg-emerald-500')}
          />
        </CardHeader>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <CardContent className="space-y-1 pt-0">
                {items.map((item) => (
                  <button
                    key={item.task_key}
                    type="button"
                    onClick={() => toggleTask(item.task_key, !item.is_completed)}
                    className={cn(
                      'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all',
                      item.is_completed
                        ? 'opacity-60 hover:opacity-80'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <Checkbox
                      checked={item.is_completed}
                      onCheckedChange={() => toggleTask(item.task_key, !item.is_completed)}
                      className="mt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'font-medium text-sm',
                          item.is_completed && 'line-through text-muted-foreground'
                        )}
                      >
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))}

                {allComplete && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleDismiss}
                    >
                      Stäng checklistan
                    </Button>
                  </div>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}
