import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  generateECSalesListReport,
  getMonthPeriod,
  getQuarterPeriod,
  getFilingDeadline,
  daysUntilDeadline,
  type ECSalesListInvoice,
  type ECSalesListCustomer,
  type GLAccountTotal,
} from '@/extensions/export/eu-sales-list/lib/eu-sales-list-engine'

/**
 * GET /api/extensions/export/eu-sales-list/report
 *
 * Generate an EC Sales List (periodisk sammanställning) report.
 *
 * Query params:
 *   year     (required) — Fiscal year, e.g. 2026
 *   month    (optional) — 1-12, for monthly filing (goods)
 *   quarter  (optional) — 1-4, for quarterly filing (services)
 *
 * Either month or quarter must be provided, not both.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse query parameters
  const { searchParams } = new URL(request.url)
  const yearStr = searchParams.get('year')
  const monthStr = searchParams.get('month')
  const quarterStr = searchParams.get('quarter')

  if (!yearStr) {
    return NextResponse.json({ error: 'year is required' }, { status: 400 })
  }

  const year = parseInt(yearStr, 10)
  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year. Must be between 2000 and 2100' }, { status: 400 })
  }

  if (!monthStr && !quarterStr) {
    return NextResponse.json({ error: 'Either month or quarter is required' }, { status: 400 })
  }

  if (monthStr && quarterStr) {
    return NextResponse.json({ error: 'Provide either month or quarter, not both' }, { status: 400 })
  }

  let month: number | undefined
  let quarter: number | undefined

  if (monthStr) {
    month = parseInt(monthStr, 10)
    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid month. Must be 1-12' }, { status: 400 })
    }
  }

  if (quarterStr) {
    quarter = parseInt(quarterStr, 10)
    if (isNaN(quarter) || quarter < 1 || quarter > 4) {
      return NextResponse.json({ error: 'Invalid quarter. Must be 1-4' }, { status: 400 })
    }
  }

  // Determine date range
  const period = month !== undefined
    ? getMonthPeriod(year, month)
    : getQuarterPeriod(year, quarter!)

  try {
    // Fetch company settings for reporter info
    const { data: company, error: companyError } = await supabase
      .from('company_settings')
      .select('company_name, org_number, vat_number')
      .eq('user_id', user.id)
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company settings not found' }, { status: 404 })
    }

    const reporterVatNumber = company.vat_number || `SE${(company.org_number || '').replace(/\D/g, '')}01`

    // Fetch invoices for the period
    const invoices = await fetchAllRows<ECSalesListInvoice>(({ from, to }) =>
      supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, status, currency, total, total_sek, subtotal, subtotal_sek, vat_treatment, moms_ruta, document_type, credited_invoice_id, customer_id')
        .eq('user_id', user.id)
        .gte('invoice_date', period.start)
        .lte('invoice_date', period.end)
        .in('status', ['sent', 'paid', 'overdue'])
        .eq('vat_treatment', 'reverse_charge')
        .range(from, to)
    )

    // Collect unique customer IDs
    const customerIds = [...new Set(invoices.map(inv => inv.customer_id))]

    // Fetch customers (only if we have invoices)
    let customers: ECSalesListCustomer[] = []
    if (customerIds.length > 0) {
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('id, name, country, customer_type, vat_number, vat_number_validated')
        .eq('user_id', user.id)
        .in('id', customerIds)

      if (customerError) {
        return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 })
      }

      customers = (customerData || []) as ECSalesListCustomer[]
    }

    // Fetch GL account totals for cross-check
    // Query posted journal entries in the period, then sum credit amounts
    // on the relevant revenue accounts (3108, 3308, 3109, 3521)
    const glTotals = await fetchGLTotals(supabase, user.id, period.start, period.end)

    // Generate report
    const report = generateECSalesListReport({
      invoices,
      customers,
      glTotals: glTotals.length > 0 ? glTotals : undefined,
      reporterVatNumber,
      reporterName: company.company_name || '',
      year,
      month,
      quarter,
    })

    // Add deadline info
    const deadline = getFilingDeadline(year, month, quarter)
    const daysLeft = daysUntilDeadline(deadline)

    return NextResponse.json({
      data: {
        ...report,
        deadline,
        daysUntilDeadline: daysLeft,
      },
    })
  } catch (err) {
    console.error('Error generating EC Sales List report:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate report' },
      { status: 500 },
    )
  }
}

// ── GL cross-check helper ───────────────────────────────────

const CROSS_CHECK_ACCOUNTS = ['3108', '3109', '3308', '3521']

/**
 * Fetch credit totals for cross-check accounts from posted journal entries.
 * Mirrors the approach used by /api/bookkeeping/account-totals.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchGLTotals(supabase: any, userId: string, startDate: string, endDate: string): Promise<GLAccountTotal[]> {
  // Get posted journal entry IDs in the period
  const { data: entries, error: entriesError } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .gte('entry_date', startDate)
    .lte('entry_date', endDate)

  if (entriesError || !entries || entries.length === 0) return []

  const entryIds = entries.map((e: { id: string }) => e.id)

  // Fetch lines in batches (same pattern as account-totals route)
  const BATCH_SIZE = 200
  const allLines: Array<{ account_number: string; credit_amount: number }> = []

  for (let i = 0; i < entryIds.length; i += BATCH_SIZE) {
    const batch = entryIds.slice(i, i + BATCH_SIZE)
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('account_number, credit_amount')
      .in('journal_entry_id', batch)
      .in('account_number', CROSS_CHECK_ACCOUNTS)

    if (lines) allLines.push(...lines)
  }

  // Aggregate credits per account
  const totals = new Map<string, number>()
  for (const line of allLines) {
    const credit = Number(line.credit_amount) || 0
    totals.set(line.account_number, (totals.get(line.account_number) ?? 0) + credit)
  }

  return Array.from(totals.entries()).map(([account_number, credit]) => ({
    account_number,
    credit: Math.round(credit * 100) / 100,
  }))
}
