import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import {
  generateIntrastatReport,
  type IntrastatInvoice,
  type IntrastatCustomer,
  type IntrastatInvoiceItem,
  type ProductMetadata,
} from '@/extensions/export/intrastat/lib/intrastat-engine'
import { getMonthPeriod } from '@/extensions/export/eu-sales-list/lib/eu-sales-list-engine'

/**
 * GET /api/extensions/export/intrastat/report
 *
 * Generate an Intrastat declaration report for the specified month.
 *
 * Query params:
 *   year   (required) — Fiscal year
 *   month  (required) — 1-12 (Intrastat is always monthly)
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

  if (!yearStr || !monthStr) {
    return NextResponse.json({ error: 'year and month are required' }, { status: 400 })
  }

  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)

  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }
  if (isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
  }

  const period = getMonthPeriod(year, month)

  try {
    // Fetch company settings
    const { data: company } = await supabase
      .from('company_settings')
      .select('company_name, org_number, vat_number')
      .eq('user_id', user.id)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Company settings not found' }, { status: 404 })
    }

    const reporterVatNumber = company.vat_number || `SE${(company.org_number || '').replace(/\D/g, '')}01`

    // Fetch reverse-charge invoices for the period
    const invoices = await fetchAllRows<IntrastatInvoice>(({ from, to }) =>
      supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, status, vat_treatment, moms_ruta, currency, total_sek, subtotal_sek, subtotal, document_type, credited_invoice_id, customer_id')
        .eq('user_id', user.id)
        .gte('invoice_date', period.start)
        .lte('invoice_date', period.end)
        .in('status', ['sent', 'paid', 'overdue'])
        .eq('vat_treatment', 'reverse_charge')
        .range(from, to)
    )

    // Fetch invoice items for those invoices
    const invoiceIds = invoices.map(inv => inv.id)
    let invoiceItems: IntrastatInvoiceItem[] = []
    if (invoiceIds.length > 0) {
      const BATCH_SIZE = 200
      for (let i = 0; i < invoiceIds.length; i += BATCH_SIZE) {
        const batch = invoiceIds.slice(i, i + BATCH_SIZE)
        const { data: items } = await supabase
          .from('invoice_items')
          .select('id, invoice_id, description, quantity, unit_price, total, total_sek')
          .in('invoice_id', batch)

        if (items) invoiceItems.push(...(items as IntrastatInvoiceItem[]))
      }
    }

    // Fetch customers
    const customerIds = [...new Set(invoices.map(inv => inv.customer_id))]
    let customers: IntrastatCustomer[] = []
    if (customerIds.length > 0) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('id, name, country, vat_number')
        .eq('user_id', user.id)
        .in('id', customerIds)

      customers = (customerData || []) as IntrastatCustomer[]
    }

    // Fetch product metadata from extension_data
    const { data: productData } = await supabase
      .from('extension_data')
      .select('key, value')
      .eq('user_id', user.id)
      .eq('extension_id', 'export/intrastat')
      .ilike('key', 'product:%')

    const products: ProductMetadata[] = (productData || []).map((d: { key: string; value: Record<string, unknown> }) => ({
      productId: d.key.replace('product:', ''),
      cnCode: (d.value.cn_code as string) || null,
      description: (d.value.description as string) || '',
      netWeightKg: d.value.net_weight_kg !== undefined ? Number(d.value.net_weight_kg) : null,
      countryOfOrigin: (d.value.country_of_origin as string) || 'SE',
      supplementaryUnit: d.value.supplementary_unit !== undefined ? Number(d.value.supplementary_unit) : null,
      supplementaryUnitType: (d.value.supplementary_unit_type as string) || null,
    }))

    // Fetch extension settings
    const { data: settingsData } = await supabase
      .from('extension_data')
      .select('value')
      .eq('user_id', user.id)
      .eq('extension_id', 'export/intrastat')
      .eq('key', 'settings')
      .maybeSingle()

    const settings = settingsData?.value as Record<string, unknown> | undefined
    const defaultTransactionNature = (settings?.default_transaction_nature as string) || '11'
    const defaultDeliveryTerms = (settings?.default_delivery_terms as string) || 'FCA'

    // Calculate prior cumulative value (rolling 12 months excluding current)
    const priorCumulativeValue = await calculatePriorCumulative(supabase, user.id, year, month)

    const report = generateIntrastatReport({
      invoices,
      invoiceItems,
      customers,
      products,
      reporterVatNumber,
      reporterName: company.company_name || '',
      year,
      month,
      defaultTransactionNature,
      defaultDeliveryTerms,
      priorCumulativeValue,
    })

    return NextResponse.json({ data: report })
  } catch (err) {
    console.error('Error generating Intrastat report:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate report' },
      { status: 500 },
    )
  }
}

/**
 * Calculate the cumulative dispatch value for the 11 months prior to the
 * current period (rolling 12-month window for threshold monitoring).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function calculatePriorCumulative(supabase: any, userId: string, year: number, month: number): Promise<number> {
  // Calculate 11-month lookback window
  let startMonth = month - 11
  let startYear = year
  while (startMonth < 1) {
    startMonth += 12
    startYear--
  }
  const startDate = `${startYear}-${String(startMonth).padStart(2, '0')}-01`

  // End date is the day before the current period
  let prevMonth = month - 1
  let prevYear = year
  if (prevMonth < 1) {
    prevMonth = 12
    prevYear--
  }
  const lastDay = new Date(prevYear, prevMonth, 0).getDate()
  const endDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  if (startDate > endDate) return 0

  // Sum total_sek for reverse_charge invoices to EU in the lookback window
  const { data, error } = await supabase
    .from('invoices')
    .select('total_sek, subtotal_sek, subtotal')
    .eq('user_id', userId)
    .gte('invoice_date', startDate)
    .lte('invoice_date', endDate)
    .in('status', ['sent', 'paid', 'overdue'])
    .eq('vat_treatment', 'reverse_charge')
    .eq('moms_ruta', '35')

  if (error || !data) return 0

  let total = 0
  for (const inv of data) {
    if (inv.subtotal_sek !== null) {
      total += Number(inv.subtotal_sek) || 0
    } else {
      total += Number(inv.subtotal) || 0
    }
  }

  return Math.round(total * 100) / 100
}
