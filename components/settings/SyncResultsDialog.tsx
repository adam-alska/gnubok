'use client'

import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import type { SIESyncResult } from '@/types'

interface SyncResultsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: SIESyncResult | null
}

export function SyncResultsDialog({
  open,
  onOpenChange,
  result,
}: SyncResultsDialogProps) {
  if (!result) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result.success ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Import slutförd
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                Import misslyckades
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {result.companyName && (
            <p className="text-sm text-muted-foreground">
              Företag: <span className="font-medium text-foreground">{result.companyName}</span>
            </p>
          )}

          {result.fiscalYearStart && result.fiscalYearEnd && (
            <p className="text-sm text-muted-foreground">
              Räkenskapsår: {result.fiscalYearStart} — {result.fiscalYearEnd}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-bold">{result.journalEntriesCreated}</p>
              <p className="text-xs text-muted-foreground">Verifikationer skapade</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-bold">{result.accountsActivated}</p>
              <p className="text-xs text-muted-foreground">Konton aktiverade</p>
            </div>
          </div>

          {result.openingBalanceCreated && (
            <p className="text-sm text-green-600">
              <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
              Ingående balans importerad
            </p>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
              {result.errors.map((err, i) => (
                <p key={i} className="text-sm text-destructive flex items-start gap-1.5">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {err}
                </p>
              ))}
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-1">
              {result.warnings.map((warn, i) => (
                <p key={i} className="text-sm text-yellow-700 dark:text-yellow-400 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {warn}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Stäng
          </Button>
          {result.success && (
            <Button asChild>
              <Link href="/bookkeeping">Visa bokföring</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
