'use client'

import { BedDouble } from 'lucide-react'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'

export default function RevparWorkspace() {
  return (
    <EmptyExtensionState
      title="RevPAR-beräkning"
      description="Beräkning av intäkt per tillgängligt rum (RevPAR) kommer snart. Du kommer kunna följa upp RevPAR per dag, vecka och månad."
      icon={<BedDouble className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
