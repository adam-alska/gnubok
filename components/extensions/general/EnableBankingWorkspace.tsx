'use client'

import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'
import { Landmark } from 'lucide-react'

export default function EnableBankingWorkspace({ userId }: WorkspaceComponentProps) {
  return (
    <EmptyExtensionState
      title="Bankintegration (PSD2)"
      description="Koppla ditt bankkonto under Inst\u00e4llningar f\u00f6r att synka transaktioner automatiskt."
      icon={<Landmark className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
