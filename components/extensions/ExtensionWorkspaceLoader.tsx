'use client'

import type { ExtensionDefinition } from '@/lib/extensions/types'
import { getWorkspaceComponent } from '@/lib/extensions/workspace-registry'
import ExtensionWorkspaceShell from './ExtensionWorkspaceShell'
import EmptyExtensionState from './shared/EmptyExtensionState'

export default function ExtensionWorkspaceLoader({
  sector,
  slug,
  definition,
  userId,
}: {
  sector: string
  slug: string
  definition: ExtensionDefinition
  userId: string
}) {
  const WorkspaceComponent = getWorkspaceComponent(sector, slug)

  return (
    <ExtensionWorkspaceShell definition={definition}>
      {WorkspaceComponent ? (
        <WorkspaceComponent userId={userId} />
      ) : (
        <EmptyExtensionState
          title="Kommer snart"
          description={`${definition.name} \u00e4r under utveckling och kommer snart att vara tillg\u00e4ngligt.`}
        />
      )}
    </ExtensionWorkspaceShell>
  )
}
