'use client'

import { useState } from 'react'
import { Exclusivity } from '@/types'
import { ExclusivityForm } from './ExclusivityForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Trash2, Edit2, Calendar, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ExclusivityListProps {
  campaignId: string
  exclusivities: Exclusivity[]
  onUpdate: () => void
}

export function ExclusivityList({ campaignId, exclusivities, onUpdate }: ExclusivityListProps) {
  const { toast } = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editingExclusivity, setEditingExclusivity] = useState<Exclusivity | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const handleDelete = async (exclusivity: Exclusivity) => {
    if (!confirm('Ta bort denna exklusivitet?')) return

    try {
      const response = await fetch(`/api/exclusivities/${exclusivity.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete')
      }

      toast({
        title: 'Exklusivitet borttagen',
      })

      onUpdate()
    } catch (error) {
      toast({
        title: 'Fel',
        description: 'Kunde inte ta bort exklusivitet',
        variant: 'destructive',
      })
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const getStatus = (exclusivity: Exclusivity) => {
    if (exclusivity.end_date < today) return 'expired'
    if (exclusivity.start_date > today) return 'upcoming'
    return 'active'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">
          Exklusiviteter
          <span className="text-muted-foreground ml-2">
            ({exclusivities.length})
          </span>
        </h3>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Lägg till
        </Button>
      </div>

      {exclusivities.length > 0 ? (
        <div className="space-y-3">
          {exclusivities
            .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
            .map(exclusivity => {
              const status = getStatus(exclusivity)
              return (
                <div
                  key={exclusivity.id}
                  className={cn(
                    'p-4 rounded-lg border',
                    status === 'active' && 'border-orange-200 bg-orange-50',
                    status === 'upcoming' && 'border-blue-200 bg-blue-50',
                    status === 'expired' && 'border-gray-200 bg-gray-50 opacity-60'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {status === 'active' && (
                          <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-100">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Aktiv
                          </Badge>
                        )}
                        {status === 'upcoming' && (
                          <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-100">
                            Kommande
                          </Badge>
                        )}
                        {status === 'expired' && (
                          <Badge variant="outline" className="text-gray-500">
                            Avslutad
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {exclusivity.categories.map(category => (
                          <Badge key={category} variant="secondary">
                            {category}
                          </Badge>
                        ))}
                      </div>

                      {exclusivity.excluded_brands && exclusivity.excluded_brands.length > 0 && (
                        <div className="text-sm text-muted-foreground mb-2">
                          Exkluderade varumärken: {exclusivity.excluded_brands.join(', ')}
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {formatDate(exclusivity.start_date)} - {formatDate(exclusivity.end_date)}
                        </span>
                      </div>

                      {exclusivity.notes && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {exclusivity.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingExclusivity(exclusivity)
                          setFormOpen(true)
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(exclusivity)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>Inga exklusiviteter</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setFormOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Lägg till exklusivitet
          </Button>
        </div>
      )}

      {/* Form dialog */}
      <ExclusivityForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingExclusivity(null)
        }}
        campaignId={campaignId}
        initialData={editingExclusivity || undefined}
        onSuccess={() => {
          setFormOpen(false)
          setEditingExclusivity(null)
          onUpdate()
        }}
      />
    </div>
  )
}
