/**
 * Static configuration of all Swedish tax deadlines (Skatteverket)
 * Based on Skatteverket's official deadline schedule
 */

import type { TaxDeadlineType, EntityType, MomsPeriod } from '@/types'

// Condition function type for determining if a deadline applies
export type DeadlineCondition = (settings: CompanySettingsForDeadlines) => boolean

// Subset of company settings needed for deadline generation
export interface CompanySettingsForDeadlines {
  entity_type: EntityType
  moms_period: MomsPeriod | null
  f_skatt: boolean
  vat_registered: boolean
  pays_salaries: boolean
  fiscal_year_start_month: number // 1-12
}

// Configuration for a single tax deadline type
export interface TaxDeadlineConfig {
  type: TaxDeadlineType
  titleTemplate: string
  description: string
  condition: DeadlineCondition
  priority: 'critical' | 'important' | 'normal'
  // Function to generate all instances for a year
  generateDates: (year: number, settings: CompanySettingsForDeadlines) => DeadlineInstance[]
  // Link to report type for navigation
  linkedReportType: string | null
}

// A specific instance of a deadline
export interface DeadlineInstance {
  day: number      // Day of month
  month: number    // 0-indexed month
  year: number
  period: string   // e.g., "2025-Q1", "2025-01", "2025"
  periodLabel: string // Human-readable, e.g., "Q1 2025", "januari 2025"
}

/**
 * All tax deadline configurations
 */
