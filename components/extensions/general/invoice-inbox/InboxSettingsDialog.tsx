'use client'

import { useState } from 'react'
import type { InvoiceInboxSettings } from '@/extensions/general/invoice-inbox/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Copy, Check } from 'lucide-react'

interface InboxSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: InvoiceInboxSettings
  onSave: (settings: InvoiceInboxSettings) => Promise<void>
}

export default function InboxSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSave,
}: InboxSettingsDialogProps) {
  const [local, setLocal] = useState<InvoiceInboxSettings>(settings)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  // Reset local state when dialog opens with new settings
  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setLocal(settings)
    }
    onOpenChange(isOpen)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(local)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  function handleCopyEmail() {
    if (local.inboxEmail) {
      navigator.clipboard.writeText(local.inboxEmail)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Inställningar</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Automatisk bearbetning</Label>
              <p className="text-xs text-muted-foreground">
                Analysera fakturor automatiskt vid uppladdning
              </p>
            </div>
            <Switch
              checked={local.autoProcessEnabled}
              onCheckedChange={(checked) =>
                setLocal((prev) => ({ ...prev, autoProcessEnabled: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Automatisk leverantörsmatchning</Label>
              <p className="text-xs text-muted-foreground">
                Matcha extraherade uppgifter mot befintliga leverantörer
              </p>
            </div>
            <Switch
              checked={local.autoMatchSupplierEnabled}
              onCheckedChange={(checked) =>
                setLocal((prev) => ({ ...prev, autoMatchSupplierEnabled: checked }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Matchningströskel</Label>
            <p className="text-xs text-muted-foreground">
              Lägsta konfidens för automatisk leverantörsmatchning (0-1)
            </p>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={local.supplierMatchThreshold}
              onChange={(e) =>
                setLocal((prev) => ({
                  ...prev,
                  supplierMatchThreshold: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)),
                }))
              }
            />
          </div>

          {local.inboxEmail && (
            <div className="space-y-2">
              <Label>Inkorg-e-post</Label>
              <p className="text-xs text-muted-foreground">
                Vidarebefodra fakturor till denna adress
              </p>
              <div className="flex gap-2">
                <Input
                  value={local.inboxEmail}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyEmail}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
