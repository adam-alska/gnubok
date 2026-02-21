'use client'

import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'
import { MessageSquare } from 'lucide-react'

export default function AiChatWorkspace({ userId }: WorkspaceComponentProps) {
  return (
    <EmptyExtensionState
      title="AI-assistent"
      description="Anv\u00e4nd chattwidgeten i nedre h\u00f6gra h\u00f6rnet f\u00f6r att st\u00e4lla fr\u00e5gor om bokf\u00f6ring och skatt."
      icon={<MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
