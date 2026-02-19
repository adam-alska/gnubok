import { createClient } from '@/lib/supabase/server'
import { createJournalEntry } from '@/lib/bookkeeping/engine'
import { generateTrialBalance } from '@/lib/reports/trial-balance'
import type { CreateJournalEntryInput, EntityType, TrialBalanceRow } from '@/types'
import type {
  YearEndChecklist,
  YearEndChecklistItem,
  ClosingEntry,
  ClosingEntryPreview,
  ClosingEntryLine,
  OpeningBalancePreview,
} from '@/types/year-end'

// Swedish corporate tax rate (bolagsskatt) 2024
const BOLAGSSKATT_RATE = 0.206

// ============================================================
// Checklist Generation
// ============================================================

/**
 * Generate the year-end closing checklist based on entity type.
 * Items for enskild_firma differ slightly from aktiebolag.
 */
export function generateChecklist(
  entityType: EntityType
): YearEndChecklist {
  const items: YearEndChecklistItem[] = [
    // --- Preparation ---
    {
      key: 'reconcile_bank',
      title: 'Stäm av bankkonton',
      description: 'Kontrollera att saldo i bokföringen stämmer med kontoutdrag från banken per bokslutsdagen.',
      isCompleted: false,
      isRequired: true,
      category: 'preparation',
    },
    {
      key: 'verify_receivables',
      title: 'Kontrollera kundfordringar',
      description: 'Gå igenom obetalda kundfakturor. Bedöm om några fordringar behöver skrivas ned.',
      isCompleted: false,
      isRequired: true,
      category: 'preparation',
    },
    {
      key: 'verify_payables',
      title: 'Kontrollera leverantörsskulder',
      description: 'Kontrollera att alla leverantörsfakturor är bokförda och att skuldsaldot är korrekt.',
      isCompleted: false,
      isRequired: true,
      category: 'preparation',
    },
    {
      key: 'verify_inventory',
      title: 'Kontrollera lagervärde',
      description: 'Om du har lager: inventera och värdera enligt lägsta värdets princip (LVP).',
      isCompleted: false,
      isRequired: false,
      category: 'preparation',
    },
    {
      key: 'post_depreciation',
      title: 'Bokför avskrivningar',
      description: 'Beräkna och bokför årets avskrivningar på anläggningstillgångar (maskiner, inventarier).',
      isCompleted: false,
      isRequired: true,
      category: 'preparation',
    },
    {
      key: 'post_accruals',
      title: 'Bokför periodiseringar',
      description: 'Bokför förutbetalda kostnader och upplupna intäkter/kostnader som tillhör detta räkenskapsår.',
      isCompleted: false,
      isRequired: true,
      category: 'preparation',
    },

    // --- Verification ---
    {
      key: 'verify_trial_balance',
      title: 'Kontrollera saldobalans',
      description: 'Gå igenom saldobalansen och kontrollera att alla konton har rimliga saldon.',
      isCompleted: false,
      isRequired: true,
      category: 'verification',
    },
    {
      key: 'debit_credit_check',
      title: 'Debet = Kredit kontroll',
      description: 'Kontrollera att summa debet är lika med summa kredit i saldobalansen.',
      isCompleted: false,
      isRequired: true,
      category: 'verification',
    },
    {
      key: 'verify_vat',
      title: 'Kontrollera momsredovisning',
      description: 'Stäm av momsredovisningen. Kontrollera att all moms är korrekt bokförd och deklarerad.',
      isCompleted: false,
      isRequired: true,
      category: 'verification',
    },
    {
      key: 'reconcile_tax_account',
      title: 'Avstämning skattekonto',
      description: 'Kontrollera skattekontot hos Skatteverket. Stäm av mot bokfört saldo.',
      isCompleted: false,
      isRequired: true,
      category: 'verification',
    },

    // --- Adjustments ---
    ...(entityType === 'aktiebolag'
      ? [
          {
            key: 'book_untaxed_reserves',
            title: 'Bokför obeskattade reserver',
            description:
              'Beräkna och bokför eventuella periodiseringsfonder och överavskrivningar.',
            isCompleted: false,
            isRequired: false,
            category: 'adjustments' as const,
          },
        ]
      : []),
    {
      key: 'book_tax',
      title: entityType === 'aktiebolag' ? 'Bokför bolagsskatt' : 'Beräkna egenavgifter',
      description:
        entityType === 'aktiebolag'
          ? 'Beräkna och bokför bolagsskatt (20,6%) på årets skattepliktiga resultat.'
          : 'Beräkna egenavgifter på årets resultat. Dessa deklareras i inkomstdeklarationen.',
      isCompleted: false,
      isRequired: entityType === 'aktiebolag',
      category: 'adjustments',
    },
    {
      key: 'calculate_result',
      title: 'Beräkna årets resultat',
      description: 'Kontrollera att årets resultat är korrekt beräknat efter alla justeringar.',
      isCompleted: false,
      isRequired: true,
      category: 'adjustments',
    },

    // --- Closing ---
    {
      key: 'close_income_statement',
      title: 'Stäng resultaträkning',
      description:
        'Nollställ alla intäkts- och kostnadskonton (klass 3-8) genom bokslutsverifikation.',
      isCompleted: false,
      isRequired: true,
      category: 'closing',
    },
    {
      key: 'transfer_result',
      title: 'Överför resultat till eget kapital',
      description: 'Överför årets resultat till balansräkningen (konto 2099).',
      isCompleted: false,
      isRequired: true,
      category: 'closing',
    },
    {
      key: 'set_opening_balances',
      title: 'Sätt ingående balanser',
      description: 'Skapa ingående balanser för nästa räkenskapsår baserat på utgående balanser.',
      isCompleted: false,
      isRequired: true,
      category: 'closing',
    },
    {
      key: 'lock_fiscal_year',
      title: 'Lås räkenskapsåret',
      description: 'Lås räkenskapsåret så att inga nya verifikationer kan bokföras.',
      isCompleted: false,
      isRequired: true,
      category: 'closing',
    },
  ]

  return {
    items,
    completedCount: 0,
    totalCount: items.length,
  }
}

