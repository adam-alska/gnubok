import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  generateReceivablesReport,
  type ReceivableInvoice,
  type ReceivableCustomer,
  type GLLine,
  type ExchangeRateInfo,
} from '@/extensions/export/currency-receivables/lib/receivables-engine'
import { fetchMultipleRates } from '@/lib/currency/riksbanken'
import type { Currency } from '@/types'

const SUPPORTED_CURRENCIES: Currency[] = ['EUR', 'USD', 'GBP', 'NOK', 'DKK']
const FX_ACCOUNTS = ['3960', '7960']

/**
 * GET /api/extensions/export/currency-receivables/report
 *
 * Generate a multi-currency receivables report showing FX exposure,
 * unrealized gains/losses, and realized FX from GL.
 *
 * Query params:
 *   year (optional) — Year for realized FX trend (default: current year)
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const yearStr = searchParams.get('year')
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear()

  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  const referenceDate = new Date().toISOString().split('T')[0]

  try {
    // Fetch open foreign-currency invoices
    const invoices = await fetchAllRows<ReceivableInvoice>(({ from, to }) =>
      supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, due_date, status, currency, total, total_sek, exchange_rate, customer_id')
        .eq('user_id', user.id)
        .in('status', ['sent', 'overdue'])
        .neq('currency', 'SEK')
        .range(from, to)
    )

    // Fetch customers
    const customerIds = [...new Set(invoices.map(inv => inv.customer_id))]
    let customers: ReceivableCustomer[] = []
    if (customerIds.length > 0) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('id, name, country')
        .eq('user_id', user.id)
        .in('id', customerIds)

      customers = (customerData || []) as ReceivableCustomer[]
    }

    // Fetch current Riksbanken rates for all supported currencies
    const rateMap = await fetchMultipleRates(SUPPORTED_CURRENCIES)
    const currentRates: ExchangeRateInfo[] = []
    for (const [, rate] of rateMap) {
      if (rate.currency !== 'SEK') {
        currentRates.push({
          currency: rate.currency,
          rate: rate.rate,
          date: rate.date,
        })
      }
    }

    // Fetch realized FX GL lines for the year
    const realizedFXLines = await fetchFXLines(supabase, user.id, year)

    const report = generateReceivablesReport({
      invoices,
      customers,
      currentRates,
      realizedFXLines,
      referenceDate,
      year,
    })

    return NextResponse.json({ data: report })
  } catch (err) {
    console.error('Error generating currency receivables report:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate report' },
      { status: 500 },
    )
  }
}

/**
 * Fetch GL lines on accounts 3960 (FX gains) and 7960 (FX losses)
 * for posted journal entries in the given year.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchFXLines(supabase: any, userId: string, year: number): Promise<GLLine[]> {
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  // Get posted journal entry IDs in the year
  const { data: entries, error: entriesError } = await supabase
    .from('journal_entries')
    .select('id, entry_date')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .gte('entry_date', startDate)
    .lte('entry_date', endDate)

  if (entriesError || !entries || entries.length === 0) return []

  const entryDateMap = new Map<string, string>()
  for (const e of entries as Array<{ id: string; entry_date: string }>) {
    entryDateMap.set(e.id, e.entry_date)
  }

  const entryIds = entries.map((e: { id: string }) => e.id)

  // Fetch lines in batches
  const BATCH_SIZE = 200
  const allLines: GLLine[] = []

  for (let i = 0; i < entryIds.length; i += BATCH_SIZE) {
    const batch = entryIds.slice(i, i + BATCH_SIZE)
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('journal_entry_id, account_number, debit_amount, credit_amount')
      .in('journal_entry_id', batch)
      .in('account_number', FX_ACCOUNTS)

    if (lines) {
      for (const line of lines as Array<{ journal_entry_id: string; account_number: string; debit_amount: number; credit_amount: number }>) {
        allLines.push({
          account_number: line.account_number,
          debit: Number(line.debit_amount) || 0,
          credit: Number(line.credit_amount) || 0,
          entry_date: entryDateMap.get(line.journal_entry_id) || startDate,
        })
      }
    }
  }

  return allLines
}
