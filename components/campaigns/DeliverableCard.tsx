'use client'

import { Deliverable, DELIVERABLE_STATUS_LABELS, DELIVERABLE_TYPE_LABELS, PLATFORM_LABELS } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  CheckCircle,
  Circle,
  Clock,
  Edit2,
  Trash2,
  ExternalLink,
  RotateCcw,
  Send
} from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700 border-gray-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  submitted: 'bg-purple-100 text-purple-700 border-purple-200',
  revision: 'bg-orange-100 text-orange-700 border-orange-200',
  approved: 'bg-green-100 text-green-700 border-green-200',
  published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

interface DeliverableCardProps {
  deliverable: Deliverable
  onStatusChange?: (deliverable: Deliverable, newStatus: string) => void
  onEdit?: (deliverable: Deliverable) => void
  onDelete?: (deliverable: Deliverable) => void
  compact?: boolean
}

export function DeliverableCard({
  deliverable,
  onStatusChange,
  onEdit,
  onDelete,
  compact = false
}: DeliverableCardProps) {
  const isCompleted = deliverable.status === 'approved' || deliverable.status === 'published'
  const isOverdue = deliverable.due_date && new Date(deliverable.due_date) < new Date() && !isCompleted

  const formatDate = (date: string | null) => {
    if (!date) return null
    return new Date(date).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
    })
  }

  // Next logical status based on current
  const getNextStatus = () => {
    switch (deliverable.status) {
      case 'pending': return 'in_progress'
      case 'in_progress': return 'submitted'
      case 'submitted': return 'approved'
      case 'revision': return 'submitted'
      case 'approved': return 'published'
      default: return null
    }
  }

  const nextStatus = getNextStatus()

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 p-2 rounded-lg border',
          isOverdue ? 'border-destructive/50 bg-destructive/5' : 'border-border'
        )}
      >
        <button
          onClick={() => nextStatus && onStatusChange?.(deliverable, nextStatus)}
          className="flex-shrink-0"
          disabled={!onStatusChange || !nextStatus}
        >
          {isCompleted ? (
            <CheckCircle className="h-4 w-4 text-success" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm font-medium truncate',
            isCompleted && 'line-through text-muted-foreground'
          )}>
            {deliverable.title}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {PLATFORM_LABELS[deliverable.platform]}
        </Badge>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'p-4 rounded-lg border',
        isOverdue ? 'border-destructive/50 bg-destructive/5' : 'border-border'
      )}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => nextStatus && onStatusChange?.(deliverable, nextStatus)}
          className="mt-0.5 flex-shrink-0"
          disabled={!onStatusChange || !nextStatus}
        >
          {isCompleted ? (
            <CheckCircle className="h-5 w-5 text-success" />
          ) : isOverdue ? (
            <Clock className="h-5 w-5 text-destructive" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={cn(
                'font-medium',
                isCompleted && 'line-through text-muted-foreground'
              )}>
                {deliverable.title}
                {deliverable.quantity > 1 && (
                  <span className="text-muted-foreground ml-1">×{deliverable.quantity}</span>
                )}
              </p>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>{PLATFORM_LABELS[deliverable.platform]}</span>
                <span>·</span>
                <span>{DELIVERABLE_TYPE_LABELS[deliverable.deliverable_type]}</span>
                {deliverable.account_handle && (
                  <>
                    <span>·</span>
                    <span>{deliverable.account_handle}</span>
                  </>
                )}
              </div>
              {deliverable.due_date && (
                <p className={cn(
                  'text-sm mt-1',
                  isOverdue && !isCompleted ? 'text-destructive' : 'text-muted-foreground'
                )}>
                  Deadline: {formatDate(deliverable.due_date)}
                </p>
              )}
            </div>

            <div className="flex flex-col items-end gap-1">
              <Badge
                variant="outline"
                className={cn('text-xs', STATUS_STYLES[deliverable.status])}
              >
                {DELIVERABLE_STATUS_LABELS[deliverable.status]}
              </Badge>
              {isOverdue && !isCompleted && (
                <Badge variant="destructive" className="text-xs">
                  Försenad
                </Badge>
              )}
            </div>
          </div>

          {deliverable.description && (
            <p className="text-sm text-muted-foreground mt-2">
              {deliverable.description}
            </p>
          )}

          {/* Timestamps */}
          {(deliverable.submitted_at || deliverable.approved_at || deliverable.published_at) && (
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
              {deliverable.submitted_at && (
                <span>Inskickat: {formatDate(deliverable.submitted_at)}</span>
              )}
              {deliverable.approved_at && (
                <span>Godkänt: {formatDate(deliverable.approved_at)}</span>
              )}
              {deliverable.published_at && (
                <span>Publicerat: {formatDate(deliverable.published_at)}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {(onStatusChange || onEdit || onDelete) && (
        <div className="flex justify-between items-center gap-1 mt-3 pt-3 border-t">
          {/* Status progression buttons */}
          <div className="flex gap-1">
            {onStatusChange && nextStatus && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStatusChange(deliverable, nextStatus)}
                className="text-xs"
              >
                {nextStatus === 'in_progress' && <Clock className="h-3 w-3 mr-1" />}
                {nextStatus === 'submitted' && <Send className="h-3 w-3 mr-1" />}
                {nextStatus === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                {nextStatus === 'published' && <ExternalLink className="h-3 w-3 mr-1" />}
                {DELIVERABLE_STATUS_LABELS[nextStatus as keyof typeof DELIVERABLE_STATUS_LABELS]}
              </Button>
            )}
            {onStatusChange && deliverable.status === 'submitted' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStatusChange(deliverable, 'revision')}
                className="text-xs text-orange-600"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Revision
              </Button>
            )}
          </div>

          <div className="flex gap-1">
            {onEdit && (
              <Button variant="ghost" size="sm" onClick={() => onEdit(deliverable)}>
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(deliverable)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
