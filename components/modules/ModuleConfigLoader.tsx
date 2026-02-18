'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getConfigComponent } from '@/lib/modules/config-registry'

interface ModuleConfigLoaderProps {
  sectorSlug: string
  moduleSlug: string
}

export function ModuleConfigLoader({ sectorSlug, moduleSlug }: ModuleConfigLoaderProps) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const ConfigComponent = getConfigComponent(sectorSlug, moduleSlug)

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('module_toggles')
        .select('enabled')
        .eq('user_id', user.id)
        .eq('sector_slug', sectorSlug)
        .eq('module_slug', moduleSlug)
        .maybeSingle()

      setEnabled(data?.enabled ?? false)
      setLoading(false)
    }
    check()
  }, [sectorSlug, moduleSlug, supabase])

  if (loading || !enabled || !ConfigComponent) return null

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">Konfiguration</h2>
      <div className="rounded-xl border border-border bg-card p-6">
        <ConfigComponent sectorSlug={sectorSlug} moduleSlug={moduleSlug} />
      </div>
    </div>
  )
}
