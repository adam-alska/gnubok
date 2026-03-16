'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Upload, Wand, Plus, CheckSquare, FileText } from 'lucide-react'
import type { ViewMode } from './transaction-types'

interface TransactionStatusBarProps {
  uncategorizedCount: number
  invoiceMatchCount: number
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  onOpenSwipeView: () => void
  onOpenCreateDialog: () => void
  isLoadingSuggestions: boolean
  isBatchMode: boolean
  onToggleBatchMode: () => void
}

export default function TransactionStatusBar({
  uncategorizedCount,
  invoiceMatchCount,
  mode,
  onModeChange,
  onOpenSwipeView,
  onOpenCreateDialog,
  isLoadingSuggestions,
  isBatchMode,
  onToggleBatchMode,
}: TransactionStatusBarProps) {
  return (
    <div className="space-y-4">
      {/* Header with title + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-medium tracking-tight">Transaktioner</h1>
          {uncategorizedCount > 0 && mode === 'inbox' && (
            <p className="text-muted-foreground mt-1">
              <span className="text-foreground font-semibold">{uncategorizedCount}</span> att bokföra
              {invoiceMatchCount > 0 && (
                <span className="ml-2">
                  · <FileText className="inline h-3.5 w-3.5 text-primary" />{' '}
                  <span className="text-foreground font-semibold">{invoiceMatchCount} fakturamatchningar</span>
                </span>
              )}
            </p>
          )}
          {mode === 'history' && (
            <p className="text-muted-foreground">Alla dina transaktioner</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/import">
              <Upload className="mr-2 h-4 w-4" />
              Importera
            </Link>
          </Button>
          {mode === 'inbox' && uncategorizedCount > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSwipeView}
                disabled={isLoadingSuggestions}
              >
                <Wand className="mr-2 h-4 w-4" />
                {isLoadingSuggestions ? 'Laddar...' : 'Gå igenom alla'}
              </Button>
              <Button
                variant={isBatchMode ? 'default' : 'outline'}
                size="sm"
                onClick={onToggleBatchMode}
              >
                <CheckSquare className="mr-2 h-4 w-4" />
                {isBatchMode ? 'Avsluta' : 'Välj flera'}
              </Button>
            </>
          )}
          <Button size="sm" onClick={onOpenCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Ny transaktion
          </Button>
        </div>
      </div>

      {/* Mode toggle - segmented control style */}
      <div className="inline-flex rounded-lg border bg-muted p-1">
        <Button
          variant={mode === 'inbox' ? 'default' : 'ghost'}
          size="sm"
          className="h-8 rounded-md"
          onClick={() => onModeChange('inbox')}
        >
          Att bokföra
          {uncategorizedCount > 0 && (
            <Badge
              variant={mode === 'inbox' ? 'secondary' : 'outline'}
              className="ml-2 text-xs"
            >
              {uncategorizedCount}
            </Badge>
          )}
        </Button>
        <Button
          variant={mode === 'history' ? 'default' : 'ghost'}
          size="sm"
          className="h-8 rounded-md"
          onClick={() => onModeChange('history')}
        >
          Alla transaktioner
        </Button>
      </div>
    </div>
  )
}
