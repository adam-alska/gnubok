'use client'

import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'
import { Sparkles } from 'lucide-react'

export default function AiCategorizationWorkspace({ userId }: WorkspaceComponentProps) {
  return (
    <EmptyExtensionState
      title="AI-kategorisering"
      description="AI-kategorisering k\u00f6rs automatiskt n\u00e4r nya transaktioner synkas. G\u00e5 till Transaktioner f\u00f6r att se f\u00f6rslag."
      icon={<Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