export const TAX_DEADLINE_CONFIGS: TaxDeadlineConfig[] = [
  // Momsdeklaration (monthly)
  {
    type: 'moms_monthly',
    titleTemplate: 'Momsdeklaration {periodLabel}',
    description: 'Momsdeklaration för månadsredovisare',
    condition: (s) => s.vat_registered && s.moms_period === 'monthly',
    priority: 'important',
    linkedReportType: 'vat',
    generateDates: (year) => {
      const instances: DeadlineInstance[] = []
      // Due on the 12th of the following month
      for (let month = 0; month < 12; month++) {
        // Deadline for month X is on 12th of month X+1
        const deadlineMonth = (month + 1) % 12
        const deadlineYear = month === 11 ? year + 1 : year
        instances.push({
          day: 12,
          month: deadlineMonth,
          year: deadlineYear,
          period: `${year}-${String(month + 1).padStart(2, '0')}`,
          periodLabel: getMonthLabel(month, year),
        })
      }
      return instances
    },
  },

  // Momsdeklaration (quarterly) - e-tjänst deadline (26:e)
  {
    type: 'moms_quarterly',
    titleTemplate: 'Momsdeklaration {periodLabel}',
    description: 'Momsdeklaration för kvartalsredovisare (e-tjänst)',
    condition: (s) => s.vat_registered && s.moms_period === 'quarterly',
    priority: 'important',
    linkedReportType: 'vat',
    generateDates: (year) => {
      // Q1 (Jan-Mar) -> 26 april
      // Q2 (Apr-Jun) -> 26 juli
      // Q3 (Jul-Sep) -> 26 oktober
      // Q4 (Oct-Dec) -> 26 januari next year
      return [
        { day: 26, month: 3, year, period: `${year}-Q1`, periodLabel: `Q1 ${year}` },   // April
        { day: 26, month: 6, year, period: `${year}-Q2`, periodLabel: `Q2 ${year}` },   // July
        { day: 26, month: 9, year, period: `${year}-Q3`, periodLabel: `Q3 ${year}` },   // October
        { day: 26, month: 0, year: year + 1, period: `${year}-Q4`, periodLabel: `Q4 ${year}` }, // January next year
      ]
    },
  },

  // F-skatt (monthly)
  {
    type: 'f_skatt',
    titleTemplate: 'F-skatt {periodLabel}',
    description: 'Inbetalning av preliminär skatt',
    condition: (s) => s.f_skatt,
    priority: 'important',
    linkedReportType: null,
    generateDates: (year) => {
      const instances: DeadlineInstance[] = []
      // Due on the 17th of each month
      for (let month = 0; month < 12; month++) {
        instances.push({
          day: 17,
          month,
          year,
          period: `${year}-${String(month + 1).padStart(2, '0')}`,
          periodLabel: getMonthLabel(month, year),
        })
      }
      return instances
    },
  },

  // Arbetsgivardeklaration (monthly, AB with employees)
  {
    type: 'arbetsgivardeklaration',
    titleTemplate: 'Arbetsgivardeklaration {periodLabel}',
    description: 'Arbetsgivardeklaration för aktiebolag med anställda',
    condition: (s) => s.entity_type === 'aktiebolag' && s.pays_salaries,
    priority: 'important',
    linkedReportType: null,
    generateDates: (year) => {
      const instances: DeadlineInstance[] = []
      // Due on the 12th of the following month
      for (let month = 0; month < 12; month++) {
        const deadlineMonth = (month + 1) % 12
        const deadlineYear = month === 11 ? year + 1 : year
        instances.push({
          day: 12,
          month: deadlineMonth,
          year: deadlineYear,
          period: `${year}-${String(month + 1).padStart(2, '0')}`,
          periodLabel: getMonthLabel(month, year),
        })
      }
      return instances
    },
  },

  // Periodisk sammanställning (quarterly, EU sales)
  {
    type: 'periodisk_sammanstallning',
    titleTemplate: 'Periodisk sammanställning {periodLabel}',
    description: 'Periodisk sammanställning för EU-försäljning',
    condition: (s) => s.vat_registered, // Simplified - in reality depends on EU sales
    priority: 'normal',
    linkedReportType: null,
    generateDates: (year) => {
      // Q1 -> 20 april, Q2 -> 20 juli, Q3 -> 20 oktober, Q4 -> 20 januari
      return [
        { day: 20, month: 3, year, period: `${year}-Q1`, periodLabel: `Q1 ${year}` },
        { day: 20, month: 6, year, period: `${year}-Q2`, periodLabel: `Q2 ${year}` },
        { day: 20, month: 9, year, period: `${year}-Q3`, periodLabel: `Q3 ${year}` },
        { day: 20, month: 0, year: year + 1, period: `${year}-Q4`, periodLabel: `Q4 ${year}` },
      ]
    },
  },

  // Inkomstdeklaration (EF) - 2 maj
  {
    type: 'inkomstdeklaration_ef',
    titleTemplate: 'Inkomstdeklaration + NE-bilaga {periodLabel}',
    description: 'Inkomstdeklaration för enskild firma',
    condition: (s) => s.entity_type === 'enskild_firma',
    priority: 'critical',
    linkedReportType: 'ne-declaration',
    generateDates: (year) => {
      // Due May 2nd for previous year's income
      return [
        { day: 2, month: 4, year, period: `${year - 1}`, periodLabel: `${year - 1}` },
      ]
    },
  },

  // Inkomstdeklaration (AB) - 1 juli (for calendar year fiscal)
  {
    type: 'inkomstdeklaration_ab',
    titleTemplate: 'Inkomstdeklaration AB {periodLabel}',
    description: 'Inkomstdeklaration för aktiebolag',
    condition: (s) => s.entity_type === 'aktiebolag',
    priority: 'critical',
    linkedReportType: null,
    generateDates: (year, settings) => {
      // For calendar year fiscal (start month = 1), due July 1st
      // For other fiscal years, this would need adjustment
      if (settings.fiscal_year_start_month === 1) {
        return [
          { day: 1, month: 6, year, period: `${year - 1}`, periodLabel: `${year - 1}` },
        ]
      }
      // For non-calendar fiscal years, calculate based on fiscal year end + 6 months
      const fiscalYearEnd = settings.fiscal_year_start_month === 1 ? 12 : settings.fiscal_year_start_month - 1
      const deadlineMonth = (fiscalYearEnd + 5) % 12 // 6 months after year end
      return [
        { day: 1, month: deadlineMonth, year, period: `${year - 1}/${year}`, periodLabel: `${year - 1}/${year}` },
      ]
    },
  },

  // Årsredovisning (AB) - 30 juni (6 months after fiscal year end)
  {
    type: 'arsredovisning',
    titleTemplate: 'Årsredovisning till Bolagsverket {periodLabel}',
    description: 'Årsredovisning för aktiebolag',
    condition: (s) => s.entity_type === 'aktiebolag',
    priority: 'critical',
    linkedReportType: null,
    generateDates: (year, settings) => {
      // For calendar year fiscal, due June 30th
      if (settings.fiscal_year_start_month === 1) {
        return [
          { day: 30, month: 5, year, period: `${year - 1}`, periodLabel: `${year - 1}` },
        ]
      }
      // For non-calendar fiscal years, 6 months after year end
      const fiscalYearEnd = settings.fiscal_year_start_month - 1 // 0-indexed month
      const deadlineMonth = (fiscalYearEnd + 6) % 12
      const deadlineYear = deadlineMonth < fiscalYearEnd ? year + 1 : year
      return [
        { day: 30, month: deadlineMonth, year: deadlineYear, period: `${year - 1}/${year}`, periodLabel: `${year - 1}/${year}` },
      ]
    },
  },

  // Bokslut (AB) - 31 mars for calendar year
  {
    type: 'bokslut',
    titleTemplate: 'Bokslut räkenskapsår {periodLabel}',
    description: 'Bokslut för aktiebolag',
    condition: (s) => s.entity_type === 'aktiebolag',
    priority: 'important',
    linkedReportType: null,
    generateDates: (year, settings) => {
      // For calendar year, December 31 is fiscal year end, deadline March 31
      if (settings.fiscal_year_start_month === 1) {
        return [
          { day: 31, month: 2, year, period: `${year - 1}`, periodLabel: `${year - 1}` }, // March
        ]
      }
      // For non-calendar fiscal years, 3 months after year end
      const fiscalYearEnd = settings.fiscal_year_start_month - 1
      const deadlineMonth = (fiscalYearEnd + 3) % 12
      const deadlineYear = deadlineMonth < fiscalYearEnd ? year + 1 : year
      return [
        { day: 31, month: deadlineMonth, year: deadlineYear, period: `${year - 1}/${year}`, periodLabel: `${year - 1}/${year}` },
      ]
    },
  },
]