// ============================================================
// Closing Entries Generation
// ============================================================

/**
 * Generate a preview of all closing entries that will be created.
 * Does NOT create any journal entries -- just returns what would happen.
 */
export async function generateClosingEntriesPreview(
  userId: string,
  fiscalPeriodId: string,
  entityType: EntityType
): Promise<ClosingEntryPreview> {
  const { rows } = await generateTrialBalance(userId, fiscalPeriodId)

  // Get account names map
  const supabase = await createClient()
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('account_number, account_name')
    .eq('user_id', userId)

  const accountNameMap = new Map<string, string>()
  for (const acc of accounts || []) {
    accountNameMap.set(acc.account_number, acc.account_name)
  }

  // Filter to income statement accounts (class 3-8)
  const incomeStatementRows = rows.filter(
    (r) => r.account_class >= 3 && r.account_class <= 8
  )

  // Build closing entry: zero out all income statement accounts
  const closingLines: ClosingEntryLine[] = []
  let netResult = 0

  for (const row of incomeStatementRows) {
    const balance = row.closing_debit - row.closing_credit
    if (Math.abs(balance) < 0.005) continue

    // To zero out: if debit balance, credit it; if credit balance, debit it
    if (balance > 0) {
      // Debit balance account (expense) -> credit to zero
      closingLines.push({
        account: row.account_number,
        accountName: accountNameMap.get(row.account_number) || row.account_name,
        debit: 0,
        credit: Math.round(balance * 100) / 100,
      })
    } else {
      // Credit balance account (revenue) -> debit to zero
      closingLines.push({
        account: row.account_number,
        accountName: accountNameMap.get(row.account_number) || row.account_name,
        debit: Math.round(Math.abs(balance) * 100) / 100,
        credit: 0,
      })
    }

    // Net result: revenue (credit) is positive, expense (debit) is negative
    netResult -= balance
  }

  netResult = Math.round(netResult * 100) / 100

  // The closing entry must balance, so add 8999 (Årets resultat) as the counterpart
  const closingCounterBalance = closingLines.reduce(
    (acc, l) => acc + l.debit - l.credit,
    0
  )
  if (Math.abs(closingCounterBalance) > 0.005) {
    if (closingCounterBalance > 0) {
      closingLines.push({
        account: '8999',
        accountName: 'Årets resultat',
        debit: 0,
        credit: Math.round(closingCounterBalance * 100) / 100,
      })
    } else {
      closingLines.push({
        account: '8999',
        accountName: 'Årets resultat',
        debit: Math.round(Math.abs(closingCounterBalance) * 100) / 100,
        credit: 0,
      })
    }
  }

  const closingEntry: ClosingEntry = {
    description: 'Bokslutsverifikation - Nollställning av resultatkonton',
    lines: closingLines,
  }

  // Tax entry for AB
  let taxEntry: ClosingEntry | null = null
  let taxAmount = 0

  if (entityType === 'aktiebolag' && netResult > 0) {
    taxAmount = Math.round(netResult * BOLAGSSKATT_RATE * 100) / 100
    taxEntry = {
      description: 'Bolagsskatt 20,6%',
      lines: [
        {
          account: '8910',
          accountName: 'Skatt på årets resultat',
          debit: taxAmount,
          credit: 0,
        },
        {
          account: '2510',
          accountName: 'Skatteskuld',
          debit: 0,
          credit: taxAmount,
        },
      ],
    }
  }

  const resultAfterTax = Math.round((netResult - taxAmount) * 100) / 100

  // Transfer result to equity (2099)
  const resultTransferEntry: ClosingEntry = {
    description: 'Överför årets resultat till eget kapital',
    lines: [],
  }

  if (resultAfterTax > 0) {
    // Profit: debit 8999, credit 2099
    resultTransferEntry.lines = [
      {
        account: '8999',
        accountName: 'Årets resultat',
        debit: resultAfterTax,
        credit: 0,
      },
      {
        account: '2099',
        accountName: 'Årets resultat (balansräkningen)',
        debit: 0,
        credit: resultAfterTax,
      },
    ]
  } else if (resultAfterTax < 0) {
    // Loss: credit 8999, debit 2099
    resultTransferEntry.lines = [
      {
        account: '8999',
        accountName: 'Årets resultat',
        debit: 0,
        credit: Math.abs(resultAfterTax),
      },
      {
        account: '2099',
        accountName: 'Årets resultat (balansräkningen)',
        debit: Math.abs(resultAfterTax),
        credit: 0,
      },
    ]
  }

  return {
    closingEntry,
    taxEntry,
    resultTransferEntry,
    netResult,
    taxAmount,
    resultAfterTax,
  }
}

