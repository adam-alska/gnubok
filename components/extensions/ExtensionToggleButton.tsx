'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useExtensionToggle } from '@/lib/extensions/hooks'

export default function ExtensionToggleButton({
  sectorSlug,
  extensionSlug,
  subscriptionNotice,
}: {
  sectorSlug: string
  extensionSlug: string
  subscriptionNotice?: string
}) {
  const { enabled, isLoading, toggle } = useExtensionToggle(sectorSlug, extensionSlug)
  const [showConfirm, setShowConfirm] = useState(false)

  function handleToggle() {
    // Show confirmation dialog when enabling an extension with a subscription notice
    if (!enabled && subscriptionNotice) {
      setShowConfirm(true)
      return
    }
    toggle()
  }

  function handleConfirm() {
    setShowConfirm(false)
    toggle()
  }

  return (
    <>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={isLoading}
        aria-label={enabled ? 'Inaktivera tillägg' : 'Aktivera tillägg'}
      />

      {subscriptionNotice && (
        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Extern prenumeration krävs</DialogTitle>
              <DialogDescription>{subscriptionNotice}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirm(false)}>
                Avbryt
              </Button>
              <Button onClick={handleConfirm}>
                Jag förstår, aktivera
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
