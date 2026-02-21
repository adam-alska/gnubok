'use client'

import { Switch } from '@/components/ui/switch'
import { useExtensionToggle } from '@/lib/extensions/hooks'

export default function ExtensionToggleButton({
  sectorSlug,
  extensionSlug,
}: {
  sectorSlug: string
  extensionSlug: string
}) {
  const { enabled, isLoading, toggle } = useExtensionToggle(sectorSlug, extensionSlug)

  return (
    <Switch
      checked={enabled}
      onCheckedChange={toggle}
      disabled={isLoading}
      aria-label={enabled ? 'Inaktivera tillägg' : 'Aktivera tillägg'}
    />
  )
}