/**
 * Execute the year-end closing:
 * 1. Create closing journal entry (zero out P&L)
 * 2. If AB: create tax entry
 * 3. Create result transfer entry
 * Returns the created journal entry IDs.
 */
export async function executeClosing(
  userId: string,
  closingId: string
): Promise<{ closingEntryId: string; netResult: number }> {
  const supabase = await createClient()

  // Fetch the closing record
  const { data: closing, error: closingError } = await supabase
    .from('year_end_closings')
    .select('*, fiscal_period:fiscal_periods(*)')
    .eq('id', closingId)
    .eq('user_id', userId)
    .single()

  if (closingError || !closing) {
    throw new Error('Bokslut hittades inte')
  }

  if (closing.status === 'completed') {
    throw new Error('Bokslutet är redan genomfört')
  }

  const period = closing.fiscal_period
  if (!period) {
    throw new Error('Räkenskapsår saknas')
  }

  if (period.is_closed) {
    throw new Error('Räkenskapsåret är redan låst')
  }

  // Get entity type
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type')
    .eq('user_id', userId)
    .single()

  const entityType: EntityType = (settings?.entity_type as EntityType) || 'enskild_firma'

  // Generate preview to get the entries
  const preview = await generateClosingEntriesPreview(
    userId,
    closing.fiscal_period_id,
    entityType
  )

  const createdEntryIds: string[] = []

  try {
    // 1. Create closing journal entry (zero out P&L)
    if (preview.closingEntry.lines.length > 0) {
      const closingInput: CreateJournalEntryInput = {
        fiscal_period_id: closing.fiscal_period_id,
        entry_date: period.period_end,
        description: preview.closingEntry.description,
        source_type: 'year_end',
        voucher_series: 'B',
        lines: preview.closingEntry.lines.map((l) => ({
          account_number: l.account,
          debit_amount: l.debit,
          credit_amount: l.credit,
          line_description: l.accountName,
        })),
      }

      const closingJE = await createJournalEntry(userId, closingInput)
      createdEntryIds.push(closingJE.id)
    }

    // 2. If AB and profitable: create tax entry
    if (preview.taxEntry && preview.taxEntry.lines.length > 0) {
      const taxInput: CreateJournalEntryInput = {
        fiscal_period_id: closing.fiscal_period_id,
        entry_date: period.period_end,
        description: preview.taxEntry.description,
        source_type: 'year_end',
        voucher_series: 'B',
        lines: preview.taxEntry.lines.map((l) => ({
          account_number: l.account,
          debit_amount: l.debit,
          credit_amount: l.credit,
          line_description: l.accountName,
        })),
      }

      const taxJE = await createJournalEntry(userId, taxInput)
      createdEntryIds.push(taxJE.id)
    }

    // 3. Create result transfer entry (8999 -> 2099)
    if (preview.resultTransferEntry.lines.length > 0) {
      const transferInput: CreateJournalEntryInput = {
        fiscal_period_id: closing.fiscal_period_id,
        entry_date: period.period_end,
        description: preview.resultTransferEntry.description,
        source_type: 'year_end',
        voucher_series: 'B',
        lines: preview.resultTransferEntry.lines.map((l) => ({
          account_number: l.account,
          debit_amount: l.debit,
          credit_amount: l.credit,
          line_description: l.accountName,
        })),
      }

      const transferJE = await createJournalEntry(userId, transferInput)
      createdEntryIds.push(transferJE.id)
    }

    // Update the closing record
    const { error: updateError } = await supabase
      .from('year_end_closings')
      .update({
        status: 'closing',
        closing_journal_entry_id: createdEntryIds[0] || null,
        net_result: preview.netResult,
      })
      .eq('id', closingId)

    if (updateError) {
      throw new Error(`Kunde inte uppdatera bokslut: ${updateError.message}`)
    }

    return {
      closingEntryId: createdEntryIds[0] || '',
      netResult: preview.netResult,
    }
  } catch (err) {
    // Attempt rollback of created entries
    for (const entryId of createdEntryIds) {
      await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', entryId)
      await supabase.from('journal_entries').delete().eq('id', entryId)
    }
    throw err
  }
}

