'use client'

import { useState, useMemo } from 'react'
import { Deadline, DeadlineType } from '@/types'
import { Button } from '@/components/ui/button'
import { DeadlineCard } from './DeadlineCard'
import { DeadlineFilters } from './DeadlineFilters'
import { DeadlineForm } from './DeadlineForm'
import { isDeadlineOverdue } from '@/lib/calendar/utils'
import { Plus, Calendar } from 'lucide-react'

interface DeadlineListProps {
  deadlines: Deadline[]
  customers: { id: string; name: string }[]
  onDeadlineCreate: (data: Omit<Deadline, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>
  onDeadlineToggle: (deadline: Deadline) => Promise<void>
  onDeadlineEdit: (deadline: Deadline) => Promise<void>
  onDeadlineDelete: (deadline: Deadline) => Promise<void>
}

export function DeadlineList({
  deadlines,
  customers,
  onDeadlineCreate,
  onDeadlineToggle,
  onDeadlineEdit,
  onDeadlineDelete,
}: DeadlineListProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('pending')
  const [typeFilter, setTypeFilter] = useState<DeadlineType | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null)

  const filteredDeadlines = useMemo(() => {
    return deadlines.filter((d) => {
      // Status filter
      if (statusFilter === 'pending' && d.is_completed) return false
      if (statusFilter === 'completed' && !d.is_completed) return false

      // Type filter
      if (typeFilter !== 'all' && d.deadline_type !== typeFilter) return false

      return true
    })
  }, [deadlines, statusFilter, typeFilter])

  // Group by overdue, today, upcoming
  const groupedDeadlines = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const overdue: Deadline[] = []
    const todayDeadlines: Deadline[] = []
    const upcoming: Deadline[] = []
    const completed: Deadline[] = []

    for (const d of filteredDeadlines) {
      if (d.is_completed) {
        completed.push(d)
      } else if (isDeadlineOverdue(d)) {
        overdue.push(d)
      } else if (d.due_date === today) {
        todayDeadlines.push(d)
      } else {
        upcoming.push(d)
      }
    }

    return { overdue, today: todayDeadlines, upcoming, completed }
  }, [filteredDeadlines])

  const handleResetFilters = () => {
    setStatusFilter('all')
    setTypeFilter('all')
  }

  const handleFormSubmit = async (data: Omit<Deadline, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (editingDeadline) {
      await onDeadlineEdit({ ...editingDeadline, ...data })
    } else {
      await onDeadlineCreate(data)
    }
    setShowForm(false)
    setEditingDeadline(null)
  }

  const handleEdit = (deadline: Deadline) => {
    setEditingDeadline(deadline)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingDeadline(null)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <DeadlineFilters
          status={statusFilter}
          type={typeFilter}
          onStatusChange={setStatusFilter}
          onTypeChange={setTypeFilter}
          onReset={handleResetFilters}
        />
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Ny deadline
        </Button>
      </div>

      {/* Deadline groups */}
      {filteredDeadlines.length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-base font-medium">Inga deadlines</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter !== 'all' || typeFilter !== 'all'
              ? 'Inga deadlines matchar dina filter'
              : 'Skapa din första deadline för att komma igång'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Overdue */}
          {groupedDeadlines.overdue.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Förfallna
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground/60">
                  {groupedDeadlines.overdue.length}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                {groupedDeadlines.overdue.map((deadline) => (
                  <DeadlineCard
                    key={deadline.id}
                    deadline={deadline}
                    onToggle={onDeadlineToggle}
                    onEdit={handleEdit}
                    onDelete={onDeadlineDelete}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Today */}
          {groupedDeadlines.today.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Idag
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground/60">
                  {groupedDeadlines.today.length}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                {groupedDeadlines.today.map((deadline) => (
                  <DeadlineCard
                    key={deadline.id}
                    deadline={deadline}
                    onToggle={onDeadlineToggle}
                    onEdit={handleEdit}
                    onDelete={onDeadlineDelete}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming */}
          {groupedDeadlines.upcoming.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Kommande
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground/60">
                  {groupedDeadlines.upcoming.length}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                {groupedDeadlines.upcoming.map((deadline) => (
                  <DeadlineCard
                    key={deadline.id}
                    deadline={deadline}
                    onToggle={onDeadlineToggle}
                    onEdit={handleEdit}
                    onDelete={onDeadlineDelete}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Completed */}
          {groupedDeadlines.completed.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Klara
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground/60">
                  {groupedDeadlines.completed.length}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                {groupedDeadlines.completed.map((deadline) => (
                  <DeadlineCard
                    key={deadline.id}
                    deadline={deadline}
                    onToggle={onDeadlineToggle}
                    onEdit={handleEdit}
                    onDelete={onDeadlineDelete}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Deadline form dialog */}
      <DeadlineForm
        open={showForm}
        onOpenChange={handleFormClose}
        onSubmit={handleFormSubmit}
        initialData={editingDeadline || undefined}
        customers={customers}
      />
    </div>
  )
}
