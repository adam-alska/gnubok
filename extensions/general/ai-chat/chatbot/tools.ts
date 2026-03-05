import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Extract name from a Supabase join result (could be object or array).
 */
function extractName(joined: unknown): string | null {
  if (!joined) return null
  if (Array.isArray(joined)) {
    return joined[0]?.name ?? null
  }
  if (typeof joined === 'object' && 'name' in joined) {
    return (joined as { name: string }).name
  }
  return null
}

/**
 * Resolve the current fiscal period for a user. Falls back to latest period.
 */
async function resolveCurrentPeriod(
  supabase: SupabaseClient,
  userId: string,
  fiscalPeriodId?: string
): Promise<{ id: string; start: string; end: string } | null> {
  if (fiscalPeriodId) {
    const { data } = await supabase
      .from('fiscal_periods')
      .select('id, period_start, period_end')
      .eq('id', fiscalPeriodId)
      .eq('user_id', userId)
      .single()
    if (data) return { id: data.id, start: data.period_start, end: data.period_end }
  }

  // Default: latest open period, or just the latest period
  const { data } = await supabase
    .from('fiscal_periods')
    .select('id, period_start, period_end, is_closed')
    .eq('user_id', userId)
    .order('period_start', { ascending: false })
    .limit(1)
    .single()

  if (data) return { id: data.id, start: data.period_start, end: data.period_end }
  return null
}

/**
 * Create all 10 accounting tools bound to a specific Supabase client and user.
 */
