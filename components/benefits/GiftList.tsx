'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import { Gift, Pencil, Trash2, Calendar, Building } from 'lucide-react'
import type { Gift as GiftType } from '@/types'

interface GiftListProps {
  gifts: GiftType[]
  onEdit: (gift: GiftType) => void
  onDelete: (id: string) => Promise<void>
  isDeleting?: boolean
}

type FilterType = 'all' | 'taxable' | 'tax_free' | 'deductible'

export default function GiftList({ gifts, onEdit, onDelete, isDeleting }: GiftListProps) {
  const [filter, setFilter] = useState<FilterType>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [giftToDelete, setGiftToDelete] = useState<GiftType | null>(null)

  // Filter gifts based on selection
  const filteredGifts = gifts.filter((gift) => {
    if (filter === 'all') return true
    if (filter === 'taxable') return gift.classification?.taxable
    if (filter === 'tax_free') return !gift.classification?.taxable
    if (filter === 'deductible') return gift.classification?.deductibleAsExpense
    return true
  })

  const handleDeleteClick = (gift: GiftType) => {
    setGiftToDelete(gift)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (giftToDelete) {
      await onDelete(giftToDelete.id)
      setDeleteDialogOpen(false)
      setGiftToDelete(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  if (gifts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Inga gåvor registrerade</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Lägg till gåvor och produkter du fått för att hålla koll på skatten
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Visar {filteredGifts.length} av {gifts.length} gåvor
        </p>
        <Select value={filter} onValueChange={(value: FilterType) => setFilter(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrera" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla</SelectItem>
            <SelectItem value="taxable">Skattepliktiga</SelectItem>
            <SelectItem value="tax_free">Skattefria</SelectItem>
            <SelectItem value="deductible">Avdragsgilla</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Gift list */}
      <div className="space-y-3">
        {filteredGifts.map((gift) => (
          <Card key={gift.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">{gift.description}</h3>
                    {gift.classification?.taxable ? (
                      <Badge variant="destructive" className="flex-shrink-0">
                        Skattepliktig
                      </Badge>
                    ) : (
                      <Badge variant="default" className="flex-shrink-0">
                        Skattefri
                      </Badge>
                    )}
                    {gift.classification?.deductibleAsExpense && (
                      <Badge variant="outline" className="flex-shrink-0">
                        Avdragsgill
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Building className="h-3 w-3" />
                      {gift.brand_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(gift.date)}
                    </span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(Number(gift.estimated_value))}
                    </span>
                  </div>

                  {gift.classification?.reasoning && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {gift.classification.reasoning}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(gift)}
                    title="Redigera"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClick(gift)}
                    title="Ta bort"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort gåva?</DialogTitle>
            <DialogDescription>
              Är du säker på att du vill ta bort &quot;{giftToDelete?.description}&quot; från{' '}
              {giftToDelete?.brand_name}? Detta kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Avbryt
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? 'Tar bort...' : 'Ta bort'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
