import type { EntityType, IncomeStatementReport, BalanceSheetReport } from './index'

// ============================================================
// Year-End Closing Types (Bokslut)
// ============================================================

export type YearEndClosingStatus =
  | 'not_started'
  | 'checklist'
  | 'adjustments'
  | 'review'
  | 'closing'
  | 'completed'

export interface YearEndClosing {
  id: string
  user_id: string
  fiscal_period_id: string
  status: YearEndClosingStatus
  started_at: string | null
  completed_at: string | null
  closing_journal_entry_id: string | null
  opening_balance_entry_id: string | null
  net_result: number | null
  result_account: string
  notes: string | null
  checklist_data: YearEndChecklist
  created_at: string
  updated_at: string
  // Relations
  fiscal_period?: {
    id: string
    name: string
    period_start: string
    period_end: string
    is_closed: boolean
  }
  annual_report?: AnnualReport | null
}

export type ChecklistCategory = 'preparation' | 'verification' | 'adjustments' | 'closing'

export interface YearEndChecklist {
  items: YearEndChecklistItem[]
  completedCount: number
  totalCount: number
}

export interface YearEndChecklistItem {
  key: string
  title: string
  description: string
  isCompleted: boolean
  isRequired: boolean
  completedAt?: string
  category: ChecklistCategory
}

// ============================================================
// Annual Report Types (Årsredovisning)
// ============================================================

export type AnnualReportStatus = 'draft' | 'review' | 'approved' | 'filed'

export interface AnnualReport {
  id: string
  user_id: string
  fiscal_period_id: string
  year_end_closing_id: string
  entity_type: EntityType
  status: AnnualReportStatus
  report_data: Record<string, unknown>
  income_statement: IncomeStatementReport | null
  balance_sheet: BalanceSheetReport | null
  notes_data: AnnualReportNote[]
  management_report: string | null
  board_members: BoardMember[]
  auditor_info: AuditorInfo | null
  signed_at: string | null
  filed_at: string | null
  filing_reference: string | null
  pdf_url: string | null
  created_at: string
  updated_at: string
}

export interface AnnualReportNote {
  noteNumber: number
  title: string
  content: string
  type: 'accounting_principles' | 'assets' | 'equity' | 'liabilities' | 'other'
}

export interface BoardMember {
  name: string
  role: 'ordforande' | 'ledamot' | 'suppleant' | 'vd'
  personalNumber?: string
}

export interface AuditorInfo {
  name: string
  firm: string
  memberNumber?: string
}

// ============================================================
// Closing Entry Types
// ============================================================

export interface ClosingEntry {
  description: string
  lines: ClosingEntryLine[]
}

export interface ClosingEntryLine {
  account: string
  accountName?: string
  debit: number
  credit: number
}

export interface ClosingEntryPreview {
  closingEntry: ClosingEntry
  taxEntry: ClosingEntry | null
  resultTransferEntry: ClosingEntry
  netResult: number
  taxAmount: number
  resultAfterTax: number
}

export interface OpeningBalancePreview {
  entries: ClosingEntryLine[]
  totalDebit: number
  totalCredit: number
  periodName: string
}

// ============================================================
// Swedish Labels
// ============================================================

export const YEAR_END_STATUS_LABELS: Record<YearEndClosingStatus, string> = {
  not_started: 'Ej startad',
  checklist: 'Checklista',
  adjustments: 'Justeringar',
  review: 'Granskning',
  closing: 'Bokslut',
  completed: 'Klart',
}

export const ANNUAL_REPORT_STATUS_LABELS: Record<AnnualReportStatus, string> = {
  draft: 'Utkast',
  review: 'Granskning',
  approved: 'Godkand',
  filed: 'Inlamnad',
}

export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  preparation: 'Forberedelser',
  verification: 'Avstamning',
  adjustments: 'Justeringar',
  closing: 'Avslut',
}

// Wizard step definitions
export const YEAR_END_STEPS = [
  { key: 'preparation', label: 'Förberedelser', description: 'Checklista och förberedande åtgärder' },
  { key: 'verification', label: 'Avstämning', description: 'Kontrollera saldobalans och balans' },
  { key: 'adjustments', label: 'Justeringar', description: 'Bokför justeringar och skatt' },
  { key: 'closing', label: 'Bokslutsverifikation', description: 'Stäng resultaträkning och överför resultat' },
  { key: 'opening', label: 'Ingående balanser', description: 'Skapa ingående balanser för nästa år' },
  { key: 'report', label: 'Årsredovisning', description: 'Generera och ladda ner årsredovisning' },
] as const

export type YearEndStepKey = typeof YEAR_END_STEPS[number]['key']
