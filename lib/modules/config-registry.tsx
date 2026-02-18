import type { ComponentType } from 'react'

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
import { RestaurangkontoplanConfig } from '@/components/modules/restaurang/config/RestaurangkontoplanConfig'
import { MomssplitConfig } from '@/components/modules/restaurang/config/MomssplitConfig'
import { DagskassaConfig } from '@/components/modules/restaurang/config/DagskassaConfig'
import { TipsbokforingConfig } from '@/components/modules/restaurang/config/TipsbokforingConfig'
import { PersonalliggareConfig } from '@/components/modules/restaurang/config/PersonalliggareConfig'
import { AlkoholAccisConfig } from '@/components/modules/restaurang/config/AlkoholAccisConfig'
import { RepresentationConfig } from '@/components/modules/restaurang/config/RepresentationConfig'

registerConfig('restaurang', 'restaurangkontoplan', RestaurangkontoplanConfig)
registerConfig('restaurang', 'momssplit-mat-dryck', MomssplitConfig)
registerConfig('restaurang', 'dagskassaavstamning', DagskassaConfig)
registerConfig('restaurang', 'tipsbokforing', TipsbokforingConfig)
registerConfig('restaurang', 'personalliggare', PersonalliggareConfig)
registerConfig('restaurang', 'alkoholpunktskatt', AlkoholAccisConfig)
registerConfig('restaurang', 'representationsbokforing', RepresentationConfig)
