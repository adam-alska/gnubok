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
import { generateSCBCsv, generateSCBFilename } from '@/extensions/export/intrastat/lib/scb-csv-generator'
import { getMonthPeriod } from '@/extensions/export/eu-sales-list/lib/eu-sales-list-engine'

/**
 * GET /api/extensions/export/intrastat/download
 *
 * Download an Intrastat declaration as SCB-compatible CSV.
 *
 * Query params:
 *   year   (required) — Fiscal year
 *   month  (required) — 1-12
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
    const { data: company } = await supabase
      .from('company_settings')
      .select('company_name, org_number, vat_number')
      .eq('user_id', user.id)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Company settings not found' }, { status: 404 })
    }

    const reporterVatNumber = company.vat_number || `SE${(company.org_number || '').replace(/\D/g, '')}01`

    // Fetch invoices
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

    // Fetch invoice items
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

    // Fetch product metadata
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

    // Fetch settings
    const { data: settingsData } = await supabase
      .from('extension_data')
      .select('value')
      .eq('user_id', user.id)
      .eq('extension_id', 'export/intrastat')
      .eq('key', 'settings')
      .maybeSingle()

    const settings = settingsData?.value as Record<string, unknown> | undefined

    const report = generateIntrastatReport({
      invoices,
      invoiceItems,
      customers,
      products,
      reporterVatNumber,
      reporterName: company.company_name || '',
      year,
      month,
      defaultTransactionNature: (settings?.default_transaction_nature as string) || '11',
      defaultDeliveryTerms: (settings?.default_delivery_terms as string) || 'FCA',
    })

    const content = generateSCBCsv(report)
    const filename = generateSCBFilename(report)

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Error generating Intrastat download:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate download' },
      { status: 500 },
    )
  }
}