// ============================================================
// Opening Balances
// ============================================================

/**
 * Preview opening balances for the next fiscal period.
 */
export async function previewOpeningBalances(
  userId: string,
  closedPeriodId: string
): Promise<OpeningBalancePreview> {
  const { rows } = await generateTrialBalance(userId, closedPeriodId)

  // Only balance sheet accounts (class 1-2)
  const balanceSheetRows = rows.filter(
    (r) => r.account_class >= 1 && r.account_class <= 2
  )

  const entries: ClosingEntryLine[] = []

  for (const row of balanceSheetRows) {
    const netBalance = row.closing_debit - row.closing_credit
    if (Math.abs(netBalance) < 0.005) continue

    if (netBalance > 0) {
      entries.push({
        account: row.account_number,
        accountName: row.account_name,
        debit: Math.round(netBalance * 100) / 100,
        credit: 0,
      })
    } else {
      entries.push({
        account: row.account_number,
        accountName: row.account_name,
        debit: 0,
        credit: Math.round(Math.abs(netBalance) * 100) / 100,
      })
    }
  }

  const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0)
  const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0)

  return {
    entries,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    periodName: '',
  }
}

/**
 * Generate opening balances for the next fiscal period.
 * Creates a journal entry with opening balances based on closing balances.
 */
