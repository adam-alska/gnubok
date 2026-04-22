'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Plus } from 'lucide-react'

export interface ActivateAccountsDialogProps {
  open: boolean
  accountNumbers: string[]
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

interface BasLookupRow {
  account_number: string
  account_name: string | null
  known: boolean
}

export function ActivateAccountsDialog({
  open,
  accountNumbers,
  onConfirm,
  onCancel,
}: ActivateAccountsDialogProps) {
  const [rows, setRows] = useState<BasLookupRow[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || accountNumbers.length === 0) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/bookkeeping/accounts/bas-lookup?numbers=${encodeURIComponent(accountNumbers.join(','))}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return
        setRows((body?.data as BasLookupRow[]) || [])
      })
      .catch(() => {
        if (cancelled) return
        setRows(accountNumbers.map((n) => ({ account_number: n, account_name: null, known: false })))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, accountNumbers])

  const knownRows = rows.filter((r) => r.known)
  const unknownRows = rows.filter((r) => !r.known)
  const canConfirm = knownRows.length > 0 && !submitting

  async function handleConfirm() {
    setSubmitting(true)
    try {
      await onConfirm()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aktivera konton</DialogTitle>
          <DialogDescription>
            {knownRows.length > 0
              ? 'Följande konton behöver aktiveras i din kontoplan innan bokföringen kan slutföras.'
              : 'Inga giltiga BAS-konton att aktivera.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Hämtar kontouppgifter...
            </div>
          )}

          {!loading && knownRows.length > 0 && (
            <ul className="divide-y divide-border rounded-md border">
              {knownRows.map((r) => (
                <li key={r.account_number} className="flex items-baseline gap-3 px-3 py-2">
                  <span className="font-mono text-foreground w-14 shrink-0">{r.account_number}</span>
                  <span className="truncate">{r.account_name}</span>
                </li>
              ))}
            </ul>
          )}

          {!loading && unknownRows.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <p className="font-medium">Okända konton:</p>
              <p className="mt-1 font-mono">{unknownRows.map((r) => r.account_number).join(', ')}</p>
              <p className="mt-1 text-destructive/80">
                Dessa nummer finns inte i BAS-katalogen och kan inte aktiveras automatiskt. Kontrollera inmatningen.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Avbryt
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aktiverar...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Aktivera och bokför
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
