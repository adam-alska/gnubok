'use client'

import { Deadline } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  isDeadlineOverdue,
  DEADLINE_TYPE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from '@/lib/calendar/utils'
import { CheckCircle, Circle, Clock, AlertTriangle, Trash2, Edit2 } from 'lucide-react'

interface DeadlineCardProps {
  deadline: Deadline
  onToggle: (deadline: Deadline) => void
  onEdit?: (deadline: Deadline) => void
  onDelete?: (deadline: Deadline) => void
  compact?: boolean
}

export function DeadlineCard({
  deadline,
  onToggle,
  onEdit,
  onDelete,
  compact = false,
}: DeadlineCardProps) {
  const overdue = isDeadlineOverdue(deadline)
  const completed = deadline.is_completed
  const priorityStyle = PRIORITY_COLORS[deadline.priority]

  const formatDueDate = () => {
    const date = new Date(deadline.due_date)
    const formatted = date.toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
    })
    if (deadline.due_time) {
      return `${formatted} kl. ${deadline.due_time.slice(0, 5)}`
    }
    return formatted
  }

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 p-2 rounded-lg border transition-colors',
          overdue && !completed
            ? 'border-destructive/50 bg-destructive/5'
            : completed
            ? 'border-success/50 bg-success/5'
            : `${priorityStyle.border} ${priorityStyle.bg}`
        )}
      >
        <button onClick={() => onToggle(deadline)} className="flex-shrink-0">
          {completed ? (
            <CheckCircle className="h-4 w-4 text-success" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm font-medium truncate',
              completed && 'line-through text-muted-foreground'
            )}
          >
            {deadline.title}
          </p>
        </div>
        {deadline.priority !== 'normal' && !completed && (
          <div
            className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              deadline.priority === 'critical' ? 'bg-destructive' : 'bg-warning'
            )}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'p-4 rounded-lg border transition-colors',
        overdue && !completed
          ? 'border-destructive/50 bg-destructive/5'
          : completed
          ? 'border-success/50 bg-success/5'
          : `${priorityStyle.border} ${priorityStyle.bg}`
      )}
    >
      <div className="flex items-start gap-3">
        <button onClick={() => onToggle(deadline)} className="mt-0.5 flex-shrink-0">
          {completed ? (
            <CheckCircle className="h-5 w-5 text-success" />
          ) : overdue ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <Clock className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p
                className={cn(
                  'font-medium',
                  completed && 'line-through text-muted-foreground'
                )}
              >
                {deadline.title}
              </p>
              <p className="text-sm text-muted-foreground">{formatDueDate()}</p>
              {deadline.customer && (
                <p className="text-sm text-muted-foreground">{deadline.customer.name}</p>
              )}
            </div>

            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className="text-xs">
                {DEADLINE_TYPE_LABELS[deadline.deadline_type]}
              </Badge>
              {!completed && deadline.priority !== 'normal' && (
                <Badge
                  variant={deadline.priority === 'critical' ? 'destructive' : 'warning'}
                  className="text-xs"
                >
                  {PRIORITY_LABELS[deadline.priority]}
                </Badge>
              )}
              {overdue && !completed && (
                <Badge variant="destructive" className="text-xs">
                  Förfallen
                </Badge>
              )}
            </div>
          </div>

          {deadline.notes && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {deadline.notes}
            </p>
          )}
        </div>
      </div>

      {(onEdit || onDelete) && (
        <div className="flex justify-end gap-1 mt-2 pt-2 border-t">
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={() => onEdit(deadline)}>
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(deadline)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
