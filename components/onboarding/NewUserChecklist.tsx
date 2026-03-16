'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Check,
  Circle,
  PartyPopper,
  Rocket,
  X,
  FileUp,
  ArrowRight,
  UserPlus,
  Receipt,
  ArrowLeftRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChecklistItem {
  id: string
  label: string
  description: string
  href: string
  completed: boolean
  icon: React.ElementType
}

interface NewUserChecklistProps {
  hasCustomers: boolean
  hasInvoices: boolean
  hasBankConnected: boolean
  hasSIEImport: boolean
  onDismiss?: () => void
  className?: string
}

const CHECKLIST_DISMISSED_KEY = 'erp_checklist_dismissed'
const FRESH_START_KEY = 'erp_onboarding_fresh'

export default function NewUserChecklist({
  hasCustomers,
  hasInvoices,
  hasBankConnected,
  onDismiss,
  className,
}: NewUserChecklistProps) {
  const [isDismissed, setIsDismissed] = useState(true)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(CHECKLIST_DISMISSED_KEY)
    setIsDismissed(dismissed === 'true')

    const freshStart = localStorage.getItem(FRESH_START_KEY)
    if (freshStart === 'true') {
      setShowChecklist(true)
    }
  }, [])

  const handleFreshStart = () => {
    setShowChecklist(true)
    localStorage.setItem(FRESH_START_KEY, 'true')
  }

  const handleDismiss = () => {
    setIsAnimatingOut(true)
    setTimeout(() => {
      localStorage.setItem(CHECKLIST_DISMISSED_KEY, 'true')
      setIsDismissed(true)
      onDismiss?.()
    }, 300)
  }

  const items: ChecklistItem[] = [
    {
      id: 'customer',
      label: 'Lägg till din första kund',
      description: 'Spara kunduppgifter för enkel fakturering',
      href: '/customers/new',
      completed: hasCustomers,
      icon: UserPlus,
    },
    {
      id: 'invoice',
      label: 'Skicka din första faktura',
      description: 'Skapa en professionell faktura på 60 sekunder',
      href: '/invoices/new',
      completed: hasInvoices,
      icon: Receipt,
    },
    {
      id: 'bank',
      label: 'Importera transaktioner',
      description: 'Koppla bank eller ladda upp kontoutdrag',
      href: '/import',
      completed: hasBankConnected,
      icon: ArrowLeftRight,
    },
  ]

  const completedCount = items.filter((item) => item.completed).length
  const progress = (completedCount / items.length) * 100
  const allCompleted = completedCount === items.length

  if (isDismissed) {
    return null
  }

  // Celebration state when all checklist items done
  if (showChecklist && allCompleted && !isAnimatingOut) {
    return (
      <Card className={cn('border-success/50 bg-success/5', className)}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-success/10">
              <PartyPopper className="h-6 w-6 text-success" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-success">Snyggt jobbat!</p>
              <p className="text-sm text-muted-foreground">
                Du har slutfört alla steg. Nu är du redo att köra!
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleDismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Path selection — shown initially
  if (!showChecklist) {
    return (
      <Card
        className={cn(
          'transition-[opacity,transform] duration-300',
          isAnimatingOut && 'opacity-0 scale-95',
          className
        )}
      >
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Välkommen till gnubok</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Hur vill du komma igång?
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Stäng</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Migration path — routes directly to import/migration wizard */}
            <Link
              href="/import"
              className="group text-left p-4 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/[0.02] transition-all duration-150 active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/[0.06] group-hover:bg-primary/[0.1] transition-colors">
                  <FileUp className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium group-hover:text-primary transition-colors">
                    Migrera från annat system
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Flytta bokföring, kunder, leverantörer och fakturor från Fortnox, Visma, Bokio, Björn Lundén eller Briox
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60 mt-0.5 flex-shrink-0 transition-colors" />
              </div>
            </Link>

            {/* Fresh start path */}
            <button
              onClick={handleFreshStart}
              className="group text-left p-4 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/[0.02] transition-all duration-150 active:scale-[0.98]"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted/60 group-hover:bg-primary/[0.06] transition-colors">
                  <Rocket className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium group-hover:text-primary transition-colors">
                    Börja från noll
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Starta din bokföring utan tidigare data — perfekt för nya verksamheter
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60 mt-0.5 flex-shrink-0 transition-colors" />
              </div>
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Fresh start checklist
  return (
    <Card
      className={cn(
        'transition-[opacity,transform] duration-300',
        isAnimatingOut && 'opacity-0 scale-95',
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Kom igång</CardTitle>
            <p className="text-sm text-muted-foreground">
              {completedCount} av {items.length} steg klara
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setShowChecklist(false)
                localStorage.removeItem(FRESH_START_KEY)
              }}
            >
              Byt
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Stäng checklista</span>
            </Button>
          </div>
        </div>
        <Progress value={progress} className="h-1.5 mt-3" />
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.id}>
                {item.completed ? (
                  <div className="flex items-center gap-3 p-2 rounded-lg">
                    <div className="p-1 rounded-full bg-success/10">
                      <Check className="h-3.5 w-3.5 text-success" />
                    </div>
                    <span className="text-sm text-muted-foreground line-through">
                      {item.label}
                    </span>
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    className="group flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <div className="p-1 rounded-full border border-border">
                      <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium group-hover:text-primary transition-colors flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
