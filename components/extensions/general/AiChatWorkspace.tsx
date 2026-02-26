'use client'

import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'
import { MessageSquare } from 'lucide-react'

export default function AiChatWorkspace({ userId }: WorkspaceComponentProps) {
  return (
    <EmptyExtensionState
      title="AI-assistent"
      description="Använd chattwidgeten i nedre högra hörnet för att ställa frågor om bokföring och skatt."
      icon={<MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
