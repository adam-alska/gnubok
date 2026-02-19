/**
 * Depreciation Engine for Fixed Assets (Anläggningsregister)
 *
 * Provides mathematically precise depreciation calculations for auditable
 * Swedish accounting. All monetary values use 2 decimal places rounded
 * via banker's rounding to avoid cumulative drift.
 */

import type {
  Asset,
  ComputedScheduleEntry,
  AssetDisposalInput,
  DepreciationPostingPreview,
  MonthlyPostingResult,
} from '@/types/fixed-assets'

// ---------------------------------------------------------------------------
// Utility: precise 2-decimal rounding (half-even / banker's rounding)
// ---------------------------------------------------------------------------
function round2(value: number): number {
  // Use toFixed(2) and parse to ensure consistent 2-decimal rounding.
  // JavaScript's toFixed uses "round half to even" in most engines,
  // but for safety we implement explicit half-even.
  const factor = 100
  const shifted = value * factor
  const truncated = Math.trunc(shifted)
  const remainder = Math.abs(shifted - truncated)

  if (remainder > 0.5) {
    return (truncated + Math.sign(shifted)) / factor
  } else if (remainder < 0.5) {
    return truncated / factor
  } else {
    // Exactly 0.5 => round to even
    if (truncated % 2 === 0) {
      return truncated / factor
    }
    return (truncated + Math.sign(shifted)) / factor
  }
}

// ---------------------------------------------------------------------------
// Helper: get first day of the month from a Date
// ---------------------------------------------------------------------------
function firstOfMonth(year: number, month: number): string {
  const m = String(month).padStart(2, '0')
  return `${year}-${m}-01`
}

// ---------------------------------------------------------------------------
// Helper: count days in a given month/year
// ---------------------------------------------------------------------------
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// ---------------------------------------------------------------------------
// generateDepreciationSchedule
// ---------------------------------------------------------------------------
/**
 * Generates the complete depreciation schedule for an asset from acquisition
 * through the end of its useful life.
 *
 * - Straight line: (cost - residual) / useful_life_months per full month,
 *   with pro-rata for the first partial month.
 * - Declining balance: book_value * (rate / 100 / 12) per month, automatically
 *   switching to straight-line when that yields higher depreciation.
 *
 * The final month absorbs any rounding remainder so the book value lands
 * exactly on the residual value.
 */
export function generateDepreciationSchedule(asset: Asset): ComputedScheduleEntry[] {
  const acquisitionCost = Number(asset.acquisition_cost)
  const residualValue = Number(asset.residual_value) || 0
  const usefulLifeMonths = asset.useful_life_months
  const depreciableAmount = acquisitionCost - residualValue

  if (depreciableAmount <= 0 || usefulLifeMonths <= 0) {
    return []
  }

  const acqDate = new Date(asset.acquisition_date + 'T00:00:00')
  const acqYear = acqDate.getFullYear()
  const acqMonth = acqDate.getMonth() + 1 // 1-based
  const acqDay = acqDate.getDate()

  switch (asset.depreciation_method) {
    case 'declining_balance':
      return generateDecliningBalance(
        acquisitionCost,
        residualValue,
        depreciableAmount,
        usefulLifeMonths,
        Number(asset.declining_balance_rate) || 20,
        acqYear,
        acqMonth,
        acqDay
      )
    case 'straight_line':
    default:
      return generateStraightLine(
        acquisitionCost,
        residualValue,
        depreciableAmount,
        usefulLifeMonths,
        acqYear,
        acqMonth,
        acqDay
      )
  }
}

