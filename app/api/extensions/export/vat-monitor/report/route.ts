import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  generateVatMonitorReport,
  VAT_MONITOR_ACCOUNTS,
  type GLLine,
  type VatMonitorInvoice,
  type VatMonitorCustomer,
} from '@/extensions/export/vat-monitor/lib/vat-monitor-engine'
import {
  getMonthPeriod,
  getQuarterPeriod,
} from '@/extensions/export/eu-sales-list/lib/eu-sales-list-engine'

/**
 * GET /api/extensions/export/vat-monitor/report
 *
 * Generate a VAT Monitor report for the specified period.
 *
 * Query params:
 *   year      (required) — Fiscal year
 *   month     (optional) — 1-12
 *   quarter   (optional) — 1-4
 *   compare   (optional) — 'previous' to include period comparison
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const yearStr = searchParams.get('year')
  const monthStr = searchParams.get('month')
  const quarterStr = searchParams.get('quarter')
  const compare = searchParams.get('compare')

  if (!yearStr) {
    return NextResponse.json({ error: 'year is required' }, { status: 400 })
  }

  const year = parseInt(yearStr, 10)
  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
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
      return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
    }
  }

  if (quarterStr) {
    quarter = parseInt(quarterStr, 10)
    if (isNaN(quarter) || quarter < 1 || quarter > 4) {
      return NextResponse.json({ error: 'Invalid quarter' }, { status: 400 })
    }
  }

  const period = month !== undefined
    ? getMonthPeriod(year, month)
    : getQuarterPeriod(year, quarter!)

  try {
    // Fetch GL lines for current period
    const glLines = await fetchGLLines(supabase, user.id, period.start, period.end)

    // Fetch invoices for validation
    const invoices = await fetchAllRows<VatMonitorInvoice>(({ from, to }) =>
      supabase
        .from('invoices')
        .select('id, invoice_number, vat_treatment, moms_ruta, customer_id')
        .eq('user_id', user.id)
        .gte('invoice_date', period.start)
        .lte('invoice_date', period.end)
        .in('status', ['sent', 'paid', 'overdue'])
        .range(from, to)
    )

    // Fetch customers for those invoices
    const customerIds = [...new Set(invoices.map(inv => inv.customer_id))]
    let customers: VatMonitorCustomer[] = []
    if (customerIds.length > 0) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('id, name, country, vat_number, vat_number_validated')
        .eq('user_id', user.id)
        .in('id', customerIds)

      customers = (customerData || []) as VatMonitorCustomer[]
    }

    // Fetch previous period GL lines for comparison
    let previousGlLines: GLLine[] | undefined
    if (compare === 'previous') {
      const prevPeriod = getPreviousPeriod(year, month, quarter)
      previousGlLines = await fetchGLLines(supabase, user.id, prevPeriod.start, prevPeriod.end)
    }

    const report = generateVatMonitorReport({
      glLines,
      invoices,
      customers,
      year,
      month,
      quarter,
      previousGlLines,
    })

    return NextResponse.json({ data: report })
  } catch (err) {
    console.error('Error generating VAT Monitor report:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate report' },
      { status: 500 },
    )
  }
}

// ── Helpers ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchGLLines(supabase: any, userId: string, startDate: string, endDate: string): Promise<GLLine[]> {
  // Fetch posted journal entry IDs for the period
  const { data: entries, error: entriesError } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'posted')
    .gte('entry_date', startDate)
    .lte('entry_date', endDate)

  if (entriesError || !entries || entries.length === 0) return []

  const entryIds = entries.map((e: { id: string }) => e.id)

  // Fetch lines in batches
  const BATCH_SIZE = 200
  const allLines: GLLine[] = []

  for (let i = 0; i < entryIds.length; i += BATCH_SIZE) {
    const batch = entryIds.slice(i, i + BATCH_SIZE)
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('account_number, debit_amount, credit_amount')
      .in('journal_entry_id', batch)
      .in('account_number', VAT_MONITOR_ACCOUNTS)

    if (lines) allLines.push(...lines)
  }

  return allLines
}

function getPreviousPeriod(year: number, month?: number, quarter?: number): { start: string; end: string } {
  if (month !== undefined) {
    let prevMonth = month - 1
    let prevYear = year
    if (prevMonth < 1) {
      prevMonth = 12
      prevYear--
    }
    return getMonthPeriod(prevYear, prevMonth)
  }

  let prevQuarter = quarter! - 1
  let prevYear = year
  if (prevQuarter < 1) {
    prevQuarter = 4
    prevYear--
  }
  return getQuarterPeriod(prevYear, prevQuarter)
}