export async function generateOpeningBalances(
  userId: string,
  closingId: string
): Promise<{ entryId: string; newPeriodId: string }> {
  const supabase = await createClient()

  // Fetch closing record
  const { data: closing, error: closingError } = await supabase
    .from('year_end_closings')
    .select('*, fiscal_period:fiscal_periods(*)')
    .eq('id', closingId)
    .eq('user_id', userId)
    .single()

  if (closingError || !closing) {
    throw new Error('Bokslut hittades inte')
  }

  const closedPeriod = closing.fiscal_period
  if (!closedPeriod) {
    throw new Error('Räkenskapsår saknas')
  }

  // Find or create the next fiscal period
  const nextStart = addOneDay(closedPeriod.period_end)
  const nextEnd = addOneYear(closedPeriod.period_end)

  let { data: nextPeriod } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('user_id', userId)
    .eq('period_start', nextStart)
    .single()

  if (!nextPeriod) {
    // Create next period
    const periodYear = new Date(nextStart).getFullYear()
    const { data: created, error: createError } = await supabase
      .from('fiscal_periods')
      .insert({
        user_id: userId,
        name: `Räkenskapsår ${periodYear}`,
        period_start: nextStart,
        period_end: nextEnd,
        is_closed: false,
        opening_balances_set: false,
      })
      .select()
      .single()

    if (createError || !created) {
      throw new Error(`Kunde inte skapa nästa räkenskapsår: ${createError?.message}`)
    }

    nextPeriod = created
  }

  // Generate opening balance entries
  const preview = await previewOpeningBalances(userId, closing.fiscal_period_id)

  if (preview.entries.length === 0) {
    throw new Error('Inga balanser att överföra')
  }

  // Create opening balance journal entry
  const openingInput: CreateJournalEntryInput = {
    fiscal_period_id: nextPeriod.id,
    entry_date: nextStart,
    description: `Ingående balanser från ${closedPeriod.name}`,
    source_type: 'opening_balance',
    voucher_series: 'A',
    lines: preview.entries.map((e) => ({
      account_number: e.account,
      debit_amount: e.debit,
      credit_amount: e.credit,
      line_description: `IB ${e.accountName || e.account}`,
    })),
  }

  const openingEntry = await createJournalEntry(userId, openingInput)

  // Update the next period
  await supabase
    .from('fiscal_periods')
    .update({ opening_balances_set: true })
    .eq('id', nextPeriod.id)

  // Update the closing record
  await supabase
    .from('year_end_closings')
    .update({
      opening_balance_entry_id: openingEntry.id,
    })
    .eq('id', closingId)

  return {
    entryId: openingEntry.id,
    newPeriodId: nextPeriod.id,
  }
}

// ============================================================
// Period Locking
// ============================================================

/**
 * Lock (close) a fiscal period so no more entries can be posted.
 */
export async function closeFiscalPeriod(
  userId: string,
  closingId: string
): Promise<void> {
  const supabase = await createClient()

  const { data: closing, error } = await supabase
    .from('year_end_closings')
    .select('fiscal_period_id')
    .eq('id', closingId)
    .eq('user_id', userId)
    .single()

  if (error || !closing) {
    throw new Error('Bokslut hittades inte')
  }

  // Lock the fiscal period
  const { error: lockError } = await supabase
    .from('fiscal_periods')
    .update({
      is_closed: true,
      closed_at: new Date().toISOString(),
    })
    .eq('id', closing.fiscal_period_id)
    .eq('user_id', userId)

  if (lockError) {
    throw new Error(`Kunde inte låsa räkenskapsåret: ${lockError.message}`)
  }

  // Mark closing as completed
  const { error: completeError } = await supabase
    .from('year_end_closings')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', closingId)

  if (completeError) {
    throw new Error(`Kunde inte markera bokslut som klart: ${completeError.message}`)
  }
}

// ============================================================
// Helpers
// ============================================================

function addOneDay(dateStr: string): string {
  const date = new Date(dateStr)
  date.setDate(date.getDate() + 1)
  return date.toISOString().split('T')[0]
}

function addOneYear(dateStr: string): string {
  const date = new Date(dateStr)
  date.setFullYear(date.getFullYear() + 1)
  return date.toISOString().split('T')[0]
}

/**
 * Get a summary of trial balance verification for display.
 */
export async function getTrialBalanceCheck(
  userId: string,
  fiscalPeriodId: string
): Promise<{
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
  isBalanced: boolean
  difference: number
  accountCount: number
}> {
  const result = await generateTrialBalance(userId, fiscalPeriodId)
  return {
    ...result,
    difference: Math.round(Math.abs(result.totalDebit - result.totalCredit) * 100) / 100,
    accountCount: result.rows.length,
  }
}
