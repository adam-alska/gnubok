'use client'

import { Layers } from 'lucide-react'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'

export default function ProjectBillingWorkspace() {
  return (
    <EmptyExtensionState
      title="Projektfakturering"
      description="Uppföljning av fakturering per kundprojekt kommer snart. Du kommer kunna koppla tidrapporter till fakturor automatiskt."
      icon={<Layers className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
