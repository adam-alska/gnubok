'use client'

import { FolderKanban } from 'lucide-react'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'

export default function ProjectCostWorkspace() {
  return (
    <EmptyExtensionState
      title="Projektkostnadsuppföljning"
      description="Uppföljning av kostnader per byggprojekt kommer snart. Du kommer kunna koppla fakturor och transaktioner till specifika projekt."
      icon={<FolderKanban className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
