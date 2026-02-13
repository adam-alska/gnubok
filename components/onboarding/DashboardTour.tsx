'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  PiggyBank,
  AlertTriangle,
  ListTodo,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TourStep {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  highlight?: string // CSS selector or element ID to highlight
  position?: 'top' | 'bottom' | 'center'
}

const TOUR_COMPLETED_KEY = 'influencer_dashboard_tour_completed'

const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Välkommen till din översikt!',
    description:
      'Här ser du hela din ekonomiska situation på ett ställe. Låt oss gå igenom de viktigaste delarna.',
    icon: Sparkles,
    position: 'center',
  },
  {
    id: 'disponibelt',
    title: 'Ditt att spendera',
    description:
      'Detta är vad du faktiskt kan använda efter att vi räknat bort uppskattad skatt och moms. Tänk på det som "säkra pengar".',
    icon: PiggyBank,
    highlight: 'disponibelt-section',
    position: 'bottom',
  },
  {
    id: 'fskatt',
    title: 'F-skatt varning',
    description:
      'Vi jämför din faktiska skatt med vad du betalat in via F-skatt. Om det skiljer sig mycket får du en varning så du kan justera.',
    icon: AlertTriangle,
    highlight: 'fskatt-section',
    position: 'top',
  },
  {
    id: 'att-hantera',
    title: 'Att hantera',
    description:
      'Här samlas saker som behöver din uppmärksamhet: okategoriserade transaktioner, obetalda fakturor, och liknande.',
    icon: ListTodo,
    highlight: 'alerts-section',
    position: 'top',
  },
  {
    id: 'snabbatgarder',
    title: 'Snabbåtgärder',
    description:
      'Skapa fakturor, logga körningar eller skanna kvitton med ett klick. De vanligaste uppgifterna finns alltid nära till hands.',
    icon: Zap,
    highlight: 'quick-actions',
    position: 'top',
  },
]

interface DashboardTourProps {
  onComplete?: () => void
  forceShow?: boolean
}

export default function DashboardTour({ onComplete, forceShow = false }: DashboardTourProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    // Check if tour has been completed
    const completed = localStorage.getItem(TOUR_COMPLETED_KEY)
    if (forceShow || completed !== 'true') {
      // Small delay to let the page render first
      const timer = setTimeout(() => setIsVisible(true), 500)
      return () => clearTimeout(timer)
    }
  }, [forceShow])

  const completeTour = useCallback(() => {
    setIsAnimating(true)
    setTimeout(() => {
      localStorage.setItem(TOUR_COMPLETED_KEY, 'true')
      setIsVisible(false)
      onComplete?.()
    }, 300)
  }, [onComplete])

  const nextStep = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      completeTour()
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const skipTour = () => {
    completeTour()
  }

  if (!isVisible) {
    return null
  }

  const step = tourSteps[currentStep]
  const Icon = step.icon
  const isLastStep = currentStep === tourSteps.length - 1
  const isFirstStep = currentStep === 0

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={cn(
          'fixed inset-0 bg-background/80 backdrop-blur-sm z-50 transition-opacity duration-300',
          isAnimating ? 'opacity-0' : 'opacity-100'
        )}
        onClick={skipTour}
      />

      {/* Tour card */}
      <div
        className={cn(
          'fixed z-50 transition-all duration-300',
          step.position === 'center' && 'inset-0 flex items-center justify-center p-4',
          step.position === 'top' && 'top-4 left-1/2 -translate-x-1/2 w-full max-w-md px-4',
          step.position === 'bottom' && 'bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 w-full max-w-md px-4',
          isAnimating && 'opacity-0 scale-95'
        )}
      >
        <Card className="shadow-2xl border-primary/20">
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Header with icon and close */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{step.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Steg {currentStep + 1} av {tourSteps.length}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 -mr-2 -mt-2"
                  onClick={skipTour}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Stäng guide</span>
                </Button>
              </div>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-1.5 py-2">
                {tourSteps.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentStep(idx)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all',
                      idx === currentStep
                        ? 'bg-primary w-4'
                        : idx < currentStep
                          ? 'bg-primary/40'
                          : 'bg-muted-foreground/20'
                    )}
                  />
                ))}
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={prevStep}
                  disabled={isFirstStep}
                  className={cn(isFirstStep && 'invisible')}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Tillbaka
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={skipTour}
                  className="text-muted-foreground"
                >
                  Hoppa över
                </Button>

                <Button size="sm" onClick={nextStep}>
                  {isLastStep ? (
                    'Kom igång'
                  ) : (
                    <>
                      Nästa
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

/**
 * Hook för att starta om touren
 */
export function useDashboardTour() {
  const resetTour = () => {
    localStorage.removeItem(TOUR_COMPLETED_KEY)
    window.location.reload()
  }

  const isTourCompleted = () => {
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true'
  }

  return { resetTour, isTourCompleted }
}
