'use client'

import { Deadline } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  isDeadlineOverdue,
  DEADLINE_TYPE_LABELS,
  PRIORITY_LABELS,
  parseDate,
  startOfDay,
} from '@/lib/calendar/utils'
import { Check, Circle, Trash2, Pencil } from 'lucide-react'

interface DeadlineCardProps {
  deadline: Deadline
  onToggle: (deadline: Deadline) => void
  onEdit?: (deadline: Deadline) => void
  onDelete?: (deadline: Deadline) => void
  compact?: boolean
}

function getRelativeDate(dateStr: string): string {
  const today = startOfDay(new Date())
  const target = parseDate(dateStr)
  const diffMs = target.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Idag'
  if (diffDays === 1) return 'Imorgon'
  if (diffDays === -1) return 'Igår'
  if (diffDays < -1) return `${Math.abs(diffDays)}d sedan`
  if (diffDays <= 14) return `Om ${diffDays}d`
  return ''
}

const SWEDISH_MONTHS_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'maj', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

export function DeadlineCard({
  deadline,
  onToggle,
  onEdit,
  onDelete,
  compact = false,
}: DeadlineCardProps) {
  const overdue = isDeadlineOverdue(deadline)
  const completed = deadline.is_completed
  const relativeDate = getRelativeDate(deadline.due_date)
  const dueDate = parseDate(deadline.due_date)
  const dayNum = dueDate.getDate()
  const monthStr = SWEDISH_MONTHS_SHORT[dueDate.getMonth()]

  if (compact) {
    return (
      <div
        className={cn(
          'group flex items-center gap-3 py-2 transition-colors',
          completed && 'opacity-50'
        )}
      >
        <button
          aria-label={completed ? 'Markera som ej klar' : 'Markera som klar'}
          onClick={() => onToggle(deadline)}
          className={cn(

        {/* Compact date */}
        <span className={cn(
          'text-xs tabular-nums w-12 flex-shrink-0',
          overdue && !completed ? 'text-destructive font-medium' : 'text-muted-foreground'
        )}>
          {dayNum} {monthStr}
        </span>

        {/* Title */}
        <p className={cn(
          'text-sm truncate flex-1 min-w-0',
          completed ? 'line-through text-muted-foreground' : 'text-foreground'
        )}>
          {deadline.title}
        </p>

        {/* Relative date */}
        {!completed && relativeDate && (
          <span className={cn(
            'text-xs flex-shrink-0',
            overdue ? 'text-destructive' : 'text-muted-foreground'
          )}>
            {relativeDate}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group relative rounded-lg border bg-card transition-[box-shadow,opacity]',
        'duration-[--duration-fast] ease-[--ease-out]',
        completed
          ? 'opacity-60'
          : 'hover:shadow-[var(--shadow-sm)]'
      )}
    >
      <div className="flex items-stretch">
        {/* Date block — calendar page motif */}
        <div className={cn(
          'flex-shrink-0 w-16 flex flex-col items-center justify-center py-4 border-r',
          completed ? 'text-muted-foreground' : 'text-foreground'
        )}>
          <span className={cn(
            'text-2xl font-display font-medium leading-none tabular-nums',
            completed && 'line-through decoration-1'
          )}>
            {dayNum}
          </span>
          <span className="text-[11px] uppercase tracking-wider mt-1 text-muted-foreground">
            {monthStr}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 py-3.5 px-4">
          {/* Top: title + hover actions */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              {/* Toggle */}
              <button
                onClick={() => onToggle(deadline)}
                className={cn(
                  'flex-shrink-0 mt-0.5 h-[18px] w-[18px] rounded-full border transition-colors',
                  completed
                    ? 'bg-success border-success text-success-foreground'
                    : 'border-border hover:border-foreground/40'
                )}
              >
                {completed && <Check className="h-3 w-3 m-auto" />}
                {!completed && (
                  <Circle className="h-3 w-3 m-auto text-transparent group-hover:text-muted-foreground/30 transition-colors" />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <p className={cn(
                  'font-medium leading-snug',
                  completed && 'line-through text-muted-foreground'
                )}>
                  {deadline.title}
                </p>

                {/* Meta line */}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {deadline.due_time && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      kl. {deadline.due_time.slice(0, 5)}
                    </span>
                  )}
                  {deadline.due_time && (deadline.customer || (!completed && relativeDate)) && (
                    <span className="text-muted-foreground/30 text-sm">·</span>
                  )}
                  {!completed && relativeDate && (
                    <span className={cn(
                      'text-sm',
                      overdue ? 'text-destructive font-medium' : 'text-muted-foreground'
                    )}>
                      {relativeDate}
                    </span>
                  )}
                  {relativeDate && deadline.customer && !completed && (
                    <span className="text-muted-foreground/30 text-sm">·</span>
                  )}
                  {deadline.customer && (
                    <span className="text-sm text-muted-foreground truncate">
                      {deadline.customer.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right column: badges + actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Badges */}
              <div className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="text-[11px] px-1.5 py-0 h-5 font-normal"
                >
                  {DEADLINE_TYPE_LABELS[deadline.deadline_type]}
                </Badge>
                {!completed && deadline.priority !== 'normal' && (
                  <Badge
                    variant={deadline.priority === 'critical' ? 'destructive' : 'warning'}
                    className="text-[11px] px-1.5 py-0 h-5"
                  >
                    {PRIORITY_LABELS[deadline.priority]}
                  </Badge>
                )}
                {overdue && !completed && (
                  <Badge variant="destructive" className="text-[11px] px-1.5 py-0 h-5">
                    Förfallen
                  </Badge>
                )}
              </div>

              {/* Actions */}
              {(onEdit || onDelete) && !completed && (
                <div className="flex items-center">
                  <div className="w-px h-4 bg-border mr-2" />
                  {onEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => onEdit(deadline)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(deadline)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {deadline.notes && !completed && (
            <p className="text-sm text-muted-foreground mt-2 ml-[30px] line-clamp-2 leading-relaxed">
              {deadline.notes}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
