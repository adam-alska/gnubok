import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import type {
  VatDeclaration,
  VatDeclarationRutor,
  VatPeriodType,
  AccountingMethod,
} from '@/types'

/**
 * Calculate VAT declaration (Momsdeklaration) for a given period.
 *
 * Reads directly from the general ledger — sums posted journal entry lines
 * on 26xx (VAT) and 3xxx (revenue) accounts for the period. This makes the
 * momsdeklaration a pure projection from the double-entry bookkeeping ledger.
 *
 * The accounting method (accrual vs cash) is already reflected in when
 * journal entries were created by the entry generators, so no separate
 * filtering logic is needed here.
 */

/**
 * Account-to-ruta mapping for the Swedish momsdeklaration (SKV 4700).
 *
 * Revenue (3001/3002/3003): net credit balance feeds ruta 05 (total domestic taxable sales).
 * Output VAT (2611/2621/2631): net credit balance feeds ruta 10/11/12 (output VAT per rate).
 * Input VAT (2641/2645): net debit balance feeds ruta 48.
 * EU/Export (3308/3305): net credit balance feeds ruta 39/40.
 */
const ACCOUNT_RUTA: Record<string, { box: keyof VatDeclarationRutor; side: 'credit' | 'debit' }> = {
  // Output VAT accounts → ruta 10/11/12
  '2611': { box: 'ruta10', side: 'credit' },
  '2621': { box: 'ruta11', side: 'credit' },
  '2631': { box: 'ruta12', side: 'credit' },
  // Reverse charge output VAT → ruta 30/31/32
  '2614': { box: 'ruta30', side: 'credit' },
  '2624': { box: 'ruta31', side: 'credit' },
  '2634': { box: 'ruta32', side: 'credit' },
  // Input VAT → ruta 48
  '2641': { box: 'ruta48', side: 'debit' },
  '2645': { box: 'ruta48', side: 'debit' },
  // Revenue accounts → ruta 05 (all domestic taxable sales combined)
  '3001': { box: 'ruta05', side: 'credit' },
  '3002': { box: 'ruta05', side: 'credit' },
  '3003': { box: 'ruta05', side: 'credit' },
  // EU/Export → ruta 39/40
  '3305': { box: 'ruta40', side: 'credit' },
  '3308': { box: 'ruta39', side: 'credit' },
}

const VAT_ACCOUNTS = Object.keys(ACCOUNT_RUTA)

/**
 * Calculate period start and end dates
 */
