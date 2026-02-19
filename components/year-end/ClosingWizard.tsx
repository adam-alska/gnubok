'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Scale,
  Settings2,
  FileText,
  BookOpen,
  ArrowRightLeft,
} from 'lucide-react'
import { ChecklistSection } from './ChecklistSection'
import { TrialBalanceCheck } from './TrialBalanceCheck'
import { ClosingEntryPreview } from './ClosingEntryPreview'
import { AnnualReportEditor } from './AnnualReportEditor'
import { OpeningBalancesSection } from './OpeningBalancesSection'
import type { YearEndClosing, YearEndChecklist, YearEndStepKey } from '@/types/year-end'
import { YEAR_END_STEPS } from '@/types/year-end'

interface ClosingWizardProps {
  closingId: string
}

const STEP_ICONS = {
  preparation: ClipboardCheck,
  verification: Scale,
  adjustments: Settings2,
  closing: FileText,
  opening: ArrowRightLeft,
  report: BookOpen,
}

export function ClosingWizard({ closingId }: ClosingWizardProps) {
  const [closing, setClosing] = useState<YearEndClosing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)

  const fetchClosing = useCallback(async () => {
    try {
      const res = await fetch(`/api/year-end/${closingId}`)
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setClosing(result.data)
        // Set step based on status
        if (result.data.status === 'completed') {
          setCurrentStep(5) // Report step
        }
      }
    } catch {
      setError('Kunde inte ladda bokslut')
    } finally {
      setLoading(false)
    }
  }, [closingId])

  useEffect(() => {
    fetchClosing()
  }, [fetchClosing])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground mt-3">Laddar bokslut...</p>
        </div>
      </div>
    )
  }

  if (error || !closing) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive">{error || 'Bokslut hittades inte'}</p>
          <Button variant="outline" className="mt-4" onClick={() => window.history.back()}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Tillbaka
          </Button>
        </CardContent>
      </Card>
    )
  }

  const period = closing.fiscal_period
  const checklist = closing.checklist_data as YearEndChecklist
  const isCompleted = closing.status === 'completed'

  const step = YEAR_END_STEPS[currentStep]

  function handleChecklistUpdate(updatedChecklist: YearEndChecklist) {
    setClosing((prev) =>
      prev ? { ...prev, checklist_data: updatedChecklist } : prev
    )
  }

  function handleClosingExecuted() {
    fetchClosing()
    setCurrentStep(4) // Move to opening balances
  }

  function handleOpeningBalancesCreated() {
    fetchClosing()
    setCurrentStep(5) // Move to annual report
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="h-8 px-2"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Tillbaka
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bokslut</h1>
            <p className="text-muted-foreground">
              {period?.name || 'Räkenskapsår'} ({period?.period_start} - {period?.period_end})
            </p>
          </div>
          <Badge
            className={
              isCompleted
                ? 'bg-green-100 text-green-800 text-sm px-3 py-1'
                : 'bg-blue-100 text-blue-800 text-sm px-3 py-1'
            }
          >
            {isCompleted ? 'Genomfört' : 'Pågår'}
          </Badge>
        </div>
      </div>

      {/* Step navigation */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {YEAR_END_STEPS.map((s, idx) => {
          const Icon = STEP_ICONS[s.key]
          const isActive = idx === currentStep
          const isDone = isCompleted || idx < currentStep

          return (
            <button
              key={s.key}
              onClick={() => setCurrentStep(idx)}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : isDone
                  ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/50'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isDone && !isActive ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isActive ? (
                  <Icon className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
                <span className="font-medium">{s.label}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Step content */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">{step.label}</h2>
          <p className="text-sm text-muted-foreground">{step.description}</p>
        </div>

        {step.key === 'preparation' && (
          <ChecklistSection
            checklist={checklist}
            closingId={closingId}
            disabled={isCompleted}
            onItemToggle={handleChecklistUpdate}
          />
        )}

        {step.key === 'verification' && period && (
          <TrialBalanceCheck periodId={closing.fiscal_period_id} />
        )}

        {step.key === 'adjustments' && (
          <AdjustmentsStep closing={closing} />
        )}

        {step.key === 'closing' && (
          <ClosingEntryPreview
            closingId={closingId}
            onExecuted={handleClosingExecuted}
          />
        )}

        {step.key === 'opening' && (
          <OpeningBalancesSection
            closingId={closingId}
            isCompleted={isCompleted}
            onCreated={handleOpeningBalancesCreated}
          />
        )}

        {step.key === 'report' && (
          <AnnualReportEditor closingId={closingId} />
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Föregående
        </Button>
        <Button
          onClick={() =>
            setCurrentStep(Math.min(YEAR_END_STEPS.length - 1, currentStep + 1))
          }
          disabled={currentStep === YEAR_END_STEPS.length - 1}
        >
          Nästa
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}

// Adjustments step: shows the checklist items for the adjustments category
function AdjustmentsStep({ closing }: { closing: YearEndClosing }) {
  const checklist = closing.checklist_data as YearEndChecklist
  const adjustmentItems = checklist.items.filter((i) => i.category === 'adjustments')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Justeringar före bokslut</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Gör eventuella justeringar i bokföringen innan du genomför bokslutet.
            Dessa kan inkludera avskrivningar, periodiseringar, obeskattade reserver
            och skatteberäkningar.
          </p>

          <div className="space-y-3">
            {adjustmentItems.map((item) => (
              <div
                key={item.key}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  item.isCompleted
                    ? 'bg-green-50/50 border-green-200 dark:bg-green-950/20'
                    : 'border-border'
                }`}
              >
                <div className="mt-0.5">
                  {item.isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.description}
                  </p>
                  {!item.isCompleted && (
                    <p className="text-xs text-blue-600 mt-1">
                      Gor denna justering i bokforingen (Verifikationer) och
                      markera sedan som klar i checkliststeget.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {adjustmentItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Inga justeringspunkter att visa.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200">
        <CardContent className="py-4">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <strong>Tips:</strong> Gör alla justeringar innan du går vidare till
            bokslutsverifikationen. När bokslutet är genomfört och räkenskapsåret låst
            kan inga fler ändringar göras.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