// ---------------------------------------------------------------------------
// Straight-line schedule
// ---------------------------------------------------------------------------
function generateStraightLine(
  acquisitionCost: number,
  residualValue: number,
  depreciableAmount: number,
  usefulLifeMonths: number,
  acqYear: number,
  acqMonth: number,
  acqDay: number
): ComputedScheduleEntry[] {
  const schedule: ComputedScheduleEntry[] = []
  const monthlyFull = round2(depreciableAmount / usefulLifeMonths)

  // Pro-rata fraction for the first month.
  // If acquired on the 1st, it counts as a full month.
  const totalDaysFirstMonth = daysInMonth(acqYear, acqMonth)
  const remainingDays = totalDaysFirstMonth - acqDay + 1
  const firstMonthFraction = remainingDays / totalDaysFirstMonth
  const firstMonthAmount = round2(monthlyFull * firstMonthFraction)

  // We may need an extra month if the first month is partial.
  // The total number of schedule entries accounts for the partial first month
  // plus enough full months to cover the useful life.
  const isPartialFirst = acqDay > 1
  const totalEntries = isPartialFirst ? usefulLifeMonths + 1 : usefulLifeMonths

  let accumulated = 0
  let year = acqYear
  let month = acqMonth

  for (let i = 0; i < totalEntries; i++) {
    let amount: number

    if (i === 0) {
      amount = firstMonthAmount
    } else if (i === totalEntries - 1) {
      // Final month: absorb rounding remainder
      amount = round2(depreciableAmount - accumulated)
    } else {
      amount = monthlyFull
    }

    // Ensure we never over-depreciate
    if (accumulated + amount > depreciableAmount) {
      amount = round2(depreciableAmount - accumulated)
    }
    if (amount < 0) amount = 0

    accumulated = round2(accumulated + amount)
    const bookValue = round2(acquisitionCost - accumulated)

    schedule.push({
      period_date: firstOfMonth(year, month),
      depreciation_amount: amount,
      accumulated_depreciation: accumulated,
      book_value: Math.max(bookValue, residualValue),
    })

    // Advance to next month
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }

  return schedule
}

// ---------------------------------------------------------------------------
// Declining balance schedule (with automatic switch to straight-line)
// ---------------------------------------------------------------------------
function generateDecliningBalance(
  acquisitionCost: number,
  residualValue: number,
  depreciableAmount: number,
  usefulLifeMonths: number,
  annualRate: number,
  acqYear: number,
  acqMonth: number,
  acqDay: number
): ComputedScheduleEntry[] {
  const schedule: ComputedScheduleEntry[] = []
  const monthlyRate = annualRate / 100 / 12

  // Pro-rata first month
  const totalDaysFirstMonth = daysInMonth(acqYear, acqMonth)
  const remainingDays = totalDaysFirstMonth - acqDay + 1
  const firstMonthFraction = remainingDays / totalDaysFirstMonth

  let accumulated = 0
  let bookValue = acquisitionCost
  let year = acqYear
  let month = acqMonth
  let switchedToStraightLine = false

  // Maximum schedule entries: useful life + 1 for partial month, capped at a
  // reasonable upper bound to prevent infinite loops.
  const maxEntries = usefulLifeMonths + 12
  const isPartialFirst = acqDay > 1

  for (let i = 0; i < maxEntries; i++) {
    if (bookValue <= residualValue + 0.005) break

    const remainingMonths = isPartialFirst
      ? usefulLifeMonths + 1 - i
      : usefulLifeMonths - i

    if (remainingMonths <= 0) break

    // Declining balance amount
    let decliningAmount: number
    if (i === 0 && isPartialFirst) {
      decliningAmount = round2(bookValue * monthlyRate * firstMonthFraction)
    } else {
      decliningAmount = round2(bookValue * monthlyRate)
    }

    // Straight-line amount for the remaining period
    const slAmount = round2((bookValue - residualValue) / Math.max(remainingMonths, 1))

    let amount: number

    // Switch to straight-line when it yields a higher or equal amount
    if (!switchedToStraightLine && slAmount >= decliningAmount) {
      switchedToStraightLine = true
    }

    if (switchedToStraightLine) {
      amount = slAmount
    } else {
      amount = decliningAmount
    }

    // First month pro-rata for straight-line path after switch
    if (i === 0 && isPartialFirst && switchedToStraightLine) {
      amount = round2(amount * firstMonthFraction)
    }

    // Ensure we don't depreciate below residual value
    if (bookValue - amount < residualValue) {
      amount = round2(bookValue - residualValue)
    }
    if (amount < 0) amount = 0

    accumulated = round2(accumulated + amount)
    bookValue = round2(acquisitionCost - accumulated)

    schedule.push({
      period_date: firstOfMonth(year, month),
      depreciation_amount: amount,
      accumulated_depreciation: accumulated,
      book_value: Math.max(bookValue, residualValue),
    })

    month++
    if (month > 12) {
      month = 1
      year++
    }
  }

  return schedule
}

