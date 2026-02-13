'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Receipt,
  Users,
  ArrowLeftRight,
  Camera,
  Gift,
  Megaphone,
  Building2,
  FileText,
  Calendar,
  Plus,
  type LucideIcon,
} from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  secondaryActionLabel?: string
  secondaryActionHref?: string
  className?: string
  children?: React.ReactNode
}

/**
 * EmptyState - Visar ett vänligt meddelande när det inte finns någon data
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  secondaryActionLabel,
  secondaryActionHref,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      {Icon && (
        <div className="relative mb-6">
          {/* Background pattern */}
          <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-br from-secondary/60 to-muted/30 blur-xl" />
          {/* Icon container */}
          <div className="relative p-5 rounded-full bg-gradient-to-br from-muted/80 to-secondary/50 ring-1 ring-border/20">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
      )}
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6 text-balance">{description}</p>

      {(actionLabel || children) && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {actionHref && actionLabel && (
            <Link href={actionHref}>
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                <Plus className="mr-2 h-4 w-4" />
                {actionLabel}
              </Button>
            </Link>
          )}
          {onAction && actionLabel && (
            <Button onClick={onAction} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              <Plus className="mr-2 h-4 w-4" />
              {actionLabel}
            </Button>
          )}
          {secondaryActionHref && secondaryActionLabel && (
            <Link href={secondaryActionHref}>
              <Button variant="outline">{secondaryActionLabel}</Button>
            </Link>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

// Förkonfigurerade tomma tillstånd för vanliga sidor

export function EmptyInvoices() {
  return (
    <EmptyState
      icon={Receipt}
      title="Inga fakturor ännu"
      description="Skapa din första faktura på under 60 sekunder. Vi fyller i dina uppgifter automatiskt."
      actionLabel="Skapa faktura"
      actionHref="/invoices/new"
      secondaryActionLabel="Lägg till kund först"
      secondaryActionHref="/customers/new"
    />
  )
}

export function EmptyCustomers() {
  return (
    <EmptyState
      icon={Users}
      title="Inga kunder ännu"
      description="Lägg till dina kunder för att enkelt skapa fakturor och hålla koll på betalningar."
      actionLabel="Lägg till kund"
      actionHref="/customers/new"
    />
  )
}

export function EmptyTransactions() {
  return (
    <EmptyState
      icon={ArrowLeftRight}
      title="Inga transaktioner"
      description="Koppla din bank för att automatiskt importera transaktioner, eller lägg till dem manuellt."
      actionLabel="Koppla bank"
      actionHref="/import"
      secondaryActionLabel="Lägg till manuellt"
      secondaryActionHref="/transactions/new"
    />
  )
}

export function EmptyReceipts() {
  return (
    <EmptyState
      icon={Camera}
      title="Inga kvitton"
      description="Ta en bild på ett kvitto för automatisk avläsning och kategorisering. Vi sköter resten!"
      actionLabel="Skanna kvitto"
      actionHref="/receipts/scan"
    />
  )
}

export function EmptyGifts() {
  return (
    <EmptyState
      icon={Gift}
      title="Inga gåvor registrerade"
      description="Fått produkter från varumärken? Registrera dem här för korrekt skattehantering."
      actionLabel="Registrera gåva"
      actionHref="/gifts/new"
    />
  )
}

export function EmptyCampaigns() {
  return (
    <EmptyState
      icon={Megaphone}
      title="Inga samarbeten"
      description="Skapa samarbeten för att hålla koll på innehåll, deadlines och fakturering."
      actionLabel="Skapa samarbete"
      actionHref="/campaigns/new"
      secondaryActionLabel="Importera avtal"
      secondaryActionHref="/campaigns/import"
    />
  )
}

export function EmptyDeadlines() {
  return (
    <EmptyState
      icon={Calendar}
      title="Inga kommande deadlines"
      description="Bra jobbat! Du har inga omedelbara deadlines att ta hand om."
    />
  )
}

export function NoBankConnected() {
  return (
    <EmptyState
      icon={Building2}
      title="Ingen bank kopplad"
      description="Koppla din bank för att automatiskt importera transaktioner och få bättre koll på ekonomin."
      actionLabel="Koppla bank"
      actionHref="/import"
    />
  )
}

export function EmptyReports() {
  return (
    <EmptyState
      icon={FileText}
      title="Inga rapporter tillgängliga"
      description="Rapporter genereras automatiskt när du har tillräckligt med data. Börja med att skapa fakturor eller importera transaktioner."
      actionLabel="Skapa faktura"
      actionHref="/invoices/new"
      secondaryActionLabel="Importera transaktioner"
      secondaryActionHref="/import"
    />
  )
}
