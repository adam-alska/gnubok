'use client'

import { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface ModuleDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** Title shown when creating a new item */
  createTitle: string
  /** Title shown when editing an existing item */
  editTitle: string
  /** Description shown when creating a new item */
  createDescription?: string
  /** Description shown when editing an existing item */
  editDescription?: string
  /** Whether we are in edit mode (vs create) */
  isEditing: boolean
  /** Whether the form is currently saving */
  isSaving?: boolean
  /** Whether the save button should be disabled (e.g. form invalid) */
  saveDisabled?: boolean
  /** Label for the save button in create mode (default: "Skapa") */
  createLabel?: string
  /** Label for the save button in edit mode (default: "Uppdatera") */
  editLabel?: string
  /** Called when the user clicks Save */
  onSave: () => void
  /** Called when the user clicks Cancel or closes the dialog */
  onCancel?: () => void
  /** Optional max width class (default: "max-w-lg") */
  maxWidth?: string
  /** The form content (children) */
  children: ReactNode
}

/**
 * Reusable dialog wrapper for module CRUD forms.
 * Provides consistent header, footer (with Cancel + Save), loading state,
 * and edit/create mode switching.
 */
export function ModuleDialog({
  open,
  onOpenChange,
  createTitle,
  editTitle,
  createDescription,
  editDescription,
  isEditing,
  isSaving = false,
  saveDisabled = false,
  createLabel = 'Skapa',
  editLabel = 'Uppdatera',
  onSave,
  onCancel,
  maxWidth = 'max-w-lg',
  children,
}: ModuleDialogProps) {
  function handleCancel() {
    if (onCancel) {
      onCancel()
    } else {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={maxWidth}>
        <DialogHeader>
          <DialogTitle>{isEditing ? editTitle : createTitle}</DialogTitle>
          {(createDescription || editDescription) && (
            <DialogDescription>
              {isEditing ? editDescription : createDescription}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid gap-4 py-2">{children}</div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Avbryt
          </Button>
          <Button onClick={onSave} disabled={isSaving || saveDisabled}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? editLabel : createLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
