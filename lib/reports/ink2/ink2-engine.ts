import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import type {
  FiscalPeriod,
  JournalEntry,
  JournalEntryLine,
} from '@/types'
import type {
  INK2Declaration,
  INK2DeclarationRutor,
  INK2AccountMapping,
  INK2SRUCode,
} from './types'

/**
 * INK2 (Aktiebolag / Limited Company Declaration)
 *
 * Maps BAS account balances to INK2 declaration fields (SRU 7201-7380)
 * for tax reporting to Skatteverket.
 *
 * This generates the bokföringsmässigt resultat (accounting result).
 * Skattemässiga justeringar (INK2S) are handled by the accountant.
 *
 * Account mappings use engine-internal range-based logic, NOT the DB
 * sru_code column, because the DB column is NE-biased for class 3-8.
 */

/**
 * Account mapping configuration for INK2 declaration
 */
export const INK2_ACCOUNT_MAPPINGS: INK2AccountMapping[] = [
  // Balance sheet - Assets
  {
    sruCode: '7201',
    description: 'Immateriella anläggningstillgångar',
    section: 'assets',
    normalBalance: 'debit',
    accountRanges: [{ start: '1000', end: '1099' }],
  },
  {
    sruCode: '7202',
    description: 'Materiella anläggningstillgångar',
    section: 'assets',
    normalBalance: 'debit',
    accountRanges: [{ start: '1100', end: '1299' }],
  },
  {
    sruCode: '7203',
    description: 'Finansiella anläggningstillgångar',
    section: 'assets',
    normalBalance: 'debit',
    accountRanges: [{ start: '1300', end: '1399' }],
  },
  {
    sruCode: '7210',
    description: 'Varulager m.m.',
    section: 'assets',
    normalBalance: 'debit',
    accountRanges: [{ start: '1400', end: '1499' }],
  },
  {
    sruCode: '7211',
    description: 'Kundfordringar',
    section: 'assets',
    normalBalance: 'debit',
    accountRanges: [{ start: '1500', end: '1599' }],
  },
  {
    sruCode: '7212',
    description: 'Övriga omsättningstillgångar',
    section: 'assets',
    normalBalance: 'debit',
    accountRanges: [{ start: '1600', end: '1999' }],
  },

  // Balance sheet - Equity & Liabilities
  {
    sruCode: '7220',
    description: 'Aktiekapital',
    section: 'equity_liabilities',
    normalBalance: 'credit',
    accountRanges: [{ start: '2081', end: '2081' }],
  },
  {
    sruCode: '7221',
    description: 'Övrigt eget kapital',
    section: 'equity_liabilities',
    normalBalance: 'credit',
    accountRanges: [
      { start: '2000', end: '2080' },
      { start: '2082', end: '2098' },
    ],
  },
  {
    sruCode: '7222',
    description: 'Årets resultat',
    section: 'equity_liabilities',
    normalBalance: 'credit',
    accountRanges: [{ start: '2099', end: '2099' }],
  },
  {
    sruCode: '7230',
    description: 'Obeskattade reserver, avsättningar och skulder',
    section: 'equity_liabilities',
    normalBalance: 'credit',
    accountRanges: [{ start: '2100', end: '2499' }],
  },
  {
    sruCode: '7231',
    description: 'Övriga skulder',
    section: 'equity_liabilities',
    normalBalance: 'credit',
    accountRanges: [{ start: '2500', end: '2999' }],
  },

  // Income statement
  {
    sruCode: '7310',
    description: 'Nettoomsättning',
    section: 'income_statement',
    normalBalance: 'credit',
    accountRanges: [{ start: '3000', end: '3999' }],
  },
  {
    sruCode: '7320',
    description: 'Varuinköp/direkta kostnader',
    section: 'income_statement',
    normalBalance: 'debit',
    accountRanges: [{ start: '4000', end: '4999' }],
  },
  {
    sruCode: '7330',
    description: 'Övriga externa kostnader',
    section: 'income_statement',
    normalBalance: 'debit',
    accountRanges: [{ start: '5000', end: '6999' }],
  },
  {
    sruCode: '7340',
    description: 'Personalkostnader',
    section: 'income_statement',
    normalBalance: 'debit',
    accountRanges: [{ start: '7000', end: '7699' }],
  },
  {
    sruCode: '7350',
    description: 'Avskrivningar',
    section: 'income_statement',
    normalBalance: 'debit',
    accountRanges: [{ start: '7700', end: '7899' }],
  },
  {
    sruCode: '7360',
    description: 'Övriga rörelsekostnader',
    section: 'income_statement',
    normalBalance: 'debit',
    accountRanges: [{ start: '7900', end: '7999' }],
  },
  {
    sruCode: '7370',
    description: 'Finansiella poster (netto)',
    section: 'income_statement',
    normalBalance: 'net',
    accountRanges: [{ start: '8000', end: '8499' }],
  },
  {
    sruCode: '7380',
    description: 'Extraordinära poster (netto)',
    section: 'income_statement',
    normalBalance: 'net',
    accountRanges: [{ start: '8500', end: '8999' }],
  },
]