// ---------------------------------------------------------------------------
// calculateBookValue
// ---------------------------------------------------------------------------
/**
 * Calculate the book value of an asset as of a given date by summing
 * depreciation entries up to and including that date.
 */
export function calculateBookValue(
  asset: Asset,
  asOfDate: string
): { bookValue: number; accumulatedDepreciation: number } {
  const schedule = generateDepreciationSchedule(asset)
  let accumulated = 0

  for (const entry of schedule) {
    if (entry.period_date <= asOfDate) {
      accumulated = entry.accumulated_depreciation
    } else {
      break
    }
  }

  return {
    bookValue: round2(Number(asset.acquisition_cost) - accumulated),
    accumulatedDepreciation: accumulated,
  }
}

// ---------------------------------------------------------------------------
// getMonthlyDepreciationPreview
// ---------------------------------------------------------------------------
/**
 * Preview what will be posted for a given month. Builds a preview list of
 * all active assets that have an unposted schedule entry for the given period.
 *
 * @param year - Calendar year
 * @param month - Calendar month (1-12)
 * @param supabase - Supabase client instance
 */
export async function getMonthlyDepreciationPreview(
  year: number,
  month: number,
  supabase: SupabaseClient
): Promise<DepreciationPostingPreview[]> {
  const periodDate = firstOfMonth(year, month)

  const { data: entries, error } = await supabase
    .from('depreciation_schedule')
    .select(`
      id,
      asset_id,
      period_date,
      depreciation_amount,
      assets!inner (
        id,
        asset_number,
        name,
        status,
        category_id,
        asset_categories (
          name,
          expense_account,
          depreciation_account
        )
      )
    `)
    .eq('period_date', periodDate)
    .eq('is_posted', false)

  if (error || !entries) return []

  return entries
    .filter((e: ScheduleEntryWithAsset) => e.assets?.status === 'active')
    .map((e: ScheduleEntryWithAsset) => ({
      asset_id: e.asset_id,
      asset_number: e.assets.asset_number,
      asset_name: e.assets.name,
      category_name: e.assets.asset_categories?.name || 'Okategoriserad',
      expense_account: e.assets.asset_categories?.expense_account || '7831',
      depreciation_account: e.assets.asset_categories?.depreciation_account || '1219',
      depreciation_amount: Number(e.depreciation_amount),
      period_date: e.period_date,
    }))
}

// ---------------------------------------------------------------------------
// postMonthlyDepreciation
// ---------------------------------------------------------------------------
/**
 * Post depreciation journal entries for a given month.
 * Creates one journal entry per asset with:
 *   - Debit: expense account (e.g. 7831 Avskrivning maskiner)
 *   - Credit: accumulated depreciation account (e.g. 1219 Ack. avskr. maskiner)
 * Marks the schedule entries as posted.
 */
