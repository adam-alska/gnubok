import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardNav from '@/components/dashboard/DashboardNav'
import DashboardContent from '@/components/dashboard/DashboardContent'
import type { Deadline, ReceiptQueueSummary } from '@/types'
import { ChatWidget } from '@/components/chat'

export default async function RootPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch company settings
  const { data: settings } = await supabase
    .from('company_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!settings?.onboarding_complete) {
    redirect('/onboarding')
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

  // Calculate VAT from unpaid invoices
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

  const { count: unmatchedTxCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .lt('amount', 0)
    .is('receipt_id', null)

  // Count journal entries missing underlag (documents)
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
    unmatched_transactions_count: unmatchedTxCount || 0,
    pending_review_count: pendingReviewCount || 0,
    streak_count: streakCount,
  }

  // Fetch enabled extension toggles
  const { data: enabledToggles } = await supabase
    .from('extension_toggles')
    .select('sector_slug, extension_slug')
    .eq('user_id', user.id)
    .eq('enabled', true)

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav companyName={settings.company_name || 'Min verksamhet'} entityType={settings.entity_type || 'enskild_firma'} />
      <main className="pb-20 md:pb-0 md:pl-64">
        <div className="container max-w-6xl mx-auto px-4 py-6">
          <DashboardContent
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
            enabledExtensions={enabledToggles || []}
          />
        </div>
        <ChatWidget />
      </main>
    </div>
  )
}
