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

  // Fetch current year date boundaries
  const startOfYearStr = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  const startOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Source types that require supporting documents
  const needsDocSourceTypes = [
    'manual',
    'bank_transaction',
    'supplier_invoice_registered',
    'supplier_invoice_paid',
    'supplier_invoice_cash_payment',
    'import',
  ]

  // Fetch all data in parallel
  const [
    { data: profile },
    { data: settings },
    { count: customerCount },
    { count: invoiceCount },
    { count: transactionCount },
    { data: journalLines },
    { data: transactions },
    { data: unpaidInvoices },
    { data: bankConnections },
    { data: deadlines },
    { count: pendingReviewCount },
    { count: unmatchedReceiptsCount },
    { count: unmatchedTransactionsCount },
    { count: postedEntriesCount },
    { data: entriesWithDocs },
    { data: enabledToggles },
  ] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
    supabase.from('company_settings').select('*').eq('user_id', user.id).single(),
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('journal_entry_lines')
      .select('account_number, debit_amount, credit_amount, journal_entry:journal_entries!inner(entry_date, status)')
      .eq('journal_entry.status', 'posted')
      .gte('journal_entry.entry_date', startOfYearStr),
    supabase.from('transactions').select('amount, amount_sek, is_business').eq('user_id', user.id).gte('date', startOfYearStr),
    supabase.from('invoices').select('total, total_sek, vat_amount, vat_amount_sek, status').eq('user_id', user.id).in('status', ['sent', 'overdue']),
    supabase.from('bank_connections').select('id, accounts_data, status, consent_expires, bank_name').eq('user_id', user.id).eq('status', 'active'),
    supabase.from('deadlines').select('*, customer:customers(id, name)').eq('user_id', user.id).eq('is_completed', false)
      .or(`due_date.lt.${today},due_date.lte.${nextWeek}`).order('due_date', { ascending: true }),
    supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'extracted'),
    supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'confirmed').is('matched_transaction_id', null),
    supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', user.id).lt('amount', 0).is('receipt_id', null),
    supabase.from('journal_entries').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'posted').in('source_type', needsDocSourceTypes),
    supabase.from('document_attachments').select('journal_entry_id').eq('user_id', user.id).eq('is_current_version', true).not('journal_entry_id', 'is', null),
    supabase.from('extension_toggles').select('sector_slug, extension_slug').eq('user_id', user.id).eq('enabled', true),
  ])

  const firstName = profile?.full_name?.split(' ')[0] || null

  const onboardingProgress: OnboardingProgress = {
    hasCustomers: (customerCount || 0) > 0,
    hasInvoices: (invoiceCount || 0) > 0,
    hasBankConnected: (transactionCount || 0) > 0,
  }

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

  const unpaidTotal = (unpaidInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.total_sek || inv.total),
    0
  )

  const unpaidVatTotal = (unpaidInvoices || []).reduce(
    (sum, inv) => sum + Number(inv.vat_amount_sek || inv.vat_amount || 0),
    0
  )

  const overdueCount = (unpaidInvoices || []).filter(
    (inv) => inv.status === 'overdue'
  ).length

  let bankBalance: number | null = null
  if (bankConnections && bankConnections.length > 0) {
    const allBalances = bankConnections.flatMap(conn => {
      const accounts = conn.accounts_data as { balance: number }[] | null
      return accounts || []
    })
    if (allBalances.length > 0) {
      bankBalance = allBalances.reduce((sum, acc) => sum + (acc.balance || 0), 0)
    }
  }

  const nowMs = new Date().getTime()
  const expiringBankConnections = (bankConnections || [])
    .filter(conn => {
      if (!conn.consent_expires) return false
      const daysLeft = Math.ceil(
        (new Date(conn.consent_expires).getTime() - nowMs) / (1000 * 60 * 60 * 24)
      )
      return daysLeft > 0 && daysLeft <= 14
    })
    .map(conn => ({
      id: conn.id as string,
      bank_name: conn.bank_name as string,
      days_left: Math.ceil(
        (new Date(conn.consent_expires!).getTime() - nowMs) / (1000 * 60 * 60 * 24)
      ),
    }))

  const uniqueEntriesWithDocs = new Set(
    (entriesWithDocs || []).map((d) => d.journal_entry_id)
  ).size

  const missingUnderlagCount = Math.max(0, (postedEntriesCount || 0) - uniqueEntriesWithDocs)

  const receiptQueue: ReceiptQueueSummary = {
    unmatched_receipts_count: unmatchedReceiptsCount || 0,
    unmatched_transactions_count: unmatchedTransactionsCount || 0,
    pending_review_count: pendingReviewCount || 0,
    streak_count: 0,
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
        expiringBankConnections,
        deadlines: (deadlines || []) as Deadline[],
        receiptQueue,
        missingUnderlagCount,
      }}
      onboardingProgress={onboardingProgress}
      enabledExtensions={enabledToggles || []}
    />
  )
}