export async function postMonthlyDepreciation(
  year: number,
  month: number,
  supabase: SupabaseClient
): Promise<MonthlyPostingResult> {
  const periodDate = firstOfMonth(year, month)
  const entryDate = periodDate // Post on the first of the period month

  // Get the user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Find the active fiscal period that contains this date
  const { data: fiscalPeriod } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', user.id)
    .lte('period_start', entryDate)
    .gte('period_end', entryDate)
    .single()

  if (!fiscalPeriod) {
    throw new Error(`Ingen räkenskapsperiod hittad för ${year}-${String(month).padStart(2, '0')}`)
  }

  // Get all unposted schedule entries for this period
  const { data: entries, error } = await supabase
    .from('depreciation_schedule')
    .select(`
      id,
      asset_id,
      depreciation_amount,
      assets!inner (
        id,
        user_id,
        asset_number,
        name,
        status,
        category_id,
        asset_categories (
          name,
          expense_account,
          depreciation_account
        )
      )
    `)
    .eq('period_date', periodDate)
    .eq('is_posted', false)

  if (error) throw new Error(error.message)

  const activeEntries = (entries || []).filter(
    (e: ScheduleEntryWithAsset) =>
      e.assets?.status === 'active' && e.assets?.user_id === user.id
  )

  if (activeEntries.length === 0) {
    return { posted_count: 0, total_amount: 0, journal_entry_ids: [] }
  }

  const journalEntryIds: string[] = []
  let totalAmount = 0

  // Get next voucher number
  const { data: lastEntry } = await supabase
    .from('journal_entries')
    .select('voucher_number')
    .eq('user_id', user.id)
    .eq('voucher_series', 'AV')
    .order('voucher_number', { ascending: false })
    .limit(1)
    .single()

  let nextVoucher = (lastEntry?.voucher_number || 0) + 1

  for (const entry of activeEntries) {
    const amount = Number(entry.depreciation_amount)
    const expenseAccount = entry.assets.asset_categories?.expense_account || '7831'
    const depreciationAccount = entry.assets.asset_categories?.depreciation_account || '1219'
    const assetName = entry.assets.name
    const assetNumber = entry.assets.asset_number

    // Create journal entry
    const { data: journalEntry, error: jeError } = await supabase
      .from('journal_entries')
      .insert({
        user_id: user.id,
        fiscal_period_id: fiscalPeriod.id,
        voucher_number: nextVoucher,
        voucher_series: 'AV',
        entry_date: entryDate,
        description: `Avskrivning ${assetName} (${assetNumber}) ${year}-${String(month).padStart(2, '0')}`,
        source_type: 'manual',
        status: 'posted',
      })
      .select('id')
      .single()

    if (jeError || !journalEntry) {
      console.error(`Failed to create journal entry for asset ${assetNumber}:`, jeError)
      continue
    }

    // Create journal entry lines
    const { error: lineError } = await supabase
      .from('journal_entry_lines')
      .insert([
        {
          journal_entry_id: journalEntry.id,
          account_number: expenseAccount,
          debit_amount: amount,
          credit_amount: 0,
          line_description: `Avskrivning ${assetName}`,
          sort_order: 0,
        },
        {
          journal_entry_id: journalEntry.id,
          account_number: depreciationAccount,
          debit_amount: 0,
          credit_amount: amount,
          line_description: `Ackumulerad avskrivning ${assetName}`,
          sort_order: 1,
        },
      ])

    if (lineError) {
      console.error(`Failed to create journal lines for asset ${assetNumber}:`, lineError)
      continue
    }

    // Mark schedule entry as posted
    await supabase
      .from('depreciation_schedule')
      .update({ is_posted: true, journal_entry_id: journalEntry.id })
      .eq('id', entry.id)

    journalEntryIds.push(journalEntry.id)
    totalAmount = round2(totalAmount + amount)
    nextVoucher++
  }

  return {
    posted_count: journalEntryIds.length,
    total_amount: totalAmount,
    journal_entry_ids: journalEntryIds,
  }
}

// ---------------------------------------------------------------------------
// disposeAsset
// ---------------------------------------------------------------------------
/**
 * Dispose of an asset (sell, scrap, or write off).
 *
 * Journal entries for disposal:
 *
 * SOLD:
 *   Debit  1930 (Bank)                    = disposal_amount
 *   Debit  accumulated depreciation acct  = total accumulated
 *   Credit asset account                  = acquisition_cost
 *   Debit/Credit 7970 (Vinst/förlust)     = difference
 *
 * SCRAPPED / WRITTEN OFF:
 *   Debit  accumulated depreciation acct  = total accumulated
 *   Debit  7970 (Förlust vid avyttring)   = remaining book value
 *   Credit asset account                  = acquisition_cost
 */
