'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

interface FinancialYear {
  id: number
  fromDate: string
  toDate: string
}

interface SyncDataDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string | null
  onSubmit: (financialYear: number) => void
  isLoading: boolean
}

export function SyncDataDialog({
  open,
  onOpenChange,
  connectionId,
  onSubmit,
  isLoading,
}: SyncDataDialogProps) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [years, setYears] = useState<FinancialYear[]>([])
  const [isFetchingYears, setIsFetchingYears] = useState(false)

  useEffect(() => {
    if (open && connectionId) {
      setIsFetchingYears(true)
      setYears([])
      setSelectedYear(null)
      fetch(`/api/connections/${connectionId}/financial-years`)
        .then((res) => res.json())
        .then((result) => {
          if (result.data) {
            setYears(result.data)
            if (result.data.length > 0) {
              setSelectedYear(result.data[0].id)
            }
          }
        })
        .catch(() => {})
        .finally(() => setIsFetchingYears(false))
    }
  }, [open, connectionId])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedYear !== null) {
      onSubmit(selectedYear)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hämta bokföringsdata</DialogTitle>
          <DialogDescription>
            Välj räkenskapsår att importera från Fortnox. Data importeras som SIE4 och bokförs automatiskt.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Räkenskapsår</Label>
            {isFetchingYears ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Hämtar räkenskapsår från Fortnox...
              </div>
            ) : years.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Inga räkenskapsår hittades i Fortnox.
              </p>
            ) : (
              <div className="grid gap-2">
                {years.map((year) => (
                  <button
                    key={year.id}
                    type="button"
                    onClick={() => setSelectedYear(year.id)}
                    className={`text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                      selectedYear === year.id
                        ? 'border-primary bg-primary/5 font-medium'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    {year.fromDate} — {year.toDate}
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Avbryt
            </Button>
            <Button
              type="submit"
              variant="outline"
              disabled={isLoading || selectedYear === null}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Hämtar data...
                </>
              ) : (
                'Hämta data'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
