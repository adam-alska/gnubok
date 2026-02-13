'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import PayoutWaterfall from '@/components/shadow-ledger/PayoutWaterfall'
import type { ShadowLedgerEntry, ShadowLedgerEntryType } from '@/types'

interface ShadowLedgerListProps {
  entries: ShadowLedgerEntry[]
  onDelete?: (id: string) => void
  isDeleting?: boolean
}

const TYPE_LABELS: Record<ShadowLedgerEntryType, string> = {
  payout: 'Utbetalning',
  gift: 'G\u00e5va',
  expense: 'Utgift',
  hobby_income: 'Hobbyinkomst',
  hobby_expense: 'Hobbyutgift',
}

const TYPE_BADGE_VARIANT: Record<
  ShadowLedgerEntryType,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  payout: 'default',
  gift: 'warning',
  expense: 'destructive',
  hobby_income: 'success',
  hobby_expense: 'secondary',
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function ShadowLedgerList({
  entries,
  onDelete,
  isDeleting,
}: ShadowLedgerListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Inga poster hittades.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const isExpanded = expandedId === entry.id
        const isPayout = entry.type === 'payout'

        return (
          <Card key={entry.id}>
            <CardContent className="p-0">
              {/* Collapsed row */}
              <button
                type="button"
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/30"
                onClick={() => toggle(entry.id)}
              >
                {/* Date */}
                <span className="shrink-0 text-sm text-muted-foreground w-24">
                  {formatDateShort(entry.date)}
                </span>

                {/* Type badge */}
                <Badge
                  variant={TYPE_BADGE_VARIANT[entry.type]}
                  className="shrink-0"
                >
                  {TYPE_LABELS[entry.type]}
                </Badge>

                {/* Description */}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {entry.description || entry.provider || '\u2014'}
                </span>

                {/* Amounts */}
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatCurrency(entry.gross_amount)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  &rarr;
                </span>
                <span
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    entry.net_amount < entry.gross_amount
                      ? 'text-sky-600'
                      : 'text-foreground'
                  )}
                >
                  {formatCurrency(entry.net_amount)}
                </span>

                {/* Expand icon */}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t px-4 pb-4 pt-3 space-y-4">
                  {/* Waterfall (only for payouts with gross > 0) */}
                  {isPayout && entry.gross_amount > 0 && (
                    <PayoutWaterfall
                      grossAmount={entry.gross_amount}
                      platformFee={entry.platform_fee}
                      serviceFee={entry.service_fee}
                      pensionDeduction={entry.pension_deduction}
                      socialFees={entry.social_fees}
                      incomeTaxWithheld={entry.income_tax_withheld}
                      netAmount={entry.net_amount}
                    />
                  )}

                  {/* Metadata grid */}
                  <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {entry.provider && (
                      <div>
                        <span className="text-muted-foreground">Leverant\u00f6r: </span>
                        <span className="font-medium">{entry.provider}</span>
                      </div>
                    )}
                    {entry.campaign_id && (
                      <div>
                        <span className="text-muted-foreground">Kampanj: </span>
                        <span className="font-medium">{entry.campaign_id}</span>
                      </div>
                    )}
                    {entry.virtual_tax_debt > 0 && (
                      <div>
                        <span className="text-muted-foreground">
                          Virtuell skatteskuld:{' '}
                        </span>
                        <span className="font-medium text-destructive">
                          {formatCurrency(entry.virtual_tax_debt)}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">K\u00e4lla: </span>
                      <span className="font-medium capitalize">{entry.source}</span>
                    </div>
                  </div>

                  {/* Delete button */}
                  {onDelete && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={isDeleting}
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(entry.id)
                        }}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Ta bort
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
