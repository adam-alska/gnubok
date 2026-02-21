'use client'

import { Clock } from 'lucide-react'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'

export default function BillableHoursWorkspace() {
  return (
    <EmptyExtensionState
      title="Debiterbar tid"
      description="Tidsrapportering och uppföljning av debiterbara timmar kommer snart. Du kommer kunna logga tid per kund och projekt."
      icon={<Clock className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
