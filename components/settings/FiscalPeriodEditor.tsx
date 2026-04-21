'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCompany } from '@/contexts/CompanyContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import {
  DestructiveConfirmDialog,
  useDestructiveConfirm,
} from '@/components/ui/destructive-confirm-dialog'
import { Loader2, CalendarDays, Info, Lock } from 'lucide-react'
import { monthsBetween, parseDateParts } from '@/lib/bookkeeping/validate-period-duration'
import type { FiscalPeriod } from '@/types'

function formatSwedishDate(dateStr: string): string {
  const months = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december',
  ]
  const { year, month, day } = parseDateParts(dateStr)
  return `${day} ${months[month - 1]} ${year}`
}

function isCalendarYear(period: { period_start: string; period_end: string }): boolean {
  const s = parseDateParts(period.period_start)
  const e = parseDateParts(period.period_end)
  return s.month === 1 && s.day === 1 && e.month === 12 && e.day === 31
}

export function FiscalPeriodEditor() {
  const { company, role } = useCompany()
  const { toast } = useToast()
  const { dialogProps, confirm } = useDestructiveConfirm()

  const [period, setPeriod] = useState<FiscalPeriod | null>(null)
  const [postedCount, setPostedCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const isEF = company?.entity_type === 'enskild_firma'
  const canEdit = role === 'owner' || role === 'admin'

  useEffect(() => {
    if (!company) return
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const res = await fetch('/api/bookkeeping/fiscal-periods')
        if (!res.ok) throw new Error('Kunde inte hämta räkenskapsår')
        const { data } = (await res.json()) as { data: FiscalPeriod[] }
        if (!data || data.length === 0) {
          if (!cancelled) {
            setPeriod(null)
            setIsLoading(false)
          }
          return
        }
        const sorted = [...data].sort((a, b) => a.period_start.localeCompare(b.period_start))
        const first = sorted[0]

        const countRes = await fetch(`/api/bookkeeping/fiscal-periods/${first.id}/entry-count`)
        if (!countRes.ok) throw new Error('Kunde inte hämta verifikationsantal')
        const { data: countData } = (await countRes.json()) as { data: { posted_count: number } }

        if (cancelled) return
        setPeriod(first)
        setPostedCount(countData.posted_count)
        setStartDate(first.period_start)
        setEndDate(first.period_end)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Okänt fel')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [company])

  const durationMonths = useMemo(() => {
    if (!startDate || !endDate || endDate <= startDate) return null
    return monthsBetween(startDate, endDate)
  }, [startDate, endDate])

  const efCalendarYearInvalid = useMemo(() => {
    if (!isEF || !startDate || !endDate) return false
    return !isCalendarYear({ period_start: startDate, period_end: endDate })
  }, [isEF, startDate, endDate])

  const exceedsMaxDuration = durationMonths !== null && durationMonths > 18

  const isBlocked =
    !!period && (period.locked_at || period.is_closed || (postedCount ?? 0) > 0)

  const isDirty =
    period !== null && (startDate !== period.period_start || endDate !== period.period_end)

  if (!company || !canEdit) return null

  async function handleSave() {
    if (!period || !company) return
    if (!isDirty) return

    const ok = await confirm({
      title: 'Ändra första räkenskapsåret?',
      description: `Detta ändrar ditt första räkenskapsår från ${formatSwedishDate(period.period_start)} – ${formatSwedishDate(period.period_end)} till ${formatSwedishDate(startDate)} – ${formatSwedishDate(endDate)}. Ändringen är bara tillåten eftersom inga verifikationer är bokförda ännu. Fortsätt?`,
      confirmLabel: 'Ja, ändra räkenskapsår',
      cancelLabel: 'Avbryt',
      variant: 'warning',
    })
    if (!ok) return

    setIsSaving(true)
    try {
      const newName = `Räkenskapsår ${parseDateParts(endDate).year}`
      const res = await fetch(`/api/bookkeeping/fiscal-periods/${period.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_start: startDate,
          period_end: endDate,
          name: newName,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || 'Kunde inte ändra räkenskapsår')
      }
      setPeriod(body.data as FiscalPeriod)
      toast({
        title: 'Räkenskapsår uppdaterat',
        description: `${formatSwedishDate(body.data.period_start)} – ${formatSwedishDate(body.data.period_end)}`,
      })
    } catch (err) {
      toast({
        title: 'Kunde inte ändra räkenskapsår',
        description: err instanceof Error ? err.message : 'Försök igen.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  function handleReset() {
    if (!period) return
    setStartDate(period.period_start)
    setEndDate(period.period_end)
  }

  return (
    <>
      <section className="space-y-4 border-t border-border/8 pt-8">
        <div className="space-y-1">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Första räkenskapsår
          </h2>
          <p className="text-sm text-muted-foreground">
            Om du valde fel räkenskapsår vid uppstart kan du justera det här — så länge du inte har bokfört någon verifikation ännu.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hämtar räkenskapsår...
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : !period ? (
          <p className="text-sm text-muted-foreground">Inget räkenskapsår hittades.</p>
        ) : isBlocked ? (
          <BlockedState
            period={period}
            postedCount={postedCount ?? 0}
          />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm flex gap-2">
              <Info className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">Ändra med omsorg.</p>
                <p className="text-muted-foreground">
                  Ändringen påverkar öppningsbalanser och rapporter.
                  {isEF && ' Enskild firma måste använda kalenderår enligt BFL 3 kap.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fp_start">Startdatum</Label>
                <Input
                  id="fp_start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Första räkenskapsåret kan börja valfri dag.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fp_end">Slutdatum</Label>
                <Input
                  id="fp_end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Måste vara sista dagen i en månad.
                </p>
              </div>
            </div>

            {startDate && endDate && endDate > startDate && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Föreslaget räkenskapsår
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatSwedishDate(startDate)} &ndash; {formatSwedishDate(endDate)}
                </p>
                {durationMonths !== null && (
                  <p className={`text-xs ${exceedsMaxDuration ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {durationMonths} månader
                    {exceedsMaxDuration && ' — över 18 månader är inte tillåtet (BFL 3 kap.)'}
                  </p>
                )}
                {efCalendarYearInvalid && (
                  <p className="text-xs text-destructive">
                    Enskild firma måste använda kalenderår (1 januari &ndash; 31 december).
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={!isDirty || isSaving}
              >
                Återställ
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={
                  !isDirty ||
                  isSaving ||
                  !startDate ||
                  !endDate ||
                  endDate <= startDate ||
                  exceedsMaxDuration ||
                  efCalendarYearInvalid
                }
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sparar...
                  </>
                ) : (
                  'Spara ändring'
                )}
              </Button>
            </div>
          </div>
        )}
      </section>
      <DestructiveConfirmDialog {...dialogProps} />
    </>
  )
}

function BlockedState({
  period,
  postedCount,
}: {
  period: FiscalPeriod
  postedCount: number
}) {
  const reason = period.locked_at
    ? 'Räkenskapsåret är låst.'
    : period.is_closed
      ? 'Räkenskapsåret är stängt.'
      : `${postedCount} bokförd${postedCount === 1 ? '' : 'a'} verifikation${postedCount === 1 ? '' : 'er'} finns redan i perioden.`

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
      <div className="flex gap-2">
        <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Räkenskapsåret kan inte längre ändras</p>
          <p className="text-sm text-muted-foreground">{reason}</p>
        </div>
      </div>
      <div className="text-sm text-muted-foreground space-y-1">
        <p>
          Nuvarande period:{' '}
          <span className="font-medium text-foreground">
            {formatSwedishDate(period.period_start)} &ndash; {formatSwedishDate(period.period_end)}
          </span>
          {isCalendarYear(period) ? ' (kalenderår)' : ' (brutet räkenskapsår)'}
        </p>
        <p>
          Om du måste börja om kan du radera företaget längst ner på sidan och skapa ett nytt.
          Bokföringsdata behålls i 7 år enligt BFL 7 kap. 2§.
        </p>
      </div>
    </div>
  )
}