export async function disposeAsset(
  assetId: string,
  input: AssetDisposalInput,
  supabase: SupabaseClient
): Promise<{ success: boolean; journal_entry_id?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  // Fetch asset with category
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('*, asset_categories(*)')
    .eq('id', assetId)
    .eq('user_id', user.id)
    .single()

  if (assetError || !asset) {
    return { success: false, error: 'Tillgång hittades inte' }
  }

  if (asset.status !== 'active' && asset.status !== 'fully_depreciated') {
    return { success: false, error: 'Tillgången kan inte avyttras i nuvarande status' }
  }

  const category = asset.asset_categories
  const assetAccount = category?.asset_account || '1210'
  const depreciationAccount = category?.depreciation_account || '1219'
  const acquisitionCost = Number(asset.acquisition_cost)

  // Calculate accumulated depreciation up to disposal date
  const { accumulatedDepreciation } = calculateBookValue(asset as Asset, input.disposal_date)
  const bookValue = round2(acquisitionCost - accumulatedDepreciation)
  const disposalAmount = Number(input.disposal_amount) || 0

  // Find fiscal period
  const { data: fiscalPeriod } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('user_id', user.id)
    .lte('period_start', input.disposal_date)
    .gte('period_end', input.disposal_date)
    .single()

  if (!fiscalPeriod) {
    return { success: false, error: 'Ingen räkenskapsperiod hittad för avyttringsdatumet' }
  }

  // Get next voucher number
  const { data: lastEntry } = await supabase
    .from('journal_entries')
    .select('voucher_number')
    .eq('user_id', user.id)
    .eq('voucher_series', 'AV')
    .order('voucher_number', { ascending: false })
    .limit(1)
    .single()

  const nextVoucher = (lastEntry?.voucher_number || 0) + 1

  const description =
    input.disposal_type === 'sold'
      ? `Försäljning av ${asset.name} (${asset.asset_number})`
      : input.disposal_type === 'scrapped'
        ? `Utrangering av ${asset.name} (${asset.asset_number})`
        : `Nedskrivning av ${asset.name} (${asset.asset_number})`

  // Create journal entry
  const { data: journalEntry, error: jeError } = await supabase
    .from('journal_entries')
    .insert({
      user_id: user.id,
      fiscal_period_id: fiscalPeriod.id,
      voucher_number: nextVoucher,
      voucher_series: 'AV',
      entry_date: input.disposal_date,
      description,
      source_type: 'manual',
      status: 'posted',
    })
    .select('id')
    .single()

  if (jeError || !journalEntry) {
    return { success: false, error: 'Kunde inte skapa verifikation' }
  }

  // Build journal lines
  const lines: Array<{
    journal_entry_id: string
    account_number: string
    debit_amount: number
    credit_amount: number
    line_description: string
    sort_order: number
  }> = []

  let sortOrder = 0

  if (input.disposal_type === 'sold') {
    // Debit bank for sale amount
    if (disposalAmount > 0) {
      lines.push({
        journal_entry_id: journalEntry.id,
        account_number: '1930',
        debit_amount: disposalAmount,
        credit_amount: 0,
        line_description: `Försäljningslikvid ${asset.name}`,
        sort_order: sortOrder++,
      })
    }

    // Debit accumulated depreciation
    if (accumulatedDepreciation > 0) {
      lines.push({
        journal_entry_id: journalEntry.id,
        account_number: depreciationAccount,
        debit_amount: accumulatedDepreciation,
        credit_amount: 0,
        line_description: `Ackumulerad avskrivning ${asset.name}`,
        sort_order: sortOrder++,
      })
    }

    // Credit asset account for acquisition cost
    lines.push({
      journal_entry_id: journalEntry.id,
      account_number: assetAccount,
      debit_amount: 0,
      credit_amount: acquisitionCost,
      line_description: `Anskaffningsvärde ${asset.name}`,
      sort_order: sortOrder++,
    })

    // Gain or loss: disposal_amount - book_value
    const gainLoss = round2(disposalAmount - bookValue)
    if (gainLoss > 0) {
      // Gain (credit 7970)
      lines.push({
        journal_entry_id: journalEntry.id,
        account_number: '7970',
        debit_amount: 0,
        credit_amount: gainLoss,
        line_description: `Vinst vid avyttring ${asset.name}`,
        sort_order: sortOrder++,
      })
    } else if (gainLoss < 0) {
      // Loss (debit 7970)
      lines.push({
        journal_entry_id: journalEntry.id,
        account_number: '7970',
        debit_amount: Math.abs(gainLoss),
        credit_amount: 0,
        line_description: `Förlust vid avyttring ${asset.name}`,
        sort_order: sortOrder++,
      })
    }
  } else {
    // Scrapped or written off
    // Debit accumulated depreciation
    if (accumulatedDepreciation > 0) {
      lines.push({
        journal_entry_id: journalEntry.id,
        account_number: depreciationAccount,
        debit_amount: accumulatedDepreciation,
        credit_amount: 0,
        line_description: `Ackumulerad avskrivning ${asset.name}`,
        sort_order: sortOrder++,
      })
    }

    // Debit loss account for remaining book value
    if (bookValue > 0) {
      lines.push({
        journal_entry_id: journalEntry.id,
        account_number: '7970',
        debit_amount: bookValue,
        credit_amount: 0,
        line_description: `Förlust vid utrangering ${asset.name}`,
        sort_order: sortOrder++,
      })
    }

    // Credit asset account for acquisition cost
    lines.push({
      journal_entry_id: journalEntry.id,
      account_number: assetAccount,
      debit_amount: 0,
      credit_amount: acquisitionCost,
      line_description: `Anskaffningsvärde ${asset.name}`,
      sort_order: sortOrder++,
    })
  }

  // Insert journal lines
  const { error: lineError } = await supabase
    .from('journal_entry_lines')
    .insert(lines)

  if (lineError) {
    return { success: false, error: 'Kunde inte skapa verifikationsrader' }
  }

  // Update asset status
  const newStatus = input.disposal_type === 'sold' ? 'sold' : input.disposal_type === 'scrapped' ? 'disposed' : 'written_off'

  await supabase
    .from('assets')
    .update({
      status: newStatus,
      disposed_at: input.disposal_date,
      disposal_amount: disposalAmount,
      disposal_journal_entry_id: journalEntry.id,
    })
    .eq('id', assetId)

  // Delete any future unposted depreciation schedule entries
  await supabase
    .from('depreciation_schedule')
    .delete()
    .eq('asset_id', assetId)
    .eq('is_posted', false)
    .gt('period_date', input.disposal_date)

  return { success: true, journal_entry_id: journalEntry.id }
}

// ---------------------------------------------------------------------------
// generateAndSaveSchedule
// ---------------------------------------------------------------------------
/**
 * Generate the depreciation schedule for an asset and save it to the database.
 */
export async function generateAndSaveSchedule(
  asset: Asset,
  supabase: SupabaseClient
): Promise<void> {
  const schedule = generateDepreciationSchedule(asset)

  if (schedule.length === 0) return

  const rows = schedule.map((entry) => ({
    asset_id: asset.id,
    period_date: entry.period_date,
    depreciation_amount: entry.depreciation_amount,
    accumulated_depreciation: entry.accumulated_depreciation,
    book_value: entry.book_value,
    is_posted: false,
  }))

  // Insert in batches of 100 to avoid payload limits
  const batchSize = 100
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase
      .from('depreciation_schedule')
      .insert(batch)

    if (error) {
      throw new Error(`Kunde inte spara avskrivningsplan: ${error.message}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Type for Supabase client (to avoid importing the full Supabase types)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScheduleEntryWithAsset = any
