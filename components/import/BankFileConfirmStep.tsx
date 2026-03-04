'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Loader2,
  Play,
  FileText,
  Link2,
  Calendar,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { BankFileParseResult } from '@/lib/import/bank-file/types'

interface BankFileConfirmStepProps {
  parseResult: BankFileParseResult
  onExecute: (options: { skip_duplicates: boolean; auto_categorize: boolean }) => void
  onBack: () => void
  isLoading: boolean
}

export default function BankFileConfirmStep({
  parseResult,
  onExecute,
  onBack,
  isLoading,
}: BankFileConfirmStepProps) {
  const { transactions, stats, date_from, date_to } = parseResult
  const refsCount = transactions.filter((t) => t.reference).length

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-6">
        <div className="relative">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Importerar transaktioner...</p>
          <p className="text-sm text-muted-foreground">
            {stats.parsed_rows} transaktioner bearbetas
          </p>
        </div>
        <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Bekräfta import</CardTitle>
          <CardDescription>
            Granska sammanfattningen och importera transaktionerna.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileText className="h-4 w-4" />
                <span className="text-xs">Transaktioner</span>
              </div>
              <p className="text-xl font-bold">{stats.parsed_rows}</p>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="h-4 w-4" />
                <span className="text-xs">Period</span>
              </div>
              <p className="text-sm font-medium">
                {date_from} – {date_to}
              </p>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <span className="text-xs">Inkomster</span>
              </div>
              <p className="text-xl font-bold">
                {formatCurrency(stats.total_income)}
              </p>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <span className="text-xs">Utgifter</span>
              </div>
              <p className="text-xl font-bold">
                {formatCurrency(stats.total_expenses)}
              </p>
            </div>
          </div>

          {/* Additional info */}
          {refsCount > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-blue-600 border-blue-300">
                <Link2 className="mr-1 h-3 w-3" />
                {refsCount} med OCR/referens
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        <Button
          onClick={() => onExecute({
            skip_duplicates: true,
            auto_categorize: false,
          })}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importerar...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Importera {stats.parsed_rows} transaktioner
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
