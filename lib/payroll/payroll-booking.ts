/**
 * Payroll Bookkeeping Integration
 *
 * Creates journal entries (verifikationer) from approved salary runs
 * using the Swedish BAS account plan.
 *
 * Standard salary booking:
 * - Debit 7210 (Löner tjänsteman) - gross salary
 * - Debit 7510 (Arbetsgivaravgifter) - employer tax
 * - Debit 7290 (Förändring semesterlöneskuld) - vacation pay accrual
 * - Credit 2710 (Personalskatt) - preliminary tax
 * - Credit 2730 (Arbetsgivaravgifter skuld) - employer tax payable
 * - Credit 2920 (Semesterlöneskuld) - vacation pay liability
 * - Credit 1930 (Företagskonto/bank) - net salary paid
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// BAS Account numbers for payroll
const ACCOUNTS = {
  LONER_TJANSTEMAN: '7210',       // Löner till tjänsteman
  ARBETSGIVARAVGIFTER: '7510',    // Lagstadgade arbetsgivaravgifter
  SEMESTERLON_FORANDRING: '7290', // Förändring semesterlöneskuld
  PERSONALSKATT: '2710',          // Personalens källskatt
  ARBETSGIVARAVGIFTER_SKULD: '2730', // Lagstadgade sociala avgifter
  SEMESTERLON_SKULD: '2920',      // Upplupen semesterlön
  FORETAGSKONTO: '1930',          // Företagskonto / bank
} as const

/**
 * Create a journal entry from an approved salary run.
 *
 * @param salaryRunId - The salary run to create entries for
 * @param supabase - Supabase client
 * @returns The created journal entry ID
 */
