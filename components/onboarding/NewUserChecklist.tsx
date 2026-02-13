'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Check,
  Circle,
  Users,
  Receipt,
  Building2,
  Camera,
  Sparkles,
  X,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChecklistItem {
  id: string
  label: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  completed: boolean
}

interface NewUserChecklistProps {
  hasCustomers: boolean
  hasInvoices: boolean
  hasBankConnected: boolean
  hasReceipts: boolean
  onDismiss?: () => void
  className?: string
}

const CHECKLIST_DISMISSED_KEY = 'erp_checklist_dismissed'

export default function NewUserChecklist({
  hasCustomers,
  hasInvoices,
  hasBankConnected,
  hasReceipts,
  onDismiss,
  className,
}: NewUserChecklistProps) {
  const [isDismissed, setIsDismissed] = useState(true) // Start hidden until we check localStorage
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  useEffect(() => {
    // Check if checklist has been dismissed
    const dismissed = localStorage.getItem(CHECKLIST_DISMISSED_KEY)
    setIsDismissed(dismissed === 'true')
  }, [])

  const items: ChecklistItem[] = [
    {
      id: 'account',
      label: 'Skapa konto',
      description: 'Du har ett konto!',
      href: '#',
      icon: Check,
      completed: true, // Always completed if they're seeing this
    },
    {
      id: 'customer',
      label: 'Lägg till din första kund',
      description: 'Spara kunduppgifter för enkel fakturering',
      href: '/customers/new',
      icon: Users,
      completed: hasCustomers,
    },
    {
      id: 'invoice',
      label: 'Skicka din första faktura',
      description: 'Skapa en professionell faktura på 60 sekunder',
      href: '/invoices/new',
      icon: Receipt,
      completed: hasInvoices,
    },
    {
      id: 'bank',
      label: 'Koppla bank',
      description: 'Se transaktioner automatiskt (valfritt)',
      href: '/import',
      icon: Building2,
      completed: hasBankConnected,
    },
    {
      id: 'receipt',
      label: 'Skanna ditt första kvitto',
      description: 'Fotografera för automatisk bokföring',
      href: '/receipts/scan',
      icon: Camera,
      completed: hasReceipts,
    },
  ]

  const completedCount = items.filter((item) => item.completed).length
  const progress = (completedCount / items.length) * 100
  const allCompleted = completedCount === items.length

  const handleDismiss = () => {
    setIsAnimatingOut(true)
    setTimeout(() => {
      localStorage.setItem(CHECKLIST_DISMISSED_KEY, 'true')
      setIsDismissed(true)
      onDismiss?.()
    }, 300)
  }

  // Don't show if dismissed or all completed
  if (isDismissed) {
    return null
  }

  // Auto-dismiss after all completed with celebration
  if (allCompleted && !isAnimatingOut) {
    return (
      <Card className={cn('border-success/50 bg-success/5', className)}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-success/10">
              <Sparkles className="h-6 w-6 text-success" />
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

  return (
    <Card
      className={cn(
        'transition-all duration-300',
        isAnimatingOut && 'opacity-0 scale-95',
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Kom igång</CardTitle>
              <p className="text-sm text-muted-foreground">
                {completedCount} av {items.length} steg klara
              </p>
            </div>
          </div>
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
                      <p className="text-sm font-medium group-hover:text-primary transition-colors">
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
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
