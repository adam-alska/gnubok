'use client'

import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import type { DepreciationScheduleEntry } from '@/types/fixed-assets'

interface DepreciationScheduleTableProps {
  entries: DepreciationScheduleEntry[]
  isLoading?: boolean
  maxRows?: number
}

function formatPeriod(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const months = [
    'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
    'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
  ]
  return `${months[d.getMonth()]} ${d.getFullYear()}`
}

export function DepreciationScheduleTable({
  entries,
  isLoading = false,
  maxRows,
}: DepreciationScheduleTableProps) {
  const today = new Date().toISOString().split('T')[0]

  const displayEntries = maxRows ? entries.slice(0, maxRows) : entries
  const hasMore = maxRows ? entries.length > maxRows : false

  if (isLoading) {
    return (
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Avskrivning</TableHead>
              <TableHead className="text-right">Ackumulerat</TableHead>
              <TableHead className="text-right">Bokfort varde</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableRow key={i} className="animate-pulse">
                <TableCell><div className="h-4 bg-muted rounded w-28" /></TableCell>
                <TableCell><div className="h-4 bg-muted rounded w-20 ml-auto" /></TableCell>
                <TableCell><div className="h-4 bg-muted rounded w-20 ml-auto" /></TableCell>
                <TableCell><div className="h-4 bg-muted rounded w-20 ml-auto" /></TableCell>
                <TableCell><div className="h-4 bg-muted rounded w-16" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Ingen avskrivningsplan genererad
      </div>
    )
  }

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead className="text-right">Avskrivning</TableHead>
            <TableHead className="text-right">Ackumulerat</TableHead>
            <TableHead className="text-right">Bokfort varde</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayEntries.map((entry) => {
            const isCurrent = entry.period_date.slice(0, 7) === today.slice(0, 7)
            const isPast = entry.period_date < today.slice(0, 8) + '01'

            return (
              <TableRow
                key={entry.id || entry.period_date}
                className={isCurrent ? 'bg-primary/5' : ''}
              >
                <TableCell className="font-medium">
                  {formatPeriod(entry.period_date)}
                  {isCurrent && (
                    <Badge variant="default" className="ml-2 text-xs">
                      Nuvarande
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Number(entry.depreciation_amount))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Number(entry.accumulated_depreciation))}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(Number(entry.book_value))}
                </TableCell>
                <TableCell>
                  {entry.is_posted ? (
                    <Badge variant="success">Bokford</Badge>
                  ) : isPast ? (
                    <Badge variant="warning">Ej bokford</Badge>
                  ) : (
                    <Badge variant="secondary">Planerad</Badge>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {hasMore && (
        <div className="text-center py-3 text-sm text-muted-foreground border-t">
          Visar {maxRows} av {entries.length} poster
        </div>
      )}
    </div>
  )
}