/**
 * Helper to get month label in Swedish
 */
function getMonthLabel(month: number, year: number): string {
  const months = [
    'januari', 'februari', 'mars', 'april', 'maj', 'juni',
    'juli', 'augusti', 'september', 'oktober', 'november', 'december'
  ]
  return `${months[month]} ${year}`
}

/**
 * Get all applicable deadline configs for given company settings
 */
export function getApplicableDeadlineConfigs(
  settings: CompanySettingsForDeadlines
): TaxDeadlineConfig[] {
  return TAX_DEADLINE_CONFIGS.filter((config) => config.condition(settings))
}

/**
 * Map from tax deadline type to report URL generator
 */
export const REPORT_URLS: Record<string, (period: { year: number; quarter?: number; month?: number }) => string> = {
  vat: (p) => {
    if (p.quarter) {
      return `/reports?tab=vat&year=${p.year}&period=${p.quarter}`
    }
    if (p.month) {
      return `/reports?tab=vat&year=${p.year}&period=${p.month}`
    }
    return `/reports?tab=vat&year=${p.year}`
  },
  'ne-declaration': () => '/reports?tab=ne-declaration',
}

/**
 * Get the report URL for a deadline
 */
export function getReportUrl(
  linkedReportType: string | null,
  linkedReportPeriod: Record<string, unknown> | null
): string | null {
  if (!linkedReportType || !linkedReportPeriod) {
    return null
  }

  const urlGenerator = REPORT_URLS[linkedReportType]
  if (!urlGenerator) {
    return null
  }

  return urlGenerator(linkedReportPeriod as { year: number; quarter?: number; month?: number })
}
