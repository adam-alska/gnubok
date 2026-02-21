import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getExtensionDefinition } from '@/lib/extensions/sectors'
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

  // Check toggle
  const { data: toggle } = await supabase
    .from('extension_toggles')
    .select('enabled')
    .eq('user_id', user.id)
    .eq('sector_slug', sector)
    .eq('extension_slug', slug)
    .single()

  if (!toggle?.enabled) redirect('/extensions')

  return (
    <ExtensionWorkspaceLoader
      sector={sector}
      slug={slug}
      definition={definition}
      userId={user.id}
    />
  )
}
