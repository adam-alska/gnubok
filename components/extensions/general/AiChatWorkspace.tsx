'use client'

import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import { ChatPanel } from '@/components/chat/ChatPanel'

export default function AiChatWorkspace({ userId }: WorkspaceComponentProps) {
  return (
    <div className="h-[calc(100vh-10rem)] max-w-4xl mx-auto">
      <ChatPanel className="h-full rounded-lg border border-border bg-background shadow-sm" />
    </div>
  )
}
