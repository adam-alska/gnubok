'use client'

import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'
import { Wand } from 'lucide-react'

export default function AiCategorizationWorkspace({ userId }: WorkspaceComponentProps) {
  return (
    <EmptyExtensionState
      title="AI-kategorisering"
      description="AI-kategorisering körs automatiskt när nya transaktioner synkas. Gå till Transaktioner för att se förslag."
      icon={<Wand className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
