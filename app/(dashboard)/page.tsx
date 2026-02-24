import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardContent from '@/components/dashboard/DashboardContent'
import type { Deadline, ReceiptQueueSummary, OnboardingProgress } from '@/types'

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

  // ── EF / AB dashboard ──────────────────────────────────────────────
  // Fetch onboarding progress for new user checklist
  const { count: customerCount } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: invoiceCount } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: receiptCount } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { count: transactionCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const onboardingProgress: OnboardingProgress = {
    hasCustomers: (customerCount || 0) > 0,
    hasInvoices: (invoiceCount || 0) > 0,
    hasReceipts: (receiptCount || 0) > 0,
    hasBankConnected: (transactionCount || 0) > 0,
  }

  // Fetch current year date boundaries
  const startOfYearStr = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  const startOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  // Fetch posted journal entry lines for revenue/expense accounts (classes 3-7)
  const { data: journalLines } = await supabase
    .from('journal_entry_lines')
    .select('account_number, debit_amount, credit_amount, journal_entry:journal_entries!inner(entry_date, status)')
    .eq('journal_entry.status', 'posted')
    .gte('journal_entry.entry_date', startOfYearStr)

  // Calculate totals from journal entry lines using account classes
  const calculateTotals = (lines: typeof journalLines, fromDate: string) => {
    const filtered = (lines || []).filter((l) => {
      const entry = l.journal_entry as unknown as { entry_date: string; status: string }
      return entry.entry_date >= fromDate
    })

    let revenue = 0
    let expenses = 0

    for (const line of filtered) {
      const acct = line.account_number
      if (acct.startsWith('3')) {
        // Revenue: class 3 — credit-normal accounts
        revenue += Math.round(((line.credit_amount || 0) - (line.debit_amount || 0)) * 100) / 100
      } else if (acct.startsWith('4') || acct.startsWith('5') || acct.startsWith('6') || acct.startsWith('7')) {
        // Expenses: classes 4-7 — debit-normal accounts
        expenses += Math.round(((line.debit_amount || 0) - (line.credit_amount || 0)) * 100) / 100
      }
    }

    revenue = Math.round(revenue * 100) / 100
    expenses = Math.round(expenses * 100) / 100

    return { income: revenue, expenses, net: Math.round((revenue - expenses) * 100) / 100 }
  }

  const ytdTotals = calculateTotals(journalLines, startOfYearStr)
  const mtdTotals = calculateTotals(journalLines, startOfMonthStr)

  // Fetch uncategorized transaction counts (still useful for the alert)
  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, amount_sek, is_business')
    .eq('user_id', user.id)
    .gte('date', startOfYearStr)

  const uncategorizedTxns = (transactions || []).filter(
    (t) => t.is_business === null
  )
  const uncategorizedCount = uncategorizedTxns.length
  const uncategorizedIncome = uncategorizedTxns
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + Number(t.amount_sek || t.amount), 0)
  const uncategorizedExpenses = uncategorizedTxns
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount_sek || t.amount)), 0)

  // Fetch unpaid invoices with VAT amounts
  const { data: unpaidInvoices } = await supabase
    .from('invoices')
    .select('total, total_sek, vat_amount, vat_amount_sek, status')
    .eq('user_id', user.id)
    .in('status', ['sent', 'overdue'])

  const unpaidTotal = (unpaidInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.total_sek || inv.total),
    0
  )

  // Calculate VAT from unpaid invoices (this is VAT we've invoiced but not yet received)
  const unpaidVatTotal = (unpaidInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.vat_amount_sek || inv.vat_amount || 0),
    0
  )

  const overdueCount = (unpaidInvoices || []).filter(
    (inv) => inv.status === 'overdue'
  ).length

  // Fetch bank balance (if connected)
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

  // Fetch upcoming deadlines (next 7 days + overdue)
  const today = new Date().toISOString().split('T')[0]
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: deadlines } = await supabase
    .from('deadlines')
    .select('*, customer:customers(id, name)')
    .eq('user_id', user.id)
    .eq('is_completed', false)
    .or(`due_date.lt.${today},due_date.lte.${nextWeek}`)
    .order('due_date', { ascending: true })

  // Fetch receipt queue summary
  const { count: pendingReviewCount } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'extracted')

  const { count: unmatchedReceiptsCount } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .is('matched_transaction_id', null)

  const { count: unmatchedTransactionsCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .lt('amount', 0)
    .is('receipt_id', null)

  // Count journal entries missing underlag (documents)
  // Source types that require supporting documents
  const needsDocSourceTypes = [
    'manual',
    'bank_transaction',
    'supplier_invoice_registered',
    'supplier_invoice_paid',
    'supplier_invoice_cash_payment',
    'import',
  ]

  const { count: postedEntriesCount } = await supabase
    .from('journal_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'posted')
    .in('source_type', needsDocSourceTypes)

  const { data: entriesWithDocs } = await supabase
    .from('document_attachments')
    .select('journal_entry_id')
    .eq('user_id', user.id)
    .eq('is_current_version', true)
    .not('journal_entry_id', 'is', null)

  const uniqueEntriesWithDocs = new Set(
    (entriesWithDocs || []).map((d) => d.journal_entry_id)
  ).size

  const missingUnderlagCount = Math.max(0, (postedEntriesCount || 0) - uniqueEntriesWithDocs)

  // Calculate receipt streak
  const { data: recentReceiptActivity } = await supabase
    .from('receipts')
    .select('created_at')
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(30)

  let streakCount = 0
  if (recentReceiptActivity && recentReceiptActivity.length > 0) {
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)

    const activityDates = new Set(
      recentReceiptActivity.map((r) => new Date(r.created_at).toISOString().split('T')[0])
    )

    let checkDate = new Date(todayDate)
    while (activityDates.has(checkDate.toISOString().split('T')[0])) {
      streakCount++
      checkDate.setDate(checkDate.getDate() - 1)
    }
  }

  const receiptQueue: ReceiptQueueSummary = {
    unmatched_receipts_count: unmatchedReceiptsCount || 0,
    unmatched_transactions_count: unmatchedTransactionsCount || 0,
    pending_review_count: pendingReviewCount || 0,
    streak_count: streakCount,
  }

  return (
    <DashboardContent
      firstName={firstName}
      settings={settings}
      summary={{
        ytd: ytdTotals,
        mtd: mtdTotals,
        uncategorizedCount,
        uncategorizedIncome,
        uncategorizedExpenses,
        unpaidInvoicesCount: (unpaidInvoices || []).length,
        unpaidInvoicesTotal: unpaidTotal,
        unpaidVatTotal,
        overdueInvoicesCount: overdueCount,
        bankBalance,
        deadlines: (deadlines || []) as Deadline[],
        receiptQueue,
        missingUnderlagCount,
      }}
      onboardingProgress={onboardingProgress}
    />
  )
}
