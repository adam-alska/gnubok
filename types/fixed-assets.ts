// =============================================================================
// Fixed Assets Register Types (Anläggningsregister)
// =============================================================================

export type DepreciationMethod = 'straight_line' | 'declining_balance' | 'units_of_production'

export type AssetStatus = 'active' | 'fully_depreciated' | 'disposed' | 'sold' | 'written_off'

export type DisposalType = 'sold' | 'scrapped' | 'written_off'

// --- Asset Category ---

export interface AssetCategory {
  id: string
  user_id: string
  code: string
  name: string
  asset_account: string
  depreciation_account: string
  expense_account: string
  default_useful_life_months: number | null
  default_depreciation_method: DepreciationMethod
  is_system: boolean
  created_at: string
}

// --- Asset ---

export interface Asset {
  id: string
  user_id: string
  asset_number: string
  name: string
  description: string | null
  category_id: string | null
  acquisition_date: string
  acquisition_cost: number
  residual_value: number
  useful_life_months: number
  depreciation_method: DepreciationMethod
  declining_balance_rate: number | null
  status: AssetStatus
  location: string | null
  serial_number: string | null
  supplier_name: string | null
  warranty_expires: string | null
  disposed_at: string | null
  disposal_amount: number | null
  disposal_journal_entry_id: string | null
  notes: string | null
  cost_center_id: string | null
  project_id: string | null
  created_at: string
  updated_at: string
  // Relations (populated when fetched)
  category?: AssetCategory
}

// --- Depreciation Schedule Entry ---

export interface DepreciationScheduleEntry {
  id: string
  asset_id: string
  period_date: string
  depreciation_amount: number
  accumulated_depreciation: number
  book_value: number
  journal_entry_id: string | null
  is_posted: boolean
  created_at: string
}

// --- Computed schedule entry (before DB insertion) ---

export interface ComputedScheduleEntry {
  period_date: string
  depreciation_amount: number
  accumulated_depreciation: number
  book_value: number
}

// --- Asset Summary ---

export interface AssetSummary {
  totalAssets: number
  totalAcquisitionCost: number
  totalBookValue: number
  totalDepreciationThisYear: number
  fullyDepreciated: number
}

// --- Create/Update Inputs ---

export interface CreateAssetInput {
  name: string
  description?: string
  category_id?: string
  acquisition_date: string
  acquisition_cost: number
  residual_value?: number
  useful_life_months: number
  depreciation_method?: DepreciationMethod
  declining_balance_rate?: number
  location?: string
  serial_number?: string
  supplier_name?: string
  warranty_expires?: string
  notes?: string
  cost_center_id?: string
  project_id?: string
}

export interface UpdateAssetInput {
  name?: string
  description?: string
  category_id?: string
  residual_value?: number
  location?: string
  serial_number?: string
  supplier_name?: string
  warranty_expires?: string
  notes?: string
  cost_center_id?: string
  project_id?: string
}

export interface CreateAssetCategoryInput {
  code: string
  name: string
  asset_account: string
  depreciation_account: string
  expense_account: string
  default_useful_life_months?: number
  default_depreciation_method?: DepreciationMethod
}

// --- Asset Disposal ---

export interface AssetDisposalInput {
  disposal_date: string
  disposal_amount: number
  disposal_type: DisposalType
}

// --- Depreciation Posting Preview ---

export interface DepreciationPostingPreview {
  asset_id: string
  asset_number: string
  asset_name: string
  category_name: string
  expense_account: string
  depreciation_account: string
  depreciation_amount: number
  period_date: string
}

// --- Monthly Posting Result ---

export interface MonthlyPostingResult {
  posted_count: number
  total_amount: number
  journal_entry_ids: string[]
}

// =============================================================================
// Swedish Labels
// =============================================================================

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: 'Aktiv',
  fully_depreciated: 'Fullt avskriven',
  disposed: 'Utrangerad',
  sold: 'Såld',
  written_off: 'Nedskriven',
}

export const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = {
  straight_line: 'Linjär avskrivning',
  declining_balance: 'Degressiv avskrivning',
  units_of_production: 'Produktionsbaserad avskrivning',
}

export const DEPRECIATION_METHOD_DESCRIPTIONS: Record<DepreciationMethod, string> = {
  straight_line: 'Samma belopp varje månad under hela nyttjandeperioden. Vanligast i Sverige.',
  declining_balance: 'Högre avskrivning i början, sjunkande över tiden. Baseras på restvärdet.',
  units_of_production: 'Avskrivning baserad på faktisk användning eller produktion.',
}

export const DISPOSAL_TYPE_LABELS: Record<DisposalType, string> = {
  sold: 'Såld',
  scrapped: 'Utrangerad',
  written_off: 'Nedskriven',
}
