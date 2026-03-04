'use client'

import { Badge } from '@/components/ui/badge'
import { AccountNumber } from '@/components/ui/account-number'
import { CheckCircle2, Paperclip } from 'lucide-react'

interface ReviewLine {
  account_number: string
  debit_amount: string
  credit_amount: string
  line_description: string
}

interface JournalEntryReviewContentProps {
  periodName: string
  entryDate: string
  description: string
  lines: ReviewLine[]
  totalDebit: number
  totalCredit: number
  attachmentCount?: number
  showBalanceBadge?: boolean
  hideDate?: boolean
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function JournalEntryReviewContent({
  periodName,
  entryDate,
  description,
  lines,
  totalDebit,
  totalCredit,
  attachmentCount,
  showBalanceBadge = true,
  hideDate = false,
}: JournalEntryReviewContentProps) {
  const activeLines = lines.filter(
    (l) => l.account_number && (l.debit_amount || l.credit_amount)
  )

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="bg-muted rounded-lg p-4 space-y-2">
        <div className={`grid gap-4 text-sm ${hideDate ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div>
            <span className="text-muted-foreground">Räkenskapsår</span>
            <p className="font-medium">{periodName}</p>
          </div>
          {!hideDate && (
            <div>
              <span className="text-muted-foreground">Datum</span>
              <p className="font-medium">{entryDate}</p>
            </div>
          )}
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">Beskrivning</span>
          <p className="font-medium">{description}</p>
        </div>
      </div>

      {/* Balance status */}
      {(showBalanceBadge || (attachmentCount != null && attachmentCount > 0)) && (
        <div className="flex items-center gap-2">
          {showBalanceBadge && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Debet = Kredit
            </Badge>
          )}
          {attachmentCount != null && attachmentCount > 0 && (
            <Badge variant="outline">
              <Paperclip className="h-3 w-3 mr-1" />
              {attachmentCount} {attachmentCount === 1 ? 'underlag' : 'underlag'}
            </Badge>
          )}
        </div>
      )}

      {/* Debit/Credit table */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 w-24">Konto</th>
            <th className="py-2">Beskrivning</th>
            <th className="py-2 w-28 text-right">Debet</th>
            <th className="py-2 w-28 text-right">Kredit</th>
          </tr>
        </thead>
        <tbody>
          {activeLines.map((line, index) => (
            <tr key={index} className="border-b last:border-0">
              <td className="py-2">
                <AccountNumber number={line.account_number} />
              </td>
              <td className="py-2 text-muted-foreground">
                {line.line_description || ''}
              </td>
              <td className="py-2 text-right">
                {parseFloat(line.debit_amount) > 0
                  ? formatAmount(parseFloat(line.debit_amount))
                  : ''}
              </td>
              <td className="py-2 text-right">
                {parseFloat(line.credit_amount) > 0
                  ? formatAmount(parseFloat(line.credit_amount))
                  : ''}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold border-t-2">
            <td colSpan={2} className="py-2">Summa</td>
            <td className="py-2 text-right text-green-600">{formatAmount(totalDebit)}</td>
            <td className="py-2 text-right text-green-600">{formatAmount(totalCredit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
