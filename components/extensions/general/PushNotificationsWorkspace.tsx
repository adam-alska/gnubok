'use client'

import type { WorkspaceComponentProps } from '@/lib/extensions/workspace-registry'
import EmptyExtensionState from '@/components/extensions/shared/EmptyExtensionState'
import { Bell } from 'lucide-react'

export default function PushNotificationsWorkspace({ userId }: WorkspaceComponentProps) {
  return (
    <EmptyExtensionState
      title="Push-notiser"
      description="Konfigurera push-notiser under Inst\u00e4llningar. Notiser skickas automatiskt vid viktiga h\u00e4ndelser."
      icon={<Bell className="h-12 w-12 text-muted-foreground/40 mb-4" />}
    />
  )
}
