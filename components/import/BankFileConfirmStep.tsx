'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft,
  Loader2,
  Play,
  FileText,
  AlertTriangle,
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
  const [skipDuplicates, setSkipDuplicates] = useState(true)

  const { transactions, stats, date_from, date_to, format_name } = parseResult
  const refsCount = transactions.filter((t) => t.reference).length

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
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <span className="text-xs">Inkomster</span>
              </div>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(stats.total_income)}
              </p>
            </div>

            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <span className="text-xs">Utgifter</span>
              </div>
              <p className="text-xl font-bold text-red-600">
                {formatCurrency(stats.total_expenses)}
              </p>
            </div>
          </div>

          {/* Additional info */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Format: {format_name}</Badge>
            {refsCount > 0 && (
              <Badge variant="outline" className="text-blue-600 border-blue-300">
                <Link2 className="mr-1 h-3 w-3" />
                {refsCount} med OCR/referens
              </Badge>
            )}
          </div>

          {/* Options */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-medium">Importinställningar</h3>

            <div className="flex items-center space-x-3">
              <Checkbox
                id="skip-duplicates"
                checked={skipDuplicates}
                onCheckedChange={(checked) => setSkipDuplicates(checked === true)}
              />
              <div>
                <Label htmlFor="skip-duplicates" className="text-sm font-medium cursor-pointer">
                  Hoppa över dubletter
                </Label>
                <p className="text-xs text-muted-foreground">
                  Transaktioner som redan finns i systemet importeras inte igen
                </p>
              </div>
            </div>

          </div>

          {/* Warning note */}
          <div className="flex gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Importerade transaktioner visas som &quot;obokförda&quot; på
              transaktionssidan. Du kan bokföra dem manuellt efteråt.
            </p>
          </div>
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
            skip_duplicates: skipDuplicates,
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
