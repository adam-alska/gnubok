'use client'

import { HandCoins } from 'lucide-react'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'

export default function TipTrackingWorkspace() {
  return (
    <EmptyExtensionState
      title="Dricksuppföljning"
      description="Registrering av dricks per skift kommer snart. Du kommer kunna följa upp dricksfördelning och bokföra det korrekt."
      icon={<HandCoins className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
