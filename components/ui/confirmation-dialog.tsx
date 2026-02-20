'use client'

import { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ClipboardCheck, Loader2, AlertTriangle } from 'lucide-react'

interface ConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isSubmitting: boolean
  title: string
  warningText?: string
  confirmLabel?: string
  children: ReactNode
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
  title,
  warningText = 'En verifikation skapas och kan inte ändras efteråt.',
  confirmLabel = 'Bekräfta & skapa',
  children,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-t-2 border-primary p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">{title}</DialogTitle>
              <DialogDescription>Granska uppgifterna innan du bekräftar</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[70vh] px-6 pb-4">
          {children}
        </div>

        <div className="border-t px-6 py-4 space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-300">{warningText}</p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Tillbaka
            </Button>
            <Button onClick={onConfirm} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Skapar...
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
