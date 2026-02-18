'use client'

import { useEffect, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'

interface ModuleToggleProps {
  sectorSlug: string
  moduleSlug: string
}

export function ModuleToggle({ sectorSlug, moduleSlug }: ModuleToggleProps) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  useEffect(() => {
    async function fetchToggle() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

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

    fetchToggle()
  }, [sectorSlug, moduleSlug, supabase])

  function handleToggle(checked: boolean) {
    setEnabled(checked)

    startTransition(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('module_toggles')
        .upsert(
          {
            user_id: user.id,
            sector_slug: sectorSlug,
            module_slug: moduleSlug,
            enabled: checked,
          },
          { onConflict: 'user_id,sector_slug,module_slug' }
        )

      // Notify sidebar to refresh its module list
      window.dispatchEvent(new Event('module-toggle-changed'))
    })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Laddar…</span>
      </div>
    )
  }

  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 cursor-pointer transition-colors hover:border-primary/20">
      <div>
        <p className="text-sm font-medium text-foreground">Aktivera modul</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {enabled ? 'Modulen är aktiverad för ditt konto' : 'Aktivera för att använda modulen'}
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={isPending}
      />
    </label>
  )
}
