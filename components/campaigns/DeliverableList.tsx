'use client'

import { useState } from 'react'
import { Deliverable, DeliverableStatus, DELIVERABLE_STATUS_LABELS } from '@/types'
import { DeliverableCard } from './DeliverableCard'
import { DeliverableForm } from './DeliverableForm'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DeliverableListProps {
  campaignId: string
  deliverables: Deliverable[]
  onUpdate: () => void
}

export function DeliverableList({ campaignId, deliverables, onUpdate }: DeliverableListProps) {
  const { toast } = useToast()
  const [showCompleted, setShowCompleted] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingDeliverable, setEditingDeliverable] = useState<Deliverable | null>(null)

  // Split deliverables by completion status
  const activeDeliverables = deliverables.filter(d =>
    !['approved', 'published'].includes(d.status)
  )
  const completedDeliverables = deliverables.filter(d =>
    ['approved', 'published'].includes(d.status)
  )

  const handleStatusChange = async (deliverable: Deliverable, newStatus: string) => {
    try {
      const response = await fetch(`/api/deliverables/${deliverable.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }

      toast({
        title: 'Status uppdaterad',
        description: `${deliverable.title}: ${DELIVERABLE_STATUS_LABELS[newStatus as DeliverableStatus]}`,
      })

      onUpdate()
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte uppdatera status',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (deliverable: Deliverable) => {
    if (!confirm(`Ta bort "${deliverable.title}"?`)) return

    try {
      const response = await fetch(`/api/deliverables/${deliverable.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      toast({
        title: 'Innehåll borttaget',
        description: deliverable.title,
      })

      onUpdate()
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort innehåll',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          Innehåll
          <span className="text-muted-foreground ml-2">
            ({activeDeliverables.length} aktiva)
          </span>
        </h3>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Lägg till
        </Button>
      </div>

      {/* Active deliverables */}
      {activeDeliverables.length > 0 ? (
        <div className="space-y-3">
          {activeDeliverables
            .sort((a, b) => {
              // Sort by due date, nulls last
              if (!a.due_date && !b.due_date) return 0
              if (!a.due_date) return 1
              if (!b.due_date) return -1
              return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
            })
            .map(deliverable => (
              <DeliverableCard
                key={deliverable.id}
                deliverable={deliverable}
                onStatusChange={handleStatusChange}
                onEdit={(d) => {
                  setEditingDeliverable(d)
                  setFormOpen(true)
                }}
                onDelete={handleDelete}
              />
            ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>Inget aktivt innehåll</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setFormOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Lägg till innehåll
          </Button>
        </div>
      )}

      {/* Completed deliverables */}
      {completedDeliverables.length > 0 && (
        <div className="pt-4 border-t">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {showCompleted ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            Klara ({completedDeliverables.length})
          </button>

          {showCompleted && (
            <div className="space-y-3 mt-3">
              {completedDeliverables.map(deliverable => (
                <DeliverableCard
                  key={deliverable.id}
                  deliverable={deliverable}
                  onEdit={(d) => {
                    setEditingDeliverable(d)
                    setFormOpen(true)
                  }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Form dialog */}
      <DeliverableForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingDeliverable(null)
        }}
        campaignId={campaignId}
        initialData={editingDeliverable || undefined}
        onSuccess={() => {
          setFormOpen(false)
          setEditingDeliverable(null)
          onUpdate()
        }}
      />
    </div>
  )
}
