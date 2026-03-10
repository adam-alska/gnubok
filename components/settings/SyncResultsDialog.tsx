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
import type { FortnoxSyncResult, FortnoxResourceSyncResult } from '@/types'

interface SyncResultsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: FortnoxSyncResult | null
}

function ResourceResultRow({ r }: { r: FortnoxResourceSyncResult }) {
  const total = r.created + r.updated + r.skipped
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      {r.success ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
      )}
      <span className="flex-1 truncate">{r.name}</span>
      <div className="flex gap-3 text-xs text-muted-foreground tabular-nums">
        {r.created > 0 && <span className="text-green-600">+{r.created}</span>}
        {r.updated > 0 && <span className="text-blue-600">{r.updated} upd</span>}
        {r.skipped > 0 && <span>{r.skipped} skip</span>}
        {total === 0 && r.success && <span>0</span>}
      </div>
    </div>
  )
}

export function SyncResultsDialog({
  open,
  onOpenChange,
  result,
}: SyncResultsDialogProps) {
  if (!result) return null

  const totalCreated = result.results.reduce((sum, r) => sum + r.created, 0)
  const totalUpdated = result.results.reduce((sum, r) => sum + r.updated, 0)
  const allErrors = result.results.flatMap((r) => r.errors).concat(result.errors)
  const hasSie = result.results.some((r) => r.sieResult)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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
                Import slutförd med fel
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-bold">{totalCreated}</p>
              <p className="text-xs text-muted-foreground">Poster skapade</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-2xl font-bold">{totalUpdated}</p>
              <p className="text-xs text-muted-foreground">Poster uppdaterade</p>
            </div>
          </div>

          {/* Per-resource results */}
          {result.results.length > 0 && (
            <div className="rounded-lg border divide-y">
              <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase">
                Per datatyp
              </div>
              <div className="px-3 py-1">
                {result.results.map((r) => (
                  <ResourceResultRow key={r.dataTypeId} r={r} />
                ))}
              </div>
            </div>
          )}

          {/* Scope mismatch warning */}
          {result.scopeMismatch && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
              <p className="text-sm text-yellow-700 dark:text-yellow-400 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Vissa datatyper hoppades över p.g.a. saknade behörigheter.
              </p>
            </div>
          )}

          {/* Errors */}
          {allErrors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1 max-h-32 overflow-y-auto">
              {allErrors.map((err, i) => (
                <p key={i} className="text-sm text-destructive flex items-start gap-1.5">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Stäng
          </Button>
          {hasSie && result.success && (
            <Button asChild>
              <Link href="/bookkeeping">Visa bokföring</Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
