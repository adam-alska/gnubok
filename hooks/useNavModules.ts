'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildModuleLookupMap, buildSectorLookupMap, type ModuleCategory } from '@/lib/modules-data'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  FileDown,
  Cog,
  BookOpen,
} from 'lucide-react'

// ---------- types ----------

interface EnabledModule {
  sector_slug: string
  module_slug: string
}

export interface SectorModuleItem {
  href: string
  label: string
  icon: LucideIcon
  cat: ModuleCategory
}

export interface SectorGroup {
  name: string
  icon: LucideIcon
  modules: SectorModuleItem[]
}

/** Tuple of [sectorSlug, SectorGroup] */
export type SectorGroupEntry = [string, SectorGroup]

// ---------- constants ----------

const CATEGORY_ICON: Record<ModuleCategory, LucideIcon> = {
  rapport: BarChart3,
  import: FileDown,
  operativ: Cog,
  bokforing: BookOpen,
}

const CATEGORY_ORDER: Record<ModuleCategory, number> = {
  rapport: 0,
  import: 1,
  operativ: 2,
  bokforing: 3,
}

// ---------- pre-built lookup maps (avoids N+1) ----------
// Built once at module load time from the canonical helpers in modules-data

const moduleLookup = buildModuleLookupMap()
const sectorLookup = buildSectorLookupMap()

// ---------- hook ----------

export function useNavModules() {
  const supabase = createClient()
  const [enabledModules, setEnabledModules] = useState<EnabledModule[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchModules = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsLoading(false)
      return
    }

    const { data } = await supabase
      .from('module_toggles')
      .select('sector_slug, module_slug')
      .eq('user_id', user.id)
      .eq('enabled', true)

    // Recovery: if no module_toggles exist, check company_settings for selected_modules
    if (!data || data.length === 0) {
      const { data: cs } = await supabase
        .from('company_settings')
        .select('selected_sector, selected_modules')
        .eq('user_id', user.id)
        .single()

      if (cs?.selected_sector && Array.isArray(cs.selected_modules) && cs.selected_modules.length > 0) {
        const rows = cs.selected_modules.map((slug: string) => ({
          user_id: user.id,
          sector_slug: cs.selected_sector,
          module_slug: slug,
          enabled: true,
        }))
        await supabase
          .from('module_toggles')
          .upsert(rows, { onConflict: 'user_id,sector_slug,module_slug' })

        setEnabledModules(
          rows.map((r: { sector_slug: string; module_slug: string }) => ({
            sector_slug: r.sector_slug,
            module_slug: r.module_slug,
          }))
        )
        setIsLoading(false)
        return
      }
    }

    setEnabledModules(
      (data ?? []).map(t => ({ sector_slug: t.sector_slug, module_slug: t.module_slug }))
    )
    setIsLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchModules()
  }, [fetchModules])

  // Listen for toggle changes from ModuleToggle
  useEffect(() => {
    const handler = () => fetchModules()
    window.addEventListener('module-toggle-changed', handler)
    return () => window.removeEventListener('module-toggle-changed', handler)
  }, [fetchModules])

  // Group enabled modules by sector using pre-built lookup maps (no N+1)
  const sectorGroups: SectorGroupEntry[] = useMemo(() => {
    const groups = new Map<string, SectorGroup>()

    for (const em of enabledModules) {
      const result = moduleLookup.get(`${em.sector_slug}/${em.module_slug}`)
      if (!result) continue

      if (!groups.has(em.sector_slug)) {
        const sector = sectorLookup.get(em.sector_slug)
        if (!sector) continue
        groups.set(em.sector_slug, { name: sector.name, icon: sector.icon, modules: [] })
      }

      groups.get(em.sector_slug)!.modules.push({
        href: `/m/${em.sector_slug}/${em.module_slug}`,
        label: result.module.name,
        icon: CATEGORY_ICON[result.module.cat],
        cat: result.module.cat,
      })
    }

    // Sort modules within each sector by category order
    for (const group of groups.values()) {
      group.modules.sort((a, b) => CATEGORY_ORDER[a.cat] - CATEGORY_ORDER[b.cat])
    }

    return Array.from(groups.entries())
  }, [enabledModules])

  return { sectorGroups, isLoading }
}