export function createAccountingTools(supabase: SupabaseClient, userId: string) {
  const getInvoices = tool(
    async ({ status, customer_name, date_from, date_to, limit }) => {
      let query = supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, due_date, status, total, paid_amount, currency, vat_amount, customer:customers(name)')
        .eq('user_id', userId)
        .order('invoice_date', { ascending: false })
        .limit(limit)

      if (status) query = query.eq('status', status)
      if (customer_name) query = query.ilike('customers.name', `%${customer_name}%`)
      if (date_from) query = query.gte('invoice_date', date_from)
      if (date_to) query = query.lte('invoice_date', date_to)

      const { data, error, count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)

      const { data: invoices, error: fetchError } = await query

      if (fetchError) return `Fel vid hämtning av fakturor: ${fetchError.message}`
      if (!invoices || invoices.length === 0) return 'Inga fakturor hittades.'

      const result = invoices.map((inv) => ({
        invoice_number: inv.invoice_number,
        date: inv.invoice_date,
        due_date: inv.due_date,
        status: inv.status,
        total: inv.total,
        paid: inv.paid_amount || 0,
        currency: inv.currency || 'SEK',
        vat: inv.vat_amount || 0,
        customer: extractName(inv.customer) || 'Okänd',
      }))

      const summary: Record<string, unknown> = { invoices: result }
      if (count && count > limit) {
        summary.note = `Visar ${result.length} av totalt ${count} fakturor.`
      }
      return JSON.stringify(summary)
    },
    {
      name: 'get_invoices',
      description: 'Hämtar användarens försäljningsfakturor (kundfakturor). Kan filtrera på status, kundnamn och datumintervall.',
      schema: z.object({
        status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional().describe('Filtrera på fakturastatus'),
        customer_name: z.string().optional().describe('Sök på kundnamn (delmatchning)'),
        date_from: z.string().optional().describe('Startdatum (YYYY-MM-DD)'),
        date_to: z.string().optional().describe('Slutdatum (YYYY-MM-DD)'),
        limit: z.number().max(20).default(10).describe('Max antal fakturor att returnera'),
      }),
    }
  )

  const getSupplierInvoices = tool(
    async ({ status, supplier_name, overdue_only, limit }) => {
      let query = supabase
        .from('supplier_invoices')
        .select('id, supplier_invoice_number, invoice_date, due_date, status, total, remaining_amount, currency, vat_amount, supplier:suppliers(name)')
        .eq('user_id', userId)
        .order('invoice_date', { ascending: false })
        .limit(limit)

      if (status) query = query.eq('status', status)
      if (overdue_only) query = query.eq('status', 'overdue')
      if (supplier_name) query = query.ilike('suppliers.name', `%${supplier_name}%`)

      const { data: invoices, error } = await query

      if (error) return `Fel vid hämtning av leverantörsfakturor: ${error.message}`
      if (!invoices || invoices.length === 0) return 'Inga leverantörsfakturor hittades.'

      const result = invoices.map((inv) => ({
        number: inv.supplier_invoice_number,
        date: inv.invoice_date,
        due_date: inv.due_date,
        status: inv.status,
        total: inv.total,
        remaining: inv.remaining_amount || 0,
        currency: inv.currency || 'SEK',
        vat: inv.vat_amount || 0,
        supplier: extractName(inv.supplier) || 'Okänd',
      }))

      return JSON.stringify({ supplier_invoices: result })
    },
    {
      name: 'get_supplier_invoices',
      description: 'Hämtar användarens leverantörsfakturor (inköpsfakturor). Kan filtrera på status, leverantörsnamn och förfallodag.',
      schema: z.object({
        status: z.enum(['registered', 'approved', 'partially_paid', 'paid', 'overdue', 'cancelled']).optional().describe('Filtrera på status'),
        supplier_name: z.string().optional().describe('Sök på leverantörsnamn (delmatchning)'),
        overdue_only: z.boolean().optional().describe('Visa bara förfallna fakturor'),
        limit: z.number().max(20).default(10).describe('Max antal fakturor'),
      }),
    }
  )

  const getAccountBalances = tool(
    async ({ account_numbers, account_class, fiscal_period_id }) => {
      const period = await resolveCurrentPeriod(supabase, userId, fiscal_period_id)
      if (!period) return 'Ingen räkenskapsperiod hittades.'

      const { generateTrialBalance } = await import('@/lib/reports/trial-balance')
      const { rows } = await generateTrialBalance(supabase, userId, period.id)

      let filtered = rows
      if (account_numbers && account_numbers.length > 0) {
        filtered = rows.filter((r) => account_numbers.includes(r.account_number))
      } else if (account_class) {
        filtered = rows.filter((r) => r.account_class === account_class)
      }

      if (filtered.length === 0) return 'Inga konton med saldo hittades.'

      const result = filtered.map((r) => ({
        account: r.account_number,
        name: r.account_name,
        debit: r.closing_debit,
        credit: r.closing_credit,
        balance: r.closing_debit - r.closing_credit,
      }))

      return JSON.stringify({
        period: `${period.start} – ${period.end}`,
        accounts: result,
        total_debit: Math.round(result.reduce((s, r) => s + r.debit, 0) * 100) / 100,
        total_credit: Math.round(result.reduce((s, r) => s + r.credit, 0) * 100) / 100,
      })
    },
    {
      name: 'get_account_balances',
      description: 'Hämtar saldon för BAS-konton. Kan filtrera på kontonummer eller kontoklass (1=tillgångar, 2=skulder, 3=intäkter, 4-7=kostnader, 8=finansiella).',
      schema: z.object({
        account_numbers: z.array(z.string()).optional().describe('Specifika kontonummer att hämta'),
        account_class: z.number().min(1).max(8).optional().describe('Kontoklass 1-8'),
        fiscal_period_id: z.string().optional().describe('Räkenskapsperiod-ID (standard: aktuell period)'),
      }),
    }
  )

  const getTransactions = tool(
    async ({ uncategorized_only, description, date_from, date_to, limit }) => {
      let query = supabase
        .from('transactions')
        .select('id, date, description, amount, currency, category, is_business, merchant_name, journal_entry_id')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(limit)

      if (uncategorized_only) query = query.is('journal_entry_id', null)
      if (description) query = query.ilike('description', `%${description}%`)
      if (date_from) query = query.gte('date', date_from)
      if (date_to) query = query.lte('date', date_to)

      const { data: transactions, error } = await query

      if (error) return `Fel vid hämtning av transaktioner: ${error.message}`
      if (!transactions || transactions.length === 0) return 'Inga transaktioner hittades.'

      const result = transactions.map((tx) => ({
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        currency: tx.currency || 'SEK',
        category: tx.category,
        is_business: tx.is_business,
        merchant: tx.merchant_name,
        booked: !!tx.journal_entry_id,
      }))

      return JSON.stringify({ transactions: result })
    },
    {
      name: 'get_transactions',
      description: 'Hämtar användarens banktransaktioner. Kan filtrera på obokförda, beskrivning (textsökning) och datumintervall.',
      schema: z.object({
        uncategorized_only: z.boolean().optional().describe('Visa bara obokförda transaktioner'),
        description: z.string().optional().describe('Sök i beskrivning (delmatchning)'),
        date_from: z.string().optional().describe('Startdatum (YYYY-MM-DD)'),
        date_to: z.string().optional().describe('Slutdatum (YYYY-MM-DD)'),
        limit: z.number().max(20).default(10).describe('Max antal transaktioner'),
      }),
    }
  )

  const getJournalEntries = tool(
    async ({ limit, fiscal_period_id, account_number, description }) => {
      const period = await resolveCurrentPeriod(supabase, userId, fiscal_period_id)

      let query = supabase
        .from('journal_entries')
        .select('id, voucher_number, entry_date, description, status, source_type')
        .eq('user_id', userId)
        .eq('status', 'posted')
        .order('voucher_number', { ascending: false })
        .limit(limit)

      if (period) query = query.eq('fiscal_period_id', period.id)
      if (description) query = query.ilike('description', `%${description}%`)

      const { data: entries, error } = await query

      if (error) return `Fel vid hämtning av verifikationer: ${error.message}`
      if (!entries || entries.length === 0) return 'Inga verifikationer hittades.'

      // Fetch lines for these entries
      const entryIds = entries.map((e) => e.id)
      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('journal_entry_id, account_number, debit_amount, credit_amount, line_description')
        .in('journal_entry_id', entryIds)

      // If filtering by account, only include entries with matching lines
      let filteredEntries = entries
      if (account_number && lines) {
        const matchingEntryIds = new Set(
          lines.filter((l) => l.account_number === account_number).map((l) => l.journal_entry_id)
        )
        filteredEntries = entries.filter((e) => matchingEntryIds.has(e.id))
      }

      const linesByEntry = new Map<string, typeof lines>()
      for (const line of lines || []) {
        const group = linesByEntry.get(line.journal_entry_id) || []
        group.push(line)
        linesByEntry.set(line.journal_entry_id, group)
      }

      const result = filteredEntries.map((e) => ({
        voucher: e.voucher_number,
        date: e.entry_date,
        description: e.description,
        source: e.source_type,
        lines: (linesByEntry.get(e.id) || []).map((l) => ({
          account: l.account_number,
          debit: l.debit_amount,
          credit: l.credit_amount,
          text: l.line_description,
        })),
      }))

      return JSON.stringify({ journal_entries: result })
    },
    {
      name: 'get_journal_entries',
      description: 'Hämtar bokförda verifikationer med konteringsrader. Kan filtrera på kontonummer, beskrivning och räkenskapsperiod.',
      schema: z.object({
        limit: z.number().max(20).default(10).describe('Max antal verifikationer'),
        fiscal_period_id: z.string().optional().describe('Räkenskapsperiod-ID'),
        account_number: z.string().optional().describe('Filtrera på kontonummer i rader'),
        description: z.string().optional().describe('Sök i beskrivning (delmatchning)'),
      }),
    }
  )

  const getIncomeStatement = tool(
    async ({ fiscal_period_id }) => {
      const period = await resolveCurrentPeriod(supabase, userId, fiscal_period_id)
      if (!period) return 'Ingen räkenskapsperiod hittades.'

      const { generateIncomeStatement } = await import('@/lib/reports/income-statement')
      const report = await generateIncomeStatement(supabase, userId, period.id)

      const sections = [
        ...report.revenue_sections.map((s) => ({
          category: 'Intäkter',
          title: s.title,
          amount: s.subtotal,
          accounts: s.rows.map((r) => ({ account: r.account_number, name: r.account_name, amount: r.amount })),
        })),
        ...report.expense_sections.map((s) => ({
          category: 'Kostnader',
          title: s.title,
          amount: s.subtotal,
          accounts: s.rows.map((r) => ({ account: r.account_number, name: r.account_name, amount: r.amount })),
        })),
        ...report.financial_sections.map((s) => ({
          category: 'Finansiella poster',
          title: s.title,
          amount: s.subtotal,
          accounts: s.rows.map((r) => ({ account: r.account_number, name: r.account_name, amount: r.amount })),
        })),
      ]

      return JSON.stringify({
        period: `${period.start} – ${period.end}`,
        total_revenue: report.total_revenue,
        total_expenses: report.total_expenses,
        total_financial: report.total_financial,
        net_result: report.net_result,
        sections,
      })
    },
    {
      name: 'get_income_statement',
      description: 'Hämtar resultaträkning med intäkter, kostnader och årets resultat. Visar alla kontona grupperade i sektioner.',
      schema: z.object({
        fiscal_period_id: z.string().optional().describe('Räkenskapsperiod-ID (standard: aktuell period)'),
      }),
    }
  )

  const getBalanceSheet = tool(
    async ({ fiscal_period_id }) => {
      const period = await resolveCurrentPeriod(supabase, userId, fiscal_period_id)
      if (!period) return 'Ingen räkenskapsperiod hittades.'

      const { generateBalanceSheet } = await import('@/lib/reports/balance-sheet')
      const report = await generateBalanceSheet(supabase, userId, period.id)

      const sections = [
        ...report.asset_sections.map((s) => ({
          category: 'Tillgångar',
          title: s.title,
          amount: s.subtotal,
          accounts: s.rows.map((r) => ({ account: r.account_number, name: r.account_name, amount: r.amount })),
        })),
        ...report.equity_liability_sections.map((s) => ({
          category: 'Eget kapital & skulder',
          title: s.title,
          amount: s.subtotal,
          accounts: s.rows.map((r) => ({ account: r.account_number, name: r.account_name, amount: r.amount })),
        })),
      ]

      return JSON.stringify({
        period: `${period.start} – ${period.end}`,
        total_assets: report.total_assets,
        total_equity_liabilities: report.total_equity_liabilities,
        balanced: Math.abs(report.total_assets - report.total_equity_liabilities) < 0.01,
        sections,
      })
    },
    {
      name: 'get_balance_sheet',
      description: 'Hämtar balansräkning med tillgångar, eget kapital och skulder.',
      schema: z.object({
        fiscal_period_id: z.string().optional().describe('Räkenskapsperiod-ID (standard: aktuell period)'),
      }),
    }
  )

  const getVatSummary = tool(
    async ({ fiscal_period_id }) => {
      const period = await resolveCurrentPeriod(supabase, userId, fiscal_period_id)
      if (!period) return 'Ingen räkenskapsperiod hittades.'

      // Get company settings for moms period type
      const { data: settings } = await supabase
        .from('company_settings')
        .select('moms_period')
        .eq('user_id', userId)
        .single()

      const periodType = settings?.moms_period || 'quarterly'
      const startDate = new Date(period.start)
      const year = startDate.getFullYear()
      let periodNum = 1
      if (periodType === 'monthly') {
        periodNum = startDate.getMonth() + 1
      } else if (periodType === 'quarterly') {
        periodNum = Math.ceil((startDate.getMonth() + 1) / 3)
      }

      const { calculateVatDeclaration, getVatDeclarationSummary } = await import('@/lib/reports/vat-declaration')
      const declaration = await calculateVatDeclaration(supabase, userId, periodType, year, periodNum)
      const summary = getVatDeclarationSummary(declaration)

      return JSON.stringify({
        period: `${period.start} – ${period.end}`,
        output_vat_25: declaration.rutor.ruta10,
        output_vat_12: declaration.rutor.ruta11,
        output_vat_6: declaration.rutor.ruta12,
        total_output_vat: summary.totalOutputVat,
        input_vat: summary.totalInputVat,
        vat_to_pay: summary.vatToPay,
        is_refund: summary.isRefund,
        domestic_taxable_sales: declaration.rutor.ruta05,
        revenue_basis_25: declaration.breakdown.invoices.base25,
        revenue_basis_12: declaration.breakdown.invoices.base12,
        revenue_basis_6: declaration.breakdown.invoices.base6,
        invoice_count: declaration.invoiceCount,
        transaction_count: declaration.transactionCount,
      })
    },
    {
      name: 'get_vat_summary',
      description: 'Hämtar momssammanställning med utgående moms, ingående moms och moms att betala/återfå.',
      schema: z.object({
        fiscal_period_id: z.string().optional().describe('Räkenskapsperiod-ID (standard: aktuell period)'),
      }),
    }
  )

  const getCompanyOverview = tool(
    async () => {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (!settings) return 'Inga företagsinställningar hittades.'

      // Get quick KPIs
      const period = await resolveCurrentPeriod(supabase, userId)

      const [
        { count: invoiceCount },
        { count: unpaidCount },
        { count: txCount },
        { count: unbookedCount },
      ] = await Promise.all([
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', userId).in('status', ['sent', 'overdue']),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('journal_entry_id', null),
      ])

      let netResult: number | null = null
      if (period) {
        try {
          const { generateIncomeStatement } = await import('@/lib/reports/income-statement')
          const report = await generateIncomeStatement(supabase, userId, period.id)
          netResult = report.net_result
        } catch {
          // Non-critical
        }
      }

      return JSON.stringify({
        company: {
          name: settings.company_name,
          entity_type: settings.entity_type,
          org_number: settings.org_number,
          vat_registered: settings.vat_registered,
          accounting_method: settings.accounting_method,
          moms_period: settings.moms_period,
        },
        kpis: {
          total_invoices: invoiceCount || 0,
          unpaid_invoices: unpaidCount || 0,
          total_transactions: txCount || 0,
          unbooked_transactions: unbookedCount || 0,
          ...(netResult !== null ? { net_result: netResult } : {}),
          ...(period ? { current_period: `${period.start} – ${period.end}` } : {}),
        },
      })
    },
    {
      name: 'get_company_overview',
      description: 'Hämtar företagsinformation och nyckeltal (KPIs): antal fakturor, obetalda fakturor, transaktioner, obokförda transaktioner, årets resultat.',
      schema: z.object({}),
    }
  )

  const getAgingReport = tool(
    async ({ type, limit }) => {
      if (type === 'receivable') {
        const { generateARLedger } = await import('@/lib/reports/ar-ledger')
        const report = await generateARLedger(supabase, userId)

        if (report.entries.length === 0) return 'Inga utestående kundfordringar.'

        const entries = report.entries.slice(0, limit).map((e) => ({
          name: e.customer_name,
          current: e.current,
          '1_30': e.days_1_30,
          '31_60': e.days_31_60,
          '61_90': e.days_61_90,
          '90_plus': e.days_90_plus,
          total: e.total_outstanding,
        }))

        return JSON.stringify({
          type: 'receivable',
          total_outstanding: report.total_outstanding,
          total_current: report.total_current,
          total_overdue: report.total_overdue,
          unpaid_count: report.unpaid_count,
          entries,
        })
      } else {
        const { generateSupplierLedger } = await import('@/lib/reports/supplier-ledger')
        const report = await generateSupplierLedger(supabase, userId)

        if (report.entries.length === 0) return 'Inga utestående leverantörsskulder.'

        const entries = report.entries.slice(0, limit).map((e) => ({
          name: e.supplier_name,
          current: e.current,
          '1_30': e.days_1_30,
          '31_60': e.days_31_60,
          '61_90': e.days_61_90,
          '90_plus': e.days_90_plus,
          total: e.total_outstanding,
        }))

        return JSON.stringify({
          type: 'payable',
          total_outstanding: report.total_outstanding,
          total_current: report.total_current,
          total_overdue: report.total_overdue,
          unpaid_count: report.unpaid_count,
          entries,
        })
      }
    },
    {
      name: 'get_aging_report',
      description: 'Hämtar åldersanalys för kundfordringar (receivable) eller leverantörsskulder (payable). Visar utestående belopp uppdelat i ålderskategorier.',
      schema: z.object({
        type: z.enum(['receivable', 'payable']).describe("'receivable' för kundfordringar, 'payable' för leverantörsskulder"),
        limit: z.number().max(20).default(10).describe('Max antal poster'),
      }),
    }
  )

  return [
    getInvoices,
    getSupplierInvoices,
    getAccountBalances,
    getTransactions,
    getJournalEntries,
    getIncomeStatement,
    getBalanceSheet,
    getVatSummary,
    getCompanyOverview,
    getAgingReport,
  ]
}
