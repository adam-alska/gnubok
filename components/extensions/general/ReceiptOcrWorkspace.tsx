'use client'

import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'
import { Camera } from 'lucide-react'

export default function ReceiptOcrWorkspace({ userId }: WorkspaceComponentProps) {
  return (
    <EmptyExtensionState
      title="Kvittoscanning"
      description="Ladda upp och skanna kvitton direkt fr\u00e5n till\u00e4ggets arbetsyta. G\u00e5 till Kvitton i sidomenyn f\u00f6r att komma ig\u00e5ng."
      icon={<Camera className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
