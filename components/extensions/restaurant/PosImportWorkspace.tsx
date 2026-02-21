'use client'

import { Receipt } from 'lucide-react'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'

export default function PosImportWorkspace() {
  return (
    <EmptyExtensionState
      title="Kassa Z-rapport import"
      description="Stöd för import av Z-rapporter kommer snart. Du kommer kunna importera dagliga kassarapporter direkt från ditt kassasystem."
      icon={<Receipt className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
