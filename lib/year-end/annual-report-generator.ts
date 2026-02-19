import { createClient } from '@/lib/supabase/server'
import { generateIncomeStatement } from '@/lib/reports/income-statement'
import { generateBalanceSheet } from '@/lib/reports/balance-sheet'
import type { EntityType, IncomeStatementReport, BalanceSheetReport } from '@/types'
import type { AnnualReport, AnnualReportNote } from '@/types/year-end'

// ============================================================
// Annual Report Generation
// ============================================================

/**
 * Generate an annual report from a completed year-end closing.
 * Fetches all financial data and populates report templates.
 */
export async function generateAnnualReport(
  userId: string,
  yearEndClosingId: string
): Promise<AnnualReport> {
  const supabase = await createClient()

  // Fetch closing with fiscal period
  const { data: closing, error: closingError } = await supabase
    .from('year_end_closings')
    .select('*, fiscal_period:fiscal_periods(*)')
    .eq('id', yearEndClosingId)
    .eq('user_id', userId)
    .single()

  if (closingError || !closing) {
    throw new Error('Bokslut hittades inte')
  }

  // Fetch company settings
  const { data: settings } = await supabase
    .from('company_settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!settings) {
    throw new Error('Foretagsinstallningar saknas')
  }

  const entityType: EntityType = settings.entity_type as EntityType
  const fiscalPeriod = closing.fiscal_period

  // Generate financial statements
  const incomeStatement = await generateIncomeStatement(userId, closing.fiscal_period_id)
  const balanceSheet = await generateBalanceSheet(userId, closing.fiscal_period_id)

  // Fill in period dates
  incomeStatement.period = {
    start: fiscalPeriod.period_start,
    end: fiscalPeriod.period_end,
  }
  balanceSheet.period = {
    start: fiscalPeriod.period_start,
    end: fiscalPeriod.period_end,
  }

  // Generate default notes
  const notes = generateDefaultNotes(entityType, incomeStatement, balanceSheet, settings)

  // Generate management report template
  const managementReport = generateManagementReportTemplate(entityType, settings, incomeStatement)

  // Check for existing report
  const { data: existingReport } = await supabase
    .from('annual_reports')
    .select('id')
    .eq('year_end_closing_id', yearEndClosingId)
    .eq('user_id', userId)
    .single()

  const reportData: Partial<AnnualReport> = {
    user_id: userId,
    fiscal_period_id: closing.fiscal_period_id,
    year_end_closing_id: yearEndClosingId,
    entity_type: entityType,
    status: 'draft',
    report_data: {
      companyName: settings.company_name || '',
      orgNumber: settings.org_number || '',
      fiscalYear: fiscalPeriod.name,
      periodStart: fiscalPeriod.period_start,
      periodEnd: fiscalPeriod.period_end,
      address: [settings.address_line1, settings.postal_code, settings.city]
        .filter(Boolean)
        .join(', '),
    },
    income_statement: incomeStatement,
    balance_sheet: balanceSheet,
    notes_data: notes,
    management_report: managementReport,
    board_members: [],
    auditor_info: null,
  }

  if (existingReport) {
    // Update existing
    const { data: updated, error: updateError } = await supabase
      .from('annual_reports')
      .update(reportData)
      .eq('id', existingReport.id)
      .select()
      .single()

    if (updateError) {
      throw new Error(`Kunde inte uppdatera arsredovisning: ${updateError.message}`)
    }

    return updated as AnnualReport
  }

  // Create new
  const { data: created, error: createError } = await supabase
    .from('annual_reports')
    .insert(reportData)
    .select()
    .single()

  if (createError) {
    throw new Error(`Kunde inte skapa arsredovisning: ${createError.message}`)
  }

  return created as AnnualReport
}

// ============================================================
// Default Notes Generation
// ============================================================

function generateDefaultNotes(
  entityType: EntityType,
  _incomeStatement: IncomeStatementReport,
  _balanceSheet: BalanceSheetReport,
  _settings: Record<string, unknown>
): AnnualReportNote[] {
  const notes: AnnualReportNote[] = []

  // Note 1: Accounting principles
  notes.push({
    noteNumber: 1,
    title: 'Redovisningsprinciper',
    content:
      entityType === 'aktiebolag'
        ? 'Årsredovisningen är upprättad i enlighet med årsredovisningslagen och Bokföringsnämndens allmänna råd BFNAR 2016:10 Årsredovisning i mindre företag (K2).\n\nTillgångar och skulder har värderats till anskaffningsvärde om inte annat anges.\n\nAvskrivningar på materiella anläggningstillgångar görs för den beräknade nyttjandeperioden med linjära avskrivningar. Följande avskrivningstider tillämpas:\n- Inventarier och verktyg: 5 år\n- Datorer: 3 år'
        : 'Bokföringen följer god redovisningssed och Bokföringsnämndens allmänna råd.\n\nTillgångar och skulder har värderats till anskaffningsvärde om inte annat anges.',
    type: 'accounting_principles',
  })

  if (entityType === 'aktiebolag') {
    // Note 2: Employees
    notes.push({
      noteNumber: 2,
      title: 'Anställda och personalkostnader',
      content:
        'Medelantalet anställda under räkenskapsåret har uppgått till [ANTAL].\n\nLöner och andra ersättningar samt sociala kostnader:\nLöner till anställda: [BELOPP] kr\nSociala kostnader: [BELOPP] kr',
      type: 'other',
    })
  }

  return notes
}

// ============================================================
// Management Report Template
// ============================================================

function generateManagementReportTemplate(
  entityType: EntityType,
  settings: Record<string, unknown>,
  incomeStatement: IncomeStatementReport
): string {
  if (entityType !== 'aktiebolag') {
    return ''
  }

  const companyName = (settings.company_name as string) || '[FÖRETAG]'
  const orgNumber = (settings.org_number as string) || '[ORG.NR]'
  const resultText =
    incomeStatement.net_result >= 0
      ? `Årets resultat uppgår till ${formatSEK(incomeStatement.net_result)} kr.`
      : `Årets resultat uppgår till ${formatSEK(incomeStatement.net_result)} kr (förlust).`

  return `FÖRVALTNINGSBERÄTTELSE

Styrelsen för ${companyName}, ${orgNumber}, avger härmed årsredovisning för räkenskapsåret.

ALLMÄNT OM VERKSAMHETEN

Bolaget bedriver [BESKRIV VERKSAMHETEN].

Bolaget har sitt säte i [ORT].

VÄSENTLIGA HÄNDELSER UNDER RÄKENSKAPSÅRET

[Beskriv väsentliga händelser som inträffat under året, t.ex. nya kunder, investeringar, förändringar i verksamheten.]

RESULTATDISPOSITION

${resultText}

Styrelsen föreslår att årets resultat disponeras så att:

${
  incomeStatement.net_result >= 0
    ? `I ny räkning överföres: ${formatSEK(incomeStatement.net_result)} kr`
    : `I ny räkning överföres: ${formatSEK(incomeStatement.net_result)} kr`
}`
}

// ============================================================
// Helpers
// ============================================================

function formatSEK(amount: number): string {
  return amount.toLocaleString('sv-SE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}
