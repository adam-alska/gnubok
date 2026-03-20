import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getExtensionDefinition } from '@/lib/extensions/sectors'
import { LEGACY_GENERAL_EXTENSIONS } from '@/lib/extensions/toggle-check'
import ExtensionWorkspaceLoader from '@/components/extensions/ExtensionWorkspaceLoader'

export default async function ExtensionWorkspacePage({
  params,
}: {
  params: Promise<{ sector: string; slug: string }>
}) {
  const { sector, slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const definition = getExtensionDefinition(sector, slug)
  if (!definition) notFound()

  // Check toggle — fall back to legacy list when no toggle row exists
  const { data: toggle } = await supabase
    .from('extension_toggles')
    .select('enabled')
    .eq('user_id', user.id)
    .eq('sector_slug', sector)
    .eq('extension_slug', slug)
    .single()

  const isEnabled = toggle
    ? toggle.enabled
    : sector === 'general' && LEGACY_GENERAL_EXTENSIONS.includes(slug)

  if (!isEnabled) redirect('/extensions')

  return (
    <ExtensionWorkspaceLoader
      sector={sector}
      slug={slug}
      definition={definition}
      userId={user.id}
    />
  )
}
