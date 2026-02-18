import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getModuleBySlug } from '@/lib/modules-data'
import { getWorkspaceComponent } from '@/lib/modules/registry'
import { ModulePlaceholder } from '@/components/modules/ModulePlaceholder'

export default async function ModuleWorkspacePage({
  params,
}: {
  params: Promise<{ sector: string; slug: string }>
}) {
  const { sector, slug } = await params
  const result = getModuleBySlug(sector, slug)

  if (!result) {
    notFound()
  }

  const { module: mod } = result

  // Check if module is enabled for this user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: toggle } = await supabase
    .from('module_toggles')
    .select('enabled')
    .eq('user_id', user.id)
    .eq('sector_slug', sector)
    .eq('module_slug', slug)
    .maybeSingle()

  if (!toggle?.enabled) {
    redirect(`/modules/${sector}/${slug}`)
  }

  // Look up workspace component from registry
  const WorkspaceComponent = getWorkspaceComponent(sector, slug)

  const settingsHref = `/modules/${sector}/${slug}`

  if (!WorkspaceComponent) {
    return <ModulePlaceholder module={mod} sectorSlug={sector} />
  }

  return <WorkspaceComponent module={mod} sectorSlug={sector} settingsHref={settingsHref} />
}
