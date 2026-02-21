'use client'

import { DoorOpen } from 'lucide-react'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'

export default function OccupancyWorkspace() {
  return (
    <EmptyExtensionState
      title="Beläggningsgrad"
      description="Uppföljning av rumsbeläggning kommer snart. Du kommer kunna registrera beläggning och se trender över tid."
      icon={<DoorOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