export async function createSalaryJournalEntry(
  salaryRunId: string,
  supabase: SupabaseClient
): Promise<string> {
  // Fetch the salary run with its items
  const { data: salaryRun, error: runError } = await supabase
    .from('salary_runs')
    .select('*')
    .eq('id', salaryRunId)
    .single()

  if (runError || !salaryRun) {
    throw new Error('Lönekörning hittades inte')
  }

  if (salaryRun.status !== 'calculated') {
    throw new Error('Lönekörningen måste vara beräknad innan den kan godkännas')
  }

  // Fetch items to get vacation pay total
  const { data: items, error: itemsError } = await supabase
    .from('salary_run_items')
    .select('vacation_pay_accrued')
    .eq('salary_run_id', salaryRunId)

  if (itemsError) {
    throw new Error(`Kunde inte hämta löneposter: ${itemsError.message}`)
  }

  const totalVacationPay = (items || []).reduce(
    (sum: number, item: { vacation_pay_accrued: number }) =>
      sum + (Number(item.vacation_pay_accrued) || 0),
    0
  )

  const totalGross = Number(salaryRun.total_gross) || 0
  const totalNet = Number(salaryRun.total_net) || 0
  const totalEmployerTax = Number(salaryRun.total_employer_tax) || 0
  const totalPreliminaryTax = Number(salaryRun.total_preliminary_tax) || 0
  const vacationPay = Math.round(totalVacationPay * 100) / 100

  // Get the user's current open fiscal period
  const { data: fiscalPeriod, error: fpError } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', salaryRun.user_id)
    .eq('is_closed', false)
    .lte('period_start', salaryRun.payment_date)
    .gte('period_end', salaryRun.payment_date)
    .single()

  if (fpError || !fiscalPeriod) {
    throw new Error('Ingen öppen räkenskapsperiod hittades för utbetalningsdatumet')
  }

  // Get next voucher number
  const { data: maxVoucher } = await supabase
    .from('journal_entries')
    .select('voucher_number')
    .eq('user_id', salaryRun.user_id)
    .eq('fiscal_period_id', fiscalPeriod.id)
    .eq('voucher_series', 'L') // L för lön (salary)
    .order('voucher_number', { ascending: false })
    .limit(1)
    .single()

  const nextVoucherNumber = maxVoucher ? maxVoucher.voucher_number + 1 : 1

  const monthName = getSwedishMonth(salaryRun.period_month)
  const description = `Lön ${monthName} ${salaryRun.period_year}`

  // Create journal entry
  const { data: journalEntry, error: jeError } = await supabase
    .from('journal_entries')
    .insert({
      user_id: salaryRun.user_id,
      fiscal_period_id: fiscalPeriod.id,
      voucher_number: nextVoucherNumber,
      voucher_series: 'L',
      entry_date: salaryRun.payment_date,
      description,
      source_type: 'salary_payment',
      source_id: salaryRunId,
      status: 'posted',
    })
    .select('id')
    .single()

  if (jeError || !journalEntry) {
    throw new Error(`Kunde inte skapa verifikation: ${jeError?.message}`)
  }

  // Build journal entry lines
  const lines: Array<{
    journal_entry_id: string
    account_number: string
    debit_amount: number
    credit_amount: number
    line_description: string
    sort_order: number
  }> = []

  let sortOrder = 0

  // Debit 7210 - Gross salary
  if (totalGross > 0) {
    lines.push({
      journal_entry_id: journalEntry.id,
      account_number: ACCOUNTS.LONER_TJANSTEMAN,
      debit_amount: Math.round(totalGross * 100) / 100,
      credit_amount: 0,
      line_description: `Bruttolön ${monthName}`,
      sort_order: sortOrder++,
    })
  }

  // Debit 7510 - Employer tax
  if (totalEmployerTax > 0) {
    lines.push({
      journal_entry_id: journalEntry.id,
      account_number: ACCOUNTS.ARBETSGIVARAVGIFTER,
      debit_amount: Math.round(totalEmployerTax * 100) / 100,
      credit_amount: 0,
      line_description: `Arbetsgivaravgifter ${monthName}`,
      sort_order: sortOrder++,
    })
  }

  // Debit 7290 - Vacation pay accrual
  if (vacationPay > 0) {
    lines.push({
      journal_entry_id: journalEntry.id,
      account_number: ACCOUNTS.SEMESTERLON_FORANDRING,
      debit_amount: Math.round(vacationPay * 100) / 100,
      credit_amount: 0,
      line_description: `Semesterlöneskuld ${monthName}`,
      sort_order: sortOrder++,
    })
  }

  // Credit 2710 - Preliminary tax
  if (totalPreliminaryTax > 0) {
    lines.push({
      journal_entry_id: journalEntry.id,
      account_number: ACCOUNTS.PERSONALSKATT,
      debit_amount: 0,
      credit_amount: Math.round(totalPreliminaryTax * 100) / 100,
      line_description: `Preliminär skatt ${monthName}`,
      sort_order: sortOrder++,
    })
  }

  // Credit 2730 - Employer tax payable
  if (totalEmployerTax > 0) {
    lines.push({
      journal_entry_id: journalEntry.id,
      account_number: ACCOUNTS.ARBETSGIVARAVGIFTER_SKULD,
      debit_amount: 0,
      credit_amount: Math.round(totalEmployerTax * 100) / 100,
      line_description: `Arbetsgivaravgifter skuld ${monthName}`,
      sort_order: sortOrder++,
    })
  }

  // Credit 2920 - Vacation pay liability
  if (vacationPay > 0) {
    lines.push({
      journal_entry_id: journalEntry.id,
      account_number: ACCOUNTS.SEMESTERLON_SKULD,
      debit_amount: 0,
      credit_amount: Math.round(vacationPay * 100) / 100,
      line_description: `Semesterlöneskuld ${monthName}`,
      sort_order: sortOrder++,
    })
  }

  // Credit 1930 - Net salary (bank payment)
  if (totalNet > 0) {
    lines.push({
      journal_entry_id: journalEntry.id,
      account_number: ACCOUNTS.FORETAGSKONTO,
      debit_amount: 0,
      credit_amount: Math.round(totalNet * 100) / 100,
      line_description: `Nettolöner ${monthName}`,
      sort_order: sortOrder++,
    })
  }

  // Insert all lines
  const { error: linesError } = await supabase
    .from('journal_entry_lines')
    .insert(lines)

  if (linesError) {
    // Rollback: delete the journal entry
    await supabase.from('journal_entries').delete().eq('id', journalEntry.id)
    throw new Error(`Kunde inte skapa verifikationsrader: ${linesError.message}`)
  }

  // Update salary run with journal entry reference and approved status
  await supabase
    .from('salary_runs')
    .update({
      status: 'approved',
      journal_entry_id: journalEntry.id,
    })
    .eq('id', salaryRunId)

  return journalEntry.id
}

function getSwedishMonth(month: number): string {
  const months: Record<number, string> = {
    1: 'januari',
    2: 'februari',
    3: 'mars',
    4: 'april',
    5: 'maj',
    6: 'juni',
    7: 'juli',
    8: 'augusti',
    9: 'september',
    10: 'oktober',
    11: 'november',
    12: 'december',
  }
  return months[month] || ''
}
