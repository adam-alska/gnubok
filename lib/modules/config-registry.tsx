import type { ComponentType } from 'react'
import dynamic from 'next/dynamic'
import { ModuleLoadingSkeleton } from '@/components/modules/shared/ModuleLoadingSkeleton'

export interface ModuleConfigProps {
  sectorSlug: string
  moduleSlug: string
}

type ConfigComponent = ComponentType<ModuleConfigProps>

const configRegistry: Record<string, ConfigComponent> = {}

export function registerConfig(sector: string, slug: string, component: ConfigComponent) {
  configRegistry[`${sector}/${slug}`] = component
}

export function getConfigComponent(sector: string, slug: string): ConfigComponent | null {
  return configRegistry[`${sector}/${slug}`] ?? null
}


// ── Restaurang: Bokföring config panels ──
registerConfig('restaurang', 'restaurangkontoplan',
  dynamic(() => import('@/components/modules/restaurang/config/RestaurangkontoplanConfig').then(m => m.RestaurangkontoplanConfig), { loading: () => <ModuleLoadingSkeleton /> })
)
registerConfig('restaurang', 'momssplit-mat-dryck',
  dynamic(() => import('@/components/modules/restaurang/config/MomssplitConfig').then(m => m.MomssplitConfig), { loading: () => <ModuleLoadingSkeleton /> })
)
registerConfig('restaurang', 'dagskassaavstamning',
  dynamic(() => import('@/components/modules/restaurang/config/DagskassaConfig').then(m => m.DagskassaConfig), { loading: () => <ModuleLoadingSkeleton /> })
)
registerConfig('restaurang', 'tipsbokforing',
  dynamic(() => import('@/components/modules/restaurang/config/TipsbokforingConfig').then(m => m.TipsbokforingConfig), { loading: () => <ModuleLoadingSkeleton /> })
)
registerConfig('restaurang', 'personalliggare',
  dynamic(() => import('@/components/modules/restaurang/config/PersonalliggareConfig').then(m => m.PersonalliggareConfig), { loading: () => <ModuleLoadingSkeleton /> })
)
registerConfig('restaurang', 'alkoholpunktskatt',
  dynamic(() => import('@/components/modules/restaurang/config/AlkoholAccisConfig').then(m => m.AlkoholAccisConfig), { loading: () => <ModuleLoadingSkeleton /> })
)
registerConfig('restaurang', 'representationsbokforing',
  dynamic(() => import('@/components/modules/restaurang/config/RepresentationConfig').then(m => m.RepresentationConfig), { loading: () => <ModuleLoadingSkeleton /> })
)
