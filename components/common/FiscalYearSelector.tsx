'use client'

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Lock } from 'lucide-react'
import { useCompany } from '@/contexts/CompanyContext'
import type { FiscalPeriod } from '@/types'

const STORAGE_KEY_PREFIX = 'gnubok:fiscal-year:'
const ALL_YEARS_VALUE = '__all__'

interface Props {
  /**
   * Current selection. `null` means "all years" — no filter applied.
   */
  value: string | null
  onChange: (periodId: string | null) => void
  /**
   * If true, include an "Alla räkenskapsår" option that clears the filter.
   * Pages that require a specific period (e.g. Reports) should pass false.
   */
  includeAllOption?: boolean
  /**
   * Optional label above the select. Pass null to render without a label.
   */
  label?: string | null
  /**
   * If true, only show periods whose start date is on or before today.
   * Matches the Reports-page filter.
   */
  hideFuturePeriods?: boolean
  /**
   * Called once after the initial period fetch completes. Useful for callers
   * that want to suppress a skeleton until the selector is ready.
   */
  onReady?: () => void
  className?: string
}

/**
 * Shared fiscal-year (räkenskapsår) selector.
 *
 * Loads periods for the active company, persists the last selection per
 * company in localStorage, and renders the same Select used elsewhere in the
 * app so the UX is consistent across Bookkeeping, Reports, etc.
 *
 * The component is controlled: the caller owns the selected period id and
 * threads it into whichever queries need scoping.
 */
export function FiscalYearSelector({
  value,
  onChange,
  includeAllOption = true,
  label = 'Räkenskapsår',
  hideFuturePeriods = false,
  onReady,
  className,
}: Props) {
  const { company } = useCompany()
  const [periods, setPeriods] = useState<FiscalPeriod[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!company?.id) return
    let cancelled = false
    ;(async () => {
      const res = await fetch('/api/bookkeeping/fiscal-periods')
      if (!res.ok) {
        if (!cancelled) {
          setLoaded(true)
          onReady?.()
        }
        return
      }
      const { data } = await res.json()
      if (cancelled) return

      let fetched: FiscalPeriod[] = data || []
      if (hideFuturePeriods) {
        const today = new Date().toISOString().split('T')[0]
        fetched = fetched.filter((p) => p.period_start <= today)
      }
      // Newest first — most migrations list recent years at the top
      fetched.sort((a, b) => b.period_start.localeCompare(a.period_start))
      setPeriods(fetched)
      setLoaded(true)

      // Restore last selection (only if caller hasn't already set a value).
      // localStorage access is guarded because this is a 'use client' component
      // but still runs during SSR on first render for some setups.
      if (value === null && typeof window !== 'undefined') {
        const stored = window.localStorage.getItem(STORAGE_KEY_PREFIX + company.id)
        if (stored === ALL_YEARS_VALUE) {
          if (includeAllOption) onChange(null)
          else if (fetched.length > 0) onChange(fetched[0].id)
        } else if (stored && fetched.some((p) => p.id === stored)) {
          onChange(stored)
        } else if (!includeAllOption && fetched.length > 0) {
          onChange(fetched[0].id)
        }
      }

      onReady?.()
    })()
    return () => {
      cancelled = true
    }
  // onReady is intentionally excluded from deps: it's a lifecycle callback that
  // should fire once per load, not re-trigger if the parent re-creates it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, hideFuturePeriods, includeAllOption])

  const handleChange = (next: string) => {
    const nextPeriodId = next === ALL_YEARS_VALUE ? null : next
    if (company?.id && typeof window !== 'undefined') {
      window.localStorage.setItem(
        STORAGE_KEY_PREFIX + company.id,
        nextPeriodId ?? ALL_YEARS_VALUE,
      )
    }
    onChange(nextPeriodId)
  }

  const selectValue = value ?? (includeAllOption ? ALL_YEARS_VALUE : '')

  // Surface lock status for the currently-selected period. Browsing locked
  // years is read-only and allowed (BFL 7:1 requires access to historical
  // data), but the user should see clearly that they're looking at a
  // closed/locked year so the absence of write controls feels intentional.
  const selectedPeriod = value ? periods.find((p) => p.id === value) : null
  const lockState: 'locked' | 'closed' | null = selectedPeriod?.locked_at
    ? 'locked'
    : selectedPeriod?.is_closed
      ? 'closed'
      : null

  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      <div className={`flex items-center gap-2 ${label ? 'mt-1' : ''}`}>
        <Select
          value={selectValue}
          onValueChange={handleChange}
          disabled={!loaded || periods.length === 0}
        >
          <SelectTrigger className="w-full sm:w-[280px]">
            <SelectValue placeholder={loaded ? 'Välj räkenskapsår' : 'Laddar…'} />
          </SelectTrigger>
          <SelectContent>
            {includeAllOption && (
              <SelectItem value={ALL_YEARS_VALUE}>Alla räkenskapsår</SelectItem>
            )}
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.period_start} — {p.period_end})
                {p.locked_at ? ' — låst' : p.is_closed ? ' — stängt' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {lockState && (
          <Badge
            variant="outline"
            className="gap-1 text-xs font-normal shrink-0"
            title={
              lockState === 'locked'
                ? 'Räkenskapsåret är låst — ingen bokföring kan ändras eller läggas till'
                : 'Räkenskapsåret är stängt (årsbokslut upprättat) — kan återöppnas av admin'
            }
          >
            <Lock className="h-3 w-3" />
            {lockState === 'locked' ? 'Låst' : 'Stängt'}
          </Badge>
        )}
      </div>
    </div>
  )
}
