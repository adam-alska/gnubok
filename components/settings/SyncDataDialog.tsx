'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2,
  Database,
  ShoppingCart,
  PackageOpen,
  Users,
  Layers,
  Calendar,
  Clock,
} from 'lucide-react'

interface FinancialYear {
  id: number
  fromDate: string
  toDate: string
}

interface DataTypeInfo {
  id: string
  name: string
  category: string
  requiredScope: string
  requiresFinancialYear?: boolean
  description?: string
  scopeAvailable: boolean
}

const CATEGORY_ORDER = ['accounting', 'sales', 'purchase', 'hr', 'other']
const CATEGORY_LABELS: Record<string, string> = {
  accounting: 'Bokföring',
  sales: 'Försäljning',
  purchase: 'Inköp',
  hr: 'Löner',
  other: 'Övrigt',
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  accounting: <Database className="h-3.5 w-3.5" />,
  sales: <ShoppingCart className="h-3.5 w-3.5" />,
  purchase: <PackageOpen className="h-3.5 w-3.5" />,
  hr: <Users className="h-3.5 w-3.5" />,
  other: <Layers className="h-3.5 w-3.5" />,
}

interface SyncDataDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string | null
  onSubmit: (dataTypeIds: string[], financialYear?: number) => void
  isLoading: boolean
}

export function SyncDataDialog({
  open,
  onOpenChange,
  connectionId,
  onSubmit,
  isLoading,
}: SyncDataDialogProps) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [years, setYears] = useState<FinancialYear[]>([])
  const [dataTypes, setDataTypes] = useState<DataTypeInfo[]>([])
  const [isFetchingYears, setIsFetchingYears] = useState(false)
  const [isFetchingTypes, setIsFetchingTypes] = useState(false)

  useEffect(() => {
    if (!open || !connectionId) return

    let cancelled = false
    setIsFetchingTypes(true)
    setIsFetchingYears(true)

    async function fetchData() {
      const [typesRes, yearsRes] = await Promise.allSettled([
        fetch(`/api/connections/${connectionId}/available-data-types`).then((r) => r.json()),
        fetch(`/api/connections/${connectionId}/financial-years`).then((r) => r.json()),
      ])

      if (cancelled) return

      if (yearsRes.status === 'fulfilled' && yearsRes.value.data) {
        const yrs = yearsRes.value.data as FinancialYear[]
        setYears(yrs)
        setSelectedYear(yrs.length > 0 ? yrs[0].id : null)
      } else {
        setYears([])
        setSelectedYear(null)
      }

      if (typesRes.status === 'fulfilled' && typesRes.value.data) {
        setDataTypes(typesRes.value.data as DataTypeInfo[])
        setSelectedTypes(new Set())
      } else {
        setDataTypes([])
        setSelectedTypes(new Set())
      }

      setIsFetchingTypes(false)
      setIsFetchingYears(false)
    }

    fetchData()

    return () => { cancelled = true }
  }, [open, connectionId])

  const sieType = useMemo(() => dataTypes.find((dt) => dt.id === 'sie4'), [dataTypes])
  const sieSelected = selectedTypes.has('sie4')
  const needsFinancialYear = sieSelected

  const otherTypesByCategory = useMemo(() => {
    const groups: Record<string, DataTypeInfo[]> = {}
    for (const dt of dataTypes) {
      if (dt.id === 'sie4') continue
      if (!groups[dt.category]) groups[dt.category] = []
      groups[dt.category].push(dt)
    }
    return groups
  }, [dataTypes])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedTypes.size === 0) return
    const ids = Array.from(selectedTypes)
    onSubmit(ids, needsFinancialYear && selectedYear !== null ? selectedYear : undefined)
  }

  const isInitializing = isFetchingTypes || isFetchingYears

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        {/* Header with subtle bottom border */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
          <DialogTitle className="text-xl">Hämta data från Fortnox</DialogTitle>
          <DialogDescription>
            Välj vilken data du vill importera från ditt Fortnox-konto.
          </DialogDescription>
        </DialogHeader>

        {isInitializing ? (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Hämtar tillgängliga datatyper...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

              {/* SIE4 — highlighted primary action */}
              {sieType && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center">
                      <Database className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Rekommenderat
                    </span>
                  </div>

                  <label
                    className={`group flex items-start gap-3.5 rounded-xl border-2 p-4 transition-all duration-[var(--duration-base)] ease-[var(--ease-out)] ${
                      !sieType.scopeAvailable
                        ? 'opacity-50 cursor-not-allowed border-border'
                        : sieSelected
                          ? 'border-primary bg-primary/[0.03] shadow-[var(--shadow-sm)] cursor-pointer'
                          : 'border-border hover:border-primary/30 hover:shadow-[var(--shadow-sm)] cursor-pointer'
                    }`}
                  >
                    <Checkbox
                      checked={sieSelected}
                      onCheckedChange={() => {
                        setSelectedTypes((prev) => {
                          const next = new Set(prev)
                          if (next.has('sie4')) next.delete('sie4')
                          else next.add('sie4')
                          return next
                        })
                      }}
                      disabled={!sieType.scopeAvailable}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{sieType.name}</span>
                      </div>
                      {sieType.description && (
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          {sieType.description}
                        </p>
                      )}

                      {/* Financial year selector */}
                      {sieSelected && (
                        <div className="mt-4 pt-3 border-t border-border/40">
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">Räkenskapsår</span>
                          </div>
                          {years.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Inga räkenskapsår hittades i Fortnox.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {years.map((year) => (
                                <button
                                  key={year.id}
                                  type="button"
                                  onClick={() => setSelectedYear(year.id)}
                                  className={`px-3.5 py-2 rounded-lg border text-sm transition-all duration-[var(--duration-fast)] ease-[var(--ease-out)] ${
                                    selectedYear === year.id
                                      ? 'border-primary bg-primary/10 font-medium text-foreground shadow-[var(--shadow-sm)]'
                                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                                  }`}
                                >
                                  {year.fromDate} — {year.toDate}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              )}

              {/* Other data types grouped by category */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-5 w-5 rounded-md bg-muted flex items-center justify-center">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Fler datatyper
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {CATEGORY_ORDER.map((category) => {
                    const types = otherTypesByCategory[category]
                    if (!types || types.length === 0) return null
                    return (
                      <div
                        key={category}
                        className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden"
                      >
                        {/* Category header */}
                        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/40 bg-muted/30">
                          <span className="text-muted-foreground/70">
                            {CATEGORY_ICONS[category]}
                          </span>
                          <span className="text-xs font-semibold text-muted-foreground">
                            {CATEGORY_LABELS[category] || category}
                          </span>
                        </div>

                        {/* Data type rows */}
                        <div className="px-1 py-1">
                          {types.map((dt) => (
                            <div
                              key={dt.id}
                              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-muted-foreground/50"
                            >
                              <Checkbox disabled checked={false} className="opacity-30" />
                              <span className="flex-1 truncate">{dt.name}</span>
                              <span className="text-[10px] tracking-wider text-muted-foreground/35 shrink-0 font-medium uppercase">
                                Kommer snart
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Footer pinned to bottom */}
            <DialogFooter className="px-6 py-4 border-t border-border/50 bg-muted/20 shrink-0">
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
                disabled={
                  isLoading ||
                  selectedTypes.size === 0 ||
                  (needsFinancialYear && years.length > 0 && selectedYear === null)
                }
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
        )}
      </DialogContent>
    </Dialog>
  )
}