export function calculatePeriodDates(
  periodType: VatPeriodType,
  year: number,
  period: number
): { start: string; end: string } {
  let startMonth: number
  let endMonth: number

  switch (periodType) {
    case 'monthly':
      // period is 1-12
      startMonth = period
      endMonth = period
      break
    case 'quarterly':
      // period is 1-4
      startMonth = (period - 1) * 3 + 1
      endMonth = period * 3
      break
    case 'yearly':
      // period is 1
      startMonth = 1
      endMonth = 12
      break
    default:
      startMonth = 1
      endMonth = 12
  }

  const startDate = new Date(year, startMonth - 1, 1)
  const endDate = new Date(year, endMonth, 0) // Last day of end month

  return {
    start: formatDate(startDate),
    end: formatDate(endDate),
  }
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Round to 2 decimal places
 */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Calculate VAT declaration from the general ledger.
 *
 * Sums posted journal entry lines on 26xx and 3xxx accounts:
 *   - 3001/3002/3003 credit balance -> ruta 05 (total domestic taxable sales)
 *   - 2611/2621/2631 credit balance -> ruta 10/11/12 (output VAT per rate)
 *   - 2641/2645 debit balance -> ruta 48 (input VAT)
 *   - 3308/3305 credit balance -> ruta 39/40 (EU/export)
 *   - ruta 49 = (10 + 11 + 12) - 48
 *
 * The accounting method parameter is accepted for backward compatibility
 * but not used — the method is already baked into journal entry timing.
 */
export async function calculateVatDeclaration(
  supabase: SupabaseClient,
  userId: string,
  periodType: VatPeriodType,
  year: number,
  period: number,
  _accountingMethod: AccountingMethod = 'accrual'
): Promise<VatDeclaration> {
  const { start, end } = calculatePeriodDates(periodType, year, period)

  // Fetch all posted journal entry lines on VAT-relevant accounts for the period
  const lines = await fetchAllRows<{
    account_number: string
    debit_amount: number
    credit_amount: number
  }>(({ from, to }) =>
    supabase
      .from('journal_entry_lines')
      .select(`
        account_number,
        debit_amount,
        credit_amount,
        journal_entries!inner (user_id, entry_date, status)
      `)
      .in('account_number', VAT_ACCOUNTS)
      .eq('journal_entries.user_id', userId)
      .in('journal_entries.status', ['posted', 'reversed'])
      .gte('journal_entries.entry_date', start)
      .lte('journal_entries.entry_date', end)
      .range(from, to)
  )

  // Aggregate debit/credit totals per account
  const totals = new Map<string, { debit: number; credit: number }>()
  for (const line of lines) {
    const t = totals.get(line.account_number) || { debit: 0, credit: 0 }
    t.debit += Number(line.debit_amount) || 0
    t.credit += Number(line.credit_amount) || 0
    totals.set(line.account_number, t)
  }

  // Map account balances to momsdeklaration boxes
  const rutor: VatDeclarationRutor = {
    ruta05: 0, ruta06: 0, ruta07: 0, ruta08: 0,
    ruta10: 0, ruta11: 0, ruta12: 0,
    ruta20: 0, ruta21: 0, ruta22: 0, ruta23: 0, ruta24: 0,
    ruta30: 0, ruta31: 0, ruta32: 0,
    ruta35: 0, ruta36: 0, ruta37: 0, ruta38: 0,
    ruta39: 0, ruta40: 0, ruta41: 0, ruta42: 0,
    ruta48: 0, ruta49: 0,
    ruta50: 0, ruta60: 0, ruta61: 0, ruta62: 0,
  }

  for (const [account, mapping] of Object.entries(ACCOUNT_RUTA)) {
    const t = totals.get(account)
    if (!t) continue
    const balance = mapping.side === 'credit'
      ? t.credit - t.debit
      : t.debit - t.credit
    rutor[mapping.box] = round(rutor[mapping.box] + balance)
  }

  // FK009: summaMoms = (10 + 11 + 12 + 30 + 31 + 32 + 60 + 61 + 62) - 48
  rutor.ruta49 = round(
    rutor.ruta10 + rutor.ruta11 + rutor.ruta12 +
    rutor.ruta30 + rutor.ruta31 + rutor.ruta32 +
    rutor.ruta60 + rutor.ruta61 + rutor.ruta62 -
    rutor.ruta48
  )

  // Compute per-rate base amounts from individual revenue accounts
  const revenueByRate = {
    base25: 0,  // 3001
    base12: 0,  // 3002
    base6: 0,   // 3003
  }
  for (const [account, rate] of [['3001', 'base25'], ['3002', 'base12'], ['3003', 'base6']] as const) {
    const t = totals.get(account)
    if (t) revenueByRate[rate] = round(t.credit - t.debit)
  }

  // Calculate reverse charge purchase bases (ruta 20-24) from supplier invoices
  const rcBases = await calculateReverseChargeBases(supabase, userId, start, end)
  rutor.ruta20 = rcBases.ruta20
  rutor.ruta21 = rcBases.ruta21
  rutor.ruta22 = rcBases.ruta22
  rutor.ruta23 = rcBases.ruta23
  rutor.ruta24 = rcBases.ruta24

  // Count journal entries by source type for metadata
  const { data: entryCounts } = await supabase
    .from('journal_entries')
    .select('source_type')
    .eq('user_id', userId)
    .in('status', ['posted', 'reversed'])
    .gte('entry_date', start)
    .lte('entry_date', end)

  const invoiceSources = new Set([
    'invoice_created', 'invoice_paid', 'invoice_cash_payment', 'credit_note',
  ])
  let invoiceCount = 0
  let transactionCount = 0
  for (const e of entryCounts || []) {
    if (invoiceSources.has(e.source_type)) invoiceCount++
    else if (e.source_type === 'bank_transaction') transactionCount++
  }

  return {
    period: { type: periodType, year, period, start, end },
    rutor,
    invoiceCount,
    transactionCount,
    breakdown: {
      invoices: {
        ruta05: rutor.ruta05,
        ruta06: rutor.ruta06,
        ruta07: rutor.ruta07,
        ruta10: rutor.ruta10,
        ruta11: rutor.ruta11,
        ruta12: rutor.ruta12,
        ruta39: rutor.ruta39,
        ruta40: rutor.ruta40,
        base25: revenueByRate.base25,
        base12: revenueByRate.base12,
        base6: revenueByRate.base6,
      },
      transactions: { ruta48: rutor.ruta48 },
      receipts: { ruta48: 0 },
      reverseCharge: {
        ruta20: rutor.ruta20,
        ruta21: rutor.ruta21,
        ruta22: rutor.ruta22,
        ruta23: rutor.ruta23,
        ruta24: rutor.ruta24,
        ruta30: rutor.ruta30,
        ruta31: rutor.ruta31,
        ruta32: rutor.ruta32,
      },
    },
  }
}

/**
 * Calculate reverse charge purchase bases (ruta 20-24) from supplier invoices.
 *
 * Queries journal entries with supplier invoice source types, then looks up
 * the linked supplier invoices + suppliers to determine supplier_type and
 * sum item line_total (the net tax base in SEK).
 *
 * Classification (all reverse charge is currently services):
 *   eu_business     → ruta21 (services from EU)
 *   non_eu_business → ruta22 (services from outside EU)
 *   swedish_business → ruta24 (domestic reverse charge, e.g. construction)
 *   ruta20/23 (goods) → 0 for now (Tullverket path not implemented)
 */
async function calculateReverseChargeBases(
  supabase: SupabaseClient,
  userId: string,
  start: string,
  end: string,
): Promise<{ ruta20: number; ruta21: number; ruta22: number; ruta23: number; ruta24: number }> {
  const result = { ruta20: 0, ruta21: 0, ruta22: 0, ruta23: 0, ruta24: 0 }

  // Step 1: Find journal entries from supplier invoices in this period
  const supplierSourceTypes = [
    'supplier_invoice_registered',
    'supplier_invoice_cash_payment',
    'supplier_credit_note',
  ]
  const entries = await fetchAllRows<{
    id: string
    source_id: string
  }>(({ from, to }) =>
    supabase
      .from('journal_entries')
      .select('id, source_id')
      .eq('user_id', userId)
      .in('source_type', supplierSourceTypes)
      .eq('status', 'posted')
      .gte('entry_date', start)
      .lte('entry_date', end)
      .range(from, to)
  )

  if (entries.length === 0) return result

  const sourceIds = [...new Set(entries.map(e => e.source_id).filter(Boolean))]
  if (sourceIds.length === 0) return result

  // Step 2: Fetch supplier invoices that are reverse charge, with supplier type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = await fetchAllRows<Record<string, any>>(({ from, to }) =>
    supabase
      .from('supplier_invoices')
      .select('id, supplier_id, reverse_charge, is_credit_note, subtotal_sek, subtotal, currency, exchange_rate, suppliers!inner(supplier_type)')
      .in('id', sourceIds)
      .eq('reverse_charge', true)
      .eq('user_id', userId)
      .range(from, to)
  )

  if (invoices.length === 0) return result

  // Step 3: Sum tax bases by supplier type
  for (const inv of invoices) {
    // Use subtotal_sek if available, otherwise convert via exchange_rate
    let baseSek: number
    if (inv.subtotal_sek != null) {
      baseSek = Number(inv.subtotal_sek)
    } else if (inv.currency !== 'SEK' && inv.exchange_rate) {
      baseSek = Math.round(Number(inv.subtotal) * Number(inv.exchange_rate) * 100) / 100
    } else {
      baseSek = Number(inv.subtotal)
    }

    // Credit notes reduce the base
    if (inv.is_credit_note) baseSek = -baseSek

    // !inner join: Supabase returns the related row as an object (1-to-1 FK)
    const supplier = Array.isArray(inv.suppliers) ? inv.suppliers[0] : inv.suppliers
    const supplierType = supplier?.supplier_type as string
    switch (supplierType) {
      case 'eu_business':
        result.ruta21 = round(result.ruta21 + baseSek)
        break
      case 'non_eu_business':
        result.ruta22 = round(result.ruta22 + baseSek)
        break
      case 'swedish_business':
        result.ruta24 = round(result.ruta24 + baseSek)
        break
    }
  }

  return result
}

