import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { generateBalanceSheet } from '@/lib/reports/balance-sheet'
import { FinancialStatementPDF } from '@/lib/reports/financial-statement-pdf-template'
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
    const report = await generateBalanceSheet(supabase, companyId, periodId)
    report.period = { start: period.period_start, end: period.period_end }

    const totalAssets = report.total_assets
    const totalEquityLiab = report.total_equity_liabilities
    const diff = Math.round((totalAssets - totalEquityLiab) * 100) / 100

    // ÅRL 3 kap / K2 / K3 require balansräkningen to balance exactly. Never
    // produce a signed-looking PDF with a differens row — fix the data first.
    // The on-screen view already surfaces a "Balanserar ej" warning.
    if (Math.abs(diff) > 0.005) {
      return NextResponse.json(
        {
          error:
            'Balansräkningen balanserar inte (tillgångar ≠ eget kapital och skulder). Åtgärda differensen innan du genererar PDF.',
        },
        { status: 400 }
      )
    }

    const pdfBuffer = await renderToBuffer(
      FinancialStatementPDF({
        title: 'Balansräkning',
        groups: [
          {
            heading: 'Tillgångar',
            sections: report.asset_sections,
            totalLabel: 'Summa tillgångar',
            total: totalAssets,
          },
          {
            heading: 'Eget kapital och skulder',
            sections: report.equity_liability_sections,
            totalLabel: 'Summa eget kapital och skulder',
            total: totalEquityLiab,
          },
        ],
        period: report.period,
        company: companyRow as CompanySettings,
        generatedAt: new Date().toISOString(),
      })
    )

    const filename = `balansrakning-${report.period.start}.pdf`

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Kunde inte generera balansräkning' },
      { status: 500 }
    )
  }
}
