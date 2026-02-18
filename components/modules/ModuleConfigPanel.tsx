'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

interface ModuleConfigPanelProps {
  sectorSlug: string
  moduleSlug: string
  children: (props: {
    configs: Record<string, unknown>
    saveConfig: (key: string, value: unknown) => Promise<void>
    saving: boolean
  }) => React.ReactNode
}

export function ModuleConfigPanel({ sectorSlug, moduleSlug, children }: ModuleConfigPanelProps) {
  const [configs, setConfigs] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('module_configs')
        .select('config_key, config_value')
        .eq('user_id', user.id)
        .eq('sector_slug', sectorSlug)
        .eq('module_slug', moduleSlug)

      const map: Record<string, unknown> = {}
      data?.forEach(row => { map[row.config_key] = row.config_value })
      setConfigs(map)
      setLoading(false)
    }
    load()
  }, [sectorSlug, moduleSlug, supabase])

  async function saveConfig(key: string, value: unknown) {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('module_configs').upsert(
      {
        user_id: user.id,
        sector_slug: sectorSlug,
        module_slug: moduleSlug,
        config_key: key,
        config_value: value,
      },
      { onConflict: 'user_id,sector_slug,module_slug,config_key' }
    )
    setConfigs(prev => ({ ...prev, [key]: value }))
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Laddar konfiguration…</span>
      </div>
    )
  }

  return <>{children({ configs, saveConfig, saving })}</>
}
