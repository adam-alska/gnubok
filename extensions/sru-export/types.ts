import type { EntityType } from '@/types'

// Generic SRU export types
export interface SRUExportResult {
  formType: 'NE' | 'INK2'
  entityType: EntityType
  companyName: string | null
  orgNumber: string | null
  fiscalYear: {
    id: string
    name: string
    start: string
    end: string
  }
  balances: Array<{
    sruCode: string
    description: string
    amount: number
    accounts: Array<{
      accountNumber: string
      accountName: string
      amount: number
    }>
  }>
  warnings: string[]
}

export interface SRUCoverageStats {
  totalAccounts: number
  accountsWithSRU: number
  accountsWithoutSRU: number
  coveragePercent: number
  missingAccounts: Array<{
    accountNumber: string
    accountName: string
  }>
}
