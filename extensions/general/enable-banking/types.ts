// Enable Banking extension types

export interface StoredAccount {
  uid: string
  iban?: string
  name?: string
  currency: string
  balance?: number
}

// Re-export API types from the client
export type {
  ASPSP,
  AuthMethod,
  AuthResponse,
  SessionResponse,
  AccountInfo,
  Balance,
  BalanceResponse,
  Transaction as EnableBankingTransaction,
  TransactionsResponse,
  Bank,
  BankTransaction,
} from './lib/api-client'
