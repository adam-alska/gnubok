import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  generateECSalesListReport,
  getMonthPeriod,
  getQuarterPeriod,
  type ECSalesListInvoice,
  type ECSalesListCustomer,
  type GLAccountTotal,
} from '@/extensions/export/eu-sales-list/lib/eu-sales-list-engine'
import { generateCSV, generateCSVFilename } from '@/extensions/export/eu-sales-list/lib/csv-generator'
import { generateSKVXml, generateXMLFilename } from '@/extensions/export/eu-sales-list/lib/skv-xml-generator'

/**
 * GET /api/extensions/export/eu-sales-list/download
 *
 * Download an EC Sales List (periodisk sammanställning) as CSV or XML.
 *
 * Query params:
 *   year     (required) — Fiscal year
 *   month    (optional) — 1-12, for monthly filing
 *   quarter  (optional) — 1-4, for quarterly filing
 *   format   (required) — 'csv' or 'xml'
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
  const format = searchParams.get('format')

  if (!yearStr) {
    return NextResponse.json({ error: 'year is required' }, { status: 400 })
  }

  if (!format || !['csv', 'xml'].includes(format)) {
    return NextResponse.json({ error: 'format is required and must be csv or xml' }, { status: 400 })
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
    // Fetch company settings
    const { data: company, error: companyError } = await supabase
      .from('company_settings')
      .select('company_name, org_number, vat_number')
      .eq('user_id', user.id)
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company settings not found' }, { status: 404 })
    }

    const reporterVatNumber = company.vat_number || `SE${(company.org_number || '').replace(/\D/g, '')}01`

    // Fetch invoices
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

    // Fetch customers
    const customerIds = [...new Set(invoices.map(inv => inv.customer_id))]
    let customers: ECSalesListCustomer[] = []
    if (customerIds.length > 0) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('id, name, country, customer_type, vat_number, vat_number_validated')
        .eq('user_id', user.id)
        .in('id', customerIds)

      customers = (customerData || []) as ECSalesListCustomer[]
    }

    // Generate report
    const report = generateECSalesListReport({
      invoices,
      customers,
      reporterVatNumber,
      reporterName: company.company_name || '',
      year,
      month,
      quarter,
    })

    // Generate file content
    if (format === 'csv') {
      const content = generateCSV(report)
      const filename = generateCSVFilename(report)

      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // XML format
    const content = generateSKVXml(report)
    const filename = generateXMLFilename(report)

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Error generating EC Sales List download:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate download' },
      { status: 500 },
    )
  }
}
