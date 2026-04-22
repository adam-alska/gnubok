import { NextResponse } from 'next/server'

export const ACCOUNTS_NOT_IN_CHART = 'ACCOUNTS_NOT_IN_CHART' as const

export class AccountsNotInChartError extends Error {
  readonly code = ACCOUNTS_NOT_IN_CHART
  readonly accountNumbers: string[]

  constructor(accountNumbers: string[]) {
    const sorted = [...new Set(accountNumbers)].sort()
    super(`Accounts not enabled in chart of accounts: ${sorted.join(', ')}`)
    this.name = 'AccountsNotInChartError'
    this.accountNumbers = sorted
  }
}

export function isAccountsNotInChartError(err: unknown): err is AccountsNotInChartError {
  return err instanceof AccountsNotInChartError
}

/**
 * Build a structured 400 response for AccountsNotInChartError.
 * API routes catch the typed error and return this so the frontend can
 * open ActivateAccountsDialog and retry the request after activation.
 */
export function accountsNotInChartResponse(err: AccountsNotInChartError) {
  return NextResponse.json(
    {
      error: {
        code: err.code,
        message: `Följande konton behöver aktiveras: ${err.accountNumbers.join(', ')}`,
        account_numbers: err.accountNumbers,
      },
    },
    { status: 400 }
  )
}
