'use client'

import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'
import { TextSearch } from 'lucide-react'

export default function UserDescriptionMatchWorkspace({ userId }: WorkspaceComponentProps) {
  return (
    <EmptyExtensionState
      title="Beskrivningsmatchning"
      description="Beskriv transaktioner med egna ord vid kategorisering. Systemet lär sig automatiskt och applicerar på framtida transaktioner från samma leverantör."
      icon={<TextSearch className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
