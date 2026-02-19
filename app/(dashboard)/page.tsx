import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import InsightsDashboard from '@/components/insights/InsightsDashboard'
import {
  calculateEFTax,
  calculateABTax,
  getEnhancedTaxWarningStatus
} from '@/lib/tax/calculator'
import { getSchablonavdragSummary } from '@/lib/tax/schablonavdrag'
import type {
  Deadline,
  ReceiptQueueSummary,
  OnboardingProgress,
  CompanySettings,
  EntityType,
  SchablonavdragSettings,
} from '@/types'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch profile for name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const firstName = profile?.full_name?.split(' ')[0] || null

  // Fetch company settings
  const { data: settings } = await supabase
    .from('company_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Fetch onboarding progress for new user checklist
  const [
    { count: customerCount },
    { count: invoiceCount },
    { count: receiptCount },
    { count: bankConnectionCount },
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('bank_connections').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'active'),
  ])

  const onboardingProgress: OnboardingProgress = {
    hasCustomers: (customerCount || 0) > 0,
    hasInvoices: (invoiceCount || 0) > 0,
    hasReceipts: (receiptCount || 0) > 0,
    hasBankConnected: (bankConnectionCount || 0) > 0,
  }

  // Fetch current year transactions summary
  const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString()
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, amount_sek, is_business, category, date')
    .eq('user_id', user.id)
    .gte('date', startOfYear.split('T')[0])

  // Calculate summaries
  const ytdTransactions = transactions || []
  const mtdTransactions = ytdTransactions.filter(
    (t) => t.date >= startOfMonth.split('T')[0]
  )

  const calculateTotals = (txns: typeof ytdTransactions) => {
    const income = txns
      .filter((t) => t.is_business && t.amount > 0)
      .reduce((sum, t) => sum + Number(t.amount_sek || t.amount), 0)
    const expenses = txns
      .filter((t) => t.is_business && t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount_sek || t.amount)), 0)
    return { income, expenses, net: income - expenses }
  }

  const ytdTotals = calculateTotals(ytdTransactions)
  const mtdTotals = calculateTotals(mtdTransactions)

  const uncategorizedCount = (transactions || []).filter(
    (t) => t.is_business === null
  ).length

  // Fetch unpaid invoices
  const { data: unpaidInvoices } = await supabase
    .from('invoices')
    .select('total, total_sek, vat_amount, vat_amount_sek, status, due_date')
    .eq('user_id', user.id)
    .in('status', ['sent', 'overdue'])

  const unpaidTotal = (unpaidInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.total_sek || inv.total),
    0
  )

  const unpaidVatTotal = (unpaidInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.vat_amount_sek || inv.vat_amount || 0),
    0
  )

  const overdueInvoices = (unpaidInvoices || []).filter(inv => inv.status === 'overdue')
  const overdueCount = overdueInvoices.length
  const overdueTotal = overdueInvoices.reduce(
    (sum, inv) => sum + Number(inv.total_sek || inv.total),
    0
  )

  // Fetch upcoming supplier payments
  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: upcomingPayments } = await supabase
    .from('supplier_invoices')
    .select('total_amount')
    .eq('user_id', user.id)
    .in('status', ['received', 'attested'])
    .gte('due_date', today)
    .lte('due_date', thirtyDaysOut)

  const upcomingPaymentsTotal = (upcomingPayments || []).reduce(
    (sum, inv) => sum + Number(inv.total_amount),
    0
  )

  // Tax obligations this month
  const entityType = (settings?.entity_type as EntityType) || 'enskild_firma'
  const preliminaryTaxMonthly = settings?.preliminary_tax_monthly || 0
  const currentMonth = new Date().getMonth() + 1
  const preliminaryTaxPaidYTD = preliminaryTaxMonthly * currentMonth

  // Mileage/schablonavdrag
  const { data: mileageEntries } = await supabase
    .from('mileage_entries')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', startOfYear.split('T')[0])

  const schablonavdragSettings = (settings as CompanySettings & { schablonavdrag_settings?: SchablonavdragSettings })?.schablonavdrag_settings || null
  const schablonavdragSummary = getSchablonavdragSummary(
    schablonavdragSettings,
    mileageEntries || [],
    new Date().getFullYear(),
    currentMonth
  )

  const totalTaxableIncome = ytdTotals.net

  const taxEstimate =
    entityType === 'enskild_firma'
      ? calculateEFTax(totalTaxableIncome, preliminaryTaxPaidYTD, schablonavdragSummary, unpaidVatTotal)
      : calculateABTax(totalTaxableIncome, 0, preliminaryTaxPaidYTD, unpaidVatTotal)

  const taxWarning = getEnhancedTaxWarningStatus(taxEstimate, preliminaryTaxMonthly, currentMonth)

  // Tax obligations this month = F-skatt + estimated moms
  const taxThisMonth = preliminaryTaxMonthly + Math.round(taxEstimate.moms_to_pay / 12)

  // Fetch bank balance
  const { data: bankConnections } = await supabase
    .from('bank_connections')
    .select('accounts, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)

  let bankBalance: number | null = null
  if (bankConnections && bankConnections.length > 0) {
    const accounts = bankConnections[0].accounts as { balance: number }[] | null
    if (accounts && accounts.length > 0) {
      bankBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0)
    }
  }

  // Fetch upcoming deadlines
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: deadlines } = await supabase
    .from('deadlines')
    .select('*, customer:customers(id, name)')
    .eq('user_id', user.id)
    .eq('is_completed', false)
    .or(`due_date.lt.${today},due_date.lte.${nextWeek}`)
    .order('due_date', { ascending: true })

  // Receipt queue
  const { count: pendingReviewCount } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'extracted')

  const receiptQueue: ReceiptQueueSummary = {
    unmatched_receipts_count: 0,
    unmatched_transactions_count: 0,
    pending_review_count: pendingReviewCount || 0,
    streak_count: 0,
  }

  return (
    <InsightsDashboard
      firstName={firstName}
      settings={settings}
      taxWarning={taxWarning}
      summary={{
        ytd: ytdTotals,
        mtd: mtdTotals,
        uncategorizedCount,
        unpaidInvoicesCount: (unpaidInvoices || []).length,
        unpaidInvoicesTotal: unpaidTotal,
        overdueInvoicesCount: overdueCount,
        overdueInvoicesTotal: overdueTotal,
        bankBalance,
        mileageEntries: mileageEntries || [],
        deadlines: (deadlines || []) as Deadline[],
        receiptQueue,
        upcomingPaymentsTotal,
        upcomingPaymentsCount: (upcomingPayments || []).length,
        taxObligationsThisMonth: taxThisMonth,
      }}
      onboardingProgress={onboardingProgress}
    />
  )
}