/**
 * Get a summary of the VAT declaration for display
 */
export function getVatDeclarationSummary(declaration: VatDeclaration): {
  totalOutputVat: number
  totalInputVat: number
  vatToPay: number
  isRefund: boolean
} {
  const totalOutputVat = round(
    declaration.rutor.ruta10 +
    declaration.rutor.ruta11 +
    declaration.rutor.ruta12 +
    declaration.rutor.ruta30 +
    declaration.rutor.ruta31 +
    declaration.rutor.ruta32 +
    declaration.rutor.ruta60 +
    declaration.rutor.ruta61 +
    declaration.rutor.ruta62
  )

  const totalInputVat = declaration.rutor.ruta48
  const vatToPay = declaration.rutor.ruta49

  return {
    totalOutputVat,
    totalInputVat,
    vatToPay,
    isRefund: vatToPay < 0,
  }
}

/**
 * Format period label for display
 */
export function formatPeriodLabel(
  periodType: VatPeriodType,
  year: number,
  period: number
): string {
  switch (periodType) {
    case 'monthly':
      const monthNames = [
        'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
        'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'
      ]
      return `${monthNames[period - 1]} ${year}`
    case 'quarterly':
      return `Kvartal ${period} ${year}`
    case 'yearly':
      return `Helår ${year}`
    default:
      return `${year}`
  }
}
