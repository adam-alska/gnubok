import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { generateIncomeStatement } from '@/lib/reports/income-statement'
import { FinancialStatementPDF, type FinancialStatementGroup, type FinancialStatementSummaryRow } from '@/lib/reports/financial-statement-pdf-template'
import { requireCompanyId } from '@/lib/company/context'
import type { CompanySettings } from '@/types'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = await requireCompanyId(supabase, user.id)

  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('period_id')

  if (!periodId) {
    return NextResponse.json({ error: 'period_id is required' }, { status: 400 })
  }

  const [{ data: period }, { data: companyRow }] = await Promise.all([
    supabase
      .from('fiscal_periods')
      .select('period_start, period_end')
      .eq('id', periodId)
      .eq('company_id', companyId)
      .single(),
    supabase
      .from('company_settings')
      .select('*')
      .eq('company_id', companyId)
      .single(),
  ])

  if (!companyRow) {
    return NextResponse.json({ error: 'Företagsinställningar saknas' }, { status: 404 })
  }
  // An identifiable period is part of räkenskapsinformation (BFL 7 kap). Refuse
  // to render a PDF that can't be archived with the period it refers to.
  if (!period) {
    return NextResponse.json(
      { error: 'Räkenskapsperioden kunde inte läsas. Välj en befintlig period innan du genererar PDF.' },
      { status: 400 }
    )
  }

  try {
    const report = await generateIncomeStatement(supabase, companyId, periodId)
    report.period = { start: period.period_start, end: period.period_end }

    const operatingResult = Math.round((report.total_revenue - report.total_expenses) * 100) / 100

    const groups: FinancialStatementGroup[] = [
      {
        heading: 'Rörelseintäkter',
        sections: report.revenue_sections,
        totalLabel: 'Summa rörelseintäkter',
        total: report.total_revenue,
      },
      {
        heading: 'Rörelsekostnader',
        sections: report.expense_sections,
        totalLabel: 'Summa rörelsekostnader',
        total: report.total_expenses,
        negate: true,
      },
    ]

    if (report.financial_sections.length > 0) {
      groups.push({
        heading: 'Finansiella poster',
        sections: report.financial_sections,
        totalLabel: 'Summa finansiella poster',
        total: report.total_financial,
      })
    }

    const summary: FinancialStatementSummaryRow[] = [
      { label: 'Rörelseresultat', amount: operatingResult },
    ]
    if (report.financial_sections.length > 0) {
      summary.push({ label: 'Finansiella poster', amount: report.total_financial })
      // K2/K3 uppställningsform (ÅRL bilaga 2) requires the explicit
      // "Resultat efter finansiella poster" subtotal when financial items
      // are present.
      const afterFinancial = Math.round((operatingResult + report.total_financial) * 100) / 100
      summary.push({ label: 'Resultat efter finansiella poster', amount: afterFinancial })
    }
    summary.push({ label: 'Årets resultat', amount: report.net_result, emphasis: true })

    const pdfBuffer = await renderToBuffer(
      FinancialStatementPDF({
        title: 'Resultaträkning',
        groups,
        summary,
        period: report.period,
        company: companyRow as CompanySettings,
        generatedAt: new Date().toISOString(),
      })
    )

    const filename = `resultatrakning-${report.period.start}.pdf`

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte generera resultaträkning' },
      { status: 500 }
    )
  }
}
