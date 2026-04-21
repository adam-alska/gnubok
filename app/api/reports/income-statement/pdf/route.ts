import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { generateIncomeStatement } from '@/lib/reports/income-statement'
import { FinancialStatementPDF, type FinancialStatementGroup, type FinancialStatementSection, type FinancialStatementSummaryRow } from '@/lib/reports/financial-statement-pdf-template'
import { requireCompanyId } from '@/lib/company/context'
import type { CompanySettings } from '@/types'

// K2/K3 uppställningsform (ÅRL bilaga 2, kostnadsslagsindelad) splits class 8
// into three blocks that must be rendered separately with named subtotals:
//   80–84 → Finansiella poster (followed by "Resultat efter finansiella poster")
//   88   → Bokslutsdispositioner
//   89   → Skatt på årets resultat
// The generator lumps these together under financial_sections, so we split
// here by the first row's account prefix.
function sectionPrefix(section: FinancialStatementSection, prefixes: string[]): boolean {
  if (section.rows.length === 0) return false
  const acc = section.rows[0].account_number
  return prefixes.some((p) => acc.startsWith(p))
}

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

    // Split class 8 into its three K2/K3 blocks.
    const finansiellaPosterSections = report.financial_sections.filter((s) =>
      sectionPrefix(s, ['80', '81', '82', '83', '84']),
    )
    const bokslutsdispositionerSections = report.financial_sections.filter((s) =>
      sectionPrefix(s, ['88']),
    )
    const skattSections = report.financial_sections.filter((s) =>
      sectionPrefix(s, ['89']),
    )

    const totalFinansiellaPoster = Math.round(
      finansiellaPosterSections.reduce((sum, s) => sum + s.subtotal, 0) * 100,
    ) / 100
    const totalBokslutsdispositioner = Math.round(
      bokslutsdispositionerSections.reduce((sum, s) => sum + s.subtotal, 0) * 100,
    ) / 100
    const totalSkatt = Math.round(
      skattSections.reduce((sum, s) => sum + s.subtotal, 0) * 100,
    ) / 100
    const resultatEfterFinansiellaPoster = Math.round(
      (operatingResult + totalFinansiellaPoster) * 100,
    ) / 100

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

    if (finansiellaPosterSections.length > 0) {
      groups.push({
        heading: 'Finansiella poster',
        sections: finansiellaPosterSections,
        totalLabel: 'Summa finansiella poster',
        total: totalFinansiellaPoster,
      })
    }
    if (bokslutsdispositionerSections.length > 0) {
      groups.push({
        heading: 'Bokslutsdispositioner',
        sections: bokslutsdispositionerSections,
        totalLabel: 'Summa bokslutsdispositioner',
        total: totalBokslutsdispositioner,
      })
    }
    if (skattSections.length > 0) {
      groups.push({
        heading: 'Skatter',
        sections: skattSections,
        totalLabel: 'Summa skatter',
        total: totalSkatt,
      })
    }

    // K2/K3 uppställningsform (ÅRL bilaga 2) summary structure:
    //   Rörelseresultat
    //   Resultat efter finansiella poster (only if finansiella poster present)
    //   Bokslutsdispositioner (only if present)
    //   Skatt på årets resultat (always, so the reader can verify the tax calc)
    //   Årets resultat
    const summary: FinancialStatementSummaryRow[] = [
      { label: 'Rörelseresultat', amount: operatingResult },
    ]
    if (finansiellaPosterSections.length > 0) {
      summary.push({
        label: 'Resultat efter finansiella poster',
        amount: resultatEfterFinansiellaPoster,
      })
    }
    if (bokslutsdispositionerSections.length > 0) {
      summary.push({ label: 'Bokslutsdispositioner', amount: totalBokslutsdispositioner })
    }
    summary.push({ label: 'Skatt på årets resultat', amount: totalSkatt })
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
