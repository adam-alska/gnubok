'use client'

import { Calculator } from 'lucide-react'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'

export default function RotCalculatorWorkspace() {
  return (
    <EmptyExtensionState
      title="ROT-avdragsberäkning"
      description="Beräkning av ROT-avdrag för hantverkstjänster kommer snart. Du kommer kunna beräkna kundens avdrag och generera underlag till Skatteverket."
      icon={<Calculator className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
