'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AI_DATA_DISCLOSURES, type AiExtensionId } from '@/lib/extensions/ai-consent'
import Link from 'next/link'

interface AiConsentDialogProps {
  extensionId: AiExtensionId
  open: boolean
  onOpenChange: (open: boolean) => void
  onConsented: () => void
}

export function AiConsentDialog({
  extensionId,
  open,
  onOpenChange,
  onConsented,
}: AiConsentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const disclosure = AI_DATA_DISCLOSURES[extensionId]

  async function handleAccept() {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/ai-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extension_id: extensionId }),
      })

      if (res.ok) {
        onOpenChange(false)
        onConsented()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI-samtycke krävs</DialogTitle>
          <DialogDescription>
            Denna funktion använder AI-tjänster från externa leverantörer.
            Granska informationen nedan innan du fortsätter.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <p className="text-sm font-medium mb-1">Leverantör</p>
            <p className="text-sm text-muted-foreground">{disclosure.provider}</p>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Data som skickas</p>
            <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
              {disclosure.dataTypes.map((dt) => (
                <li key={dt}>{dt}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Syfte</p>
            <p className="text-sm text-muted-foreground">{disclosure.purpose}</p>
          </div>

          <p className="text-xs text-muted-foreground">
            Läs mer i vår{' '}
            <Link href="/privacy" className="underline underline-offset-4" target="_blank">
              integritetspolicy
            </Link>
            . Du kan när som helst återkalla ditt samtycke i inställningarna.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Avbryt
          </Button>
          <Button onClick={handleAccept} disabled={isSubmitting}>
            {isSubmitting ? 'Sparar...' : 'Jag samtycker'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
