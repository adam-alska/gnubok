'use client'

import { BarChart3 } from 'lucide-react'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'

export default function MultichannelRevenueWorkspace() {
  return (
    <EmptyExtensionState
      title="Flerkanalintäkter"
      description="Uppföljning av intäkter per försäljningskanal kommer snart. Du kommer kunna jämföra prestanda mellan webshop, marknadsplatser och fysisk butik."
      icon={<BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
