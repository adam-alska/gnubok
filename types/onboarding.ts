// =============================================================================
// Smart Onboarding Types
// =============================================================================

export type QuestionType = 'boolean' | 'select' | 'multi_select'

export interface OnboardingSectorQuestion {
  id: string
  question: string
  type: QuestionType
  options?: { value: string; label: string }[]
  sectorSlug: string
  /** Key used to store the answer in the business profile */
  profileKey: string
}

export interface BusinessProfile {
  [key: string]: string | boolean | string[] | number | undefined
}

export interface OnboardingChecklistItem {
  id: string
  user_id: string
  task_key: string
  title: string
  description: string | null
  is_completed: boolean
  completed_at: string | null
  sort_order: number
  created_at: string
}

export type ModuleRecommendationTier = 'recommended' | 'optional' | 'advanced'

export interface ModuleRecommendation {
  moduleSlug: string
  sectorSlug: string
  relevanceScore: number
  reason: string
  tier: ModuleRecommendationTier
  category: 'bokforing' | 'rapport' | 'import' | 'operativ'
  moduleName: string
  moduleDesc: string
}

export interface GroupedRecommendations {
  bokforing: ModuleRecommendation[]
  rapport: ModuleRecommendation[]
  import: ModuleRecommendation[]
  operativ: ModuleRecommendation[]
}

export interface SectorQuestionSet {
  sectorSlug: string
  sectorName: string
  questions: OnboardingSectorQuestion[]
}

export interface OnboardingCompletePayload {
  selectedSector: string
  selectedModules: string[]
  businessProfile: BusinessProfile
}

export interface ChecklistTask {
  taskKey: string
  title: string
  description: string
  sortOrder: number
}