/**
 * Check if an account number falls within a mapping's ranges
 */
export function isAccountInMapping(accountNumber: string, mapping: INK2AccountMapping): boolean {
  for (const range of mapping.accountRanges) {
    if (accountNumber >= range.start && accountNumber <= range.end) {
      if (range.exclude && range.exclude.includes(accountNumber)) {
        continue
      }
      return true
    }
  }
  return false
}

/**
 * Round to nearest krona (whole number) for INK2 declaration
 */
function roundToKrona(value: number): number {
  return Math.round(value)
}

/**
 * Generate INK2 declaration for a fiscal period
 */
export async function generateINK2Declaration(
  supabase: SupabaseClient,
  userId: string,
  fiscalPeriodId: string
): Promise<INK2Declaration> {

  // Fetch fiscal period
  const { data: period, error: periodError } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', fiscalPeriodId)
    .eq('user_id', userId)
    .single()

  if (periodError || !period) {
    throw new Error('Fiscal period not found')
  }

  // Fetch company settings
  const { data: settings } = await supabase
    .from('company_settings')
    .select('company_name, org_number, entity_type')
    .eq('user_id', userId)
    .single()

  // Validate entity type
  if (settings?.entity_type !== 'aktiebolag') {
    throw new Error('INK2 declaration is only for aktiebolag (limited company)')
  }

  // Fetch all posted journal entries with lines for this period
  const { data: entries, error: entriesError } = await supabase
    .from('journal_entries')
    .select('*, lines:journal_entry_lines(*)')
    .eq('user_id', userId)
    .eq('fiscal_period_id', fiscalPeriodId)
    .in('status', ['posted', 'reversed'])

  if (entriesError) {
    throw new Error(`Failed to fetch journal entries: ${entriesError.message}`)
  }

  // Fetch chart of accounts for account names
  const accounts = await fetchAllRows<{ account_number: string; account_name: string }>(({ from, to }) =>
    supabase
      .from('chart_of_accounts')
      .select('account_number, account_name')
      .eq('user_id', userId)
      .range(from, to)
  )

  const accountNameMap = new Map<string, string>()
  for (const acc of accounts) {
    accountNameMap.set(acc.account_number, acc.account_name)
  }

  // Calculate balances per account (debit - credit)
  const accountBalances = new Map<string, number>()

  for (const entry of (entries as JournalEntry[]) || []) {
    const lines = (entry.lines as JournalEntryLine[]) || []
    for (const line of lines) {
      const current = accountBalances.get(line.account_number) || 0
      const netAmount = (Number(line.debit_amount) || 0) - (Number(line.credit_amount) || 0)
      accountBalances.set(line.account_number, current + netAmount)
    }
  }

  // Initialize rutor
  const rutor: INK2DeclarationRutor = {
    '7201': 0, '7202': 0, '7203': 0, '7210': 0, '7211': 0, '7212': 0,
    '7220': 0, '7221': 0, '7222': 0, '7230': 0, '7231': 0,
    '7310': 0, '7320': 0, '7330': 0, '7340': 0, '7350': 0, '7360': 0, '7370': 0, '7380': 0,
  }

  const allCodes: INK2SRUCode[] = Object.keys(rutor) as INK2SRUCode[]
  const breakdown = {} as INK2Declaration['breakdown']
  for (const code of allCodes) {
    breakdown[code] = { accounts: [], total: 0 }
  }

  const warnings: string[] = []

  // Process each account balance
  for (const [accountNumber, balance] of accountBalances) {
    if (Math.abs(balance) < 0.01) continue

    for (const mapping of INK2_ACCOUNT_MAPPINGS) {
      if (isAccountInMapping(accountNumber, mapping)) {
        let amount: number

        if (mapping.normalBalance === 'debit') {
          // Asset/expense accounts: debit normal, balance is already positive for debit
          amount = balance
        } else if (mapping.normalBalance === 'credit') {
          // Equity/liability/revenue accounts: credit normal, negate to show as positive
          amount = -balance
        } else {
          // Net fields (7370, 7380): negate so positive = net income, negative = net cost
          amount = -balance
        }

        rutor[mapping.sruCode] += amount

        breakdown[mapping.sruCode].accounts.push({
          accountNumber,
          accountName: accountNameMap.get(accountNumber) || `Konto ${accountNumber}`,
          amount: roundToKrona(amount),
        })

        break
      }
    }
  }

  // Round all rutor to whole krona
  for (const code of allCodes) {
    rutor[code] = roundToKrona(rutor[code])
    breakdown[code].total = rutor[code]
  }

  // Calculate derived totals
  const totalAssets = rutor['7201'] + rutor['7202'] + rutor['7203'] +
    rutor['7210'] + rutor['7211'] + rutor['7212']

  // Operating result = revenue - operating costs
  const operatingResult = rutor['7310'] -
    rutor['7320'] - rutor['7330'] - rutor['7340'] -
    rutor['7350'] - rutor['7360']

  // Result after financial items
  const resultAfterFinancial = operatingResult + rutor['7370'] + rutor['7380']

  // Årets resultat (7222): During an open fiscal year, account 2099 has no balance —
  // the profit only exists as the net of income statement accounts (class 3-8).
  // After year-end closing, 2099 has the balance and income accounts are zeroed.
  // Adding resultAfterFinancial handles both cases correctly (0 + profit, or profit + 0).
  rutor['7222'] += roundToKrona(resultAfterFinancial)
  breakdown['7222'].total = rutor['7222']
  if (resultAfterFinancial !== 0) {
    breakdown['7222'].accounts.push({
      accountNumber: 'calc',
      accountName: 'Beräknat resultat från resultaträkningen',
      amount: roundToKrona(resultAfterFinancial),
    })
  }

  const totalEquityLiabilities = rutor['7220'] + rutor['7221'] + rutor['7222'] +
    rutor['7230'] + rutor['7231']

  // Add warnings
  if (!(period as FiscalPeriod).is_closed) {
    warnings.push('Räkenskapsåret är inte stängt. Siffrorna kan ändras.')
  }

  if (totalAssets === 0 && totalEquityLiabilities === 0 && rutor['7310'] === 0) {
    warnings.push('Inga bokförda transaktioner hittades för perioden.')
  }

  const balanceDiff = Math.abs(totalAssets - totalEquityLiabilities)
  if (balanceDiff > 0 && totalAssets > 0) {
    warnings.push(
      `Balansräkningen är inte i balans. Tillgångar: ${totalAssets} kr, Eget kapital och skulder: ${totalEquityLiabilities} kr (differens: ${balanceDiff} kr).`
    )
  }

  return {
    fiscalYear: {
      id: period.id,
      name: period.name,
      start: period.period_start,
      end: period.period_end,
      isClosed: period.is_closed,
    },
    rutor,
    breakdown,
    totals: {
      totalAssets,
      totalEquityLiabilities,
      operatingResult,
      resultAfterFinancial,
    },
    companyInfo: {
      companyName: settings?.company_name || 'Okänt företag',
      orgNumber: settings?.org_number || null,
    },
    warnings,
  }
}

/**
 * Get totals for display
 */
export function getINK2DeclarationTotals(declaration: INK2Declaration): {
  totalAssets: number
  totalEquityLiabilities: number
  operatingResult: number
  resultAfterFinancial: number
} {
  return declaration.totals
}
