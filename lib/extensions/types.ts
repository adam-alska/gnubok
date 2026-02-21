import type { CoreEventType } from '@/lib/events/types'
import type { EntityType } from '@/types'

// ============================================================
// Extension Marketplace Types
// ============================================================

/** Extension category for marketplace grouping */
export type ExtensionCategory = 'accounting' | 'reports' | 'import' | 'operations'

/** Sector slugs for extension organization */
export type SectorSlug = 'general' | 'restaurant' | 'construction' | 'hotel' | 'tech' | 'ecommerce'

/** How an extension gets its data */
export type ExtensionDataPattern = 'core' | 'manual' | 'both'

/** Extension metadata for the marketplace and workspace routing */
export interface ExtensionDefinition {
  slug: string
  name: string
  sector: SectorSlug
  category: ExtensionCategory
  description: string
  longDescription: string
  icon: string
  entityTypes?: EntityType[]
  dataPattern: ExtensionDataPattern
  readsCoreTables?: string[]
  hasOwnData?: boolean
}

/** Sector definition with its extensions */
export interface Sector {
  slug: SectorSlug
  name: string
  icon: string
  description: string
  extensions: ExtensionDefinition[]
}

/** Database row for extension toggle state */
export interface ExtensionToggle {
  id: string
  user_id: string
  sector_slug: string
  extension_slug: string
  enabled: boolean
  created_at: string
  updated_at: string
}

// ============================================================
// Extension Interface & Supporting Types
// ============================================================

/** A route exposed by an extension (page route) */
export interface RouteDefinition {
  path: string
  label: string
}

/** An API route exposed by an extension */
export interface ApiRouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path: string
  handler: (request: Request) => Promise<Response>
}

/** Sidebar navigation item added by an extension */
export interface SidebarItem {
  label: string
  icon?: string
  path: string
  order?: number
}

/** Report type added by an extension */
export interface ReportDefinition {
  id: string
  name: string
  description: string
}

/** Settings panel exposed by an extension */
export interface SettingsPanelDefinition {
  label: string
  path: string
}

/** Tax code definition added by an extension */
export interface TaxCodeDefinition {
  code: string
  rate: number
  description: string
}

/** Dimension type definition added by an extension */
export interface DimensionDefinition {
  id: string
  name: string
  description: string
}

/** Mapping rule type added by an extension */
export interface MappingRuleTypeDefinition {
  id: string
  name: string
  description: string
}

/** Event handler registration for an extension */
export interface ExtensionEventHandler {
  eventType: CoreEventType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (payload: any) => Promise<void> | void
}

/** Context passed to extension lifecycle hooks */
export interface ExtensionContext {
  userId: string
  extensionId: string
}

/**
 * Extension interface — the contract for all add-ons.
 *
 * Extensions declare what they provide (routes, event handlers, sidebar items, etc.)
 * and the registry wires them into the system.
 */
export interface Extension {
  id: string
  name: string
  version: string

  // Surfaces
  routes?: RouteDefinition[]
  apiRoutes?: ApiRouteDefinition[]
  sidebarItems?: SidebarItem[]
  eventHandlers?: ExtensionEventHandler[]
  mappingRuleTypes?: MappingRuleTypeDefinition[]
  reportTypes?: ReportDefinition[]
  settingsPanel?: SettingsPanelDefinition
  taxCodes?: TaxCodeDefinition[]
  dimensionTypes?: DimensionDefinition[]

  // Lifecycle hooks
  onInstall?(ctx: ExtensionContext): Promise<void>
  onUninstall?(ctx: ExtensionContext): Promise<void>
}
