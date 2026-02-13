import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardContent from '@/components/dashboard/DashboardContent'
import LightDashboardContent from '@/components/dashboard/LightDashboardContent'
import type { Gift, GiftSummary, Deadline, Campaign, ReceiptQueueSummary, OnboardingProgress, ShadowLedgerEntry } from '@/types'

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

  // ── Light mode early return ──────────────────────────────────────────
  if (settings?.entity_type === 'light') {
    const currentYear = new Date().getFullYear()
    const lightStartOfYear = `${currentYear}-01-01`
    const lightEndOfYear = `${currentYear}-12-31`

    // Fetch bank balance
    const { data: lightBankConnections } = await supabase
      .from('bank_connections')
      .select('accounts, status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)

    let lightBankBalance: number | null = null
    if (lightBankConnections && lightBankConnections.length > 0) {
      const accounts = lightBankConnections[0].accounts as { balance: number }[] | null
      if (accounts && accounts.length > 0) {
        lightBankBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0)
      }
    }

    // Fetch gifts for current year
    const { data: lightGifts } = await supabase
      .from('gifts')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', lightStartOfYear)

    // Fetch shadow ledger entries for current year
    const { data: shadowLedgerEntriesRaw } = await supabase
      .from('shadow_ledger_entries')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', lightStartOfYear)
      .lte('date', lightEndOfYear)
      .order('date', { ascending: false })

    const shadowLedgerEntries: ShadowLedgerEntry[] = (shadowLedgerEntriesRaw || []) as ShadowLedgerEntry[]

    // Fetch active campaigns
    const { data: lightCampaigns } = await supabase
      .from('campaigns')
      .select(`
        *,
        customer:customers!campaigns_customer_id_fkey(id, name),
        deliverables(*)
      `)
      .eq('user_id', user.id)
      .in('status', ['negotiation', 'contracted', 'active'])
      .order('created_at', { ascending: false })

    // Fetch upcoming deadlines (next 7 days + overdue)
    const lightToday = new Date().toISOString().split('T')[0]
    const lightNextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data: lightDeadlines } = await supabase
      .from('deadlines')
      .select('*, customer:customers(id, name)')
      .eq('user_id', user.id)
      .eq('is_completed', false)
      .or(`due_date.lt.${lightToday},due_date.lte.${lightNextWeek}`)
      .order('due_date', { ascending: true })

    // Compute gift tax debt from gifts data
    const taxableGifts = (lightGifts || []).filter(
      (g: Gift) => g.classification?.taxable && !g.returned
    )
    const taxableGiftValue = taxableGifts.reduce(
      (sum: number, g: Gift) => sum + Number(g.estimated_value), 0
    )
    const municipalRate = Number(settings.municipal_tax_rate) || 0.3238
    const churchRate = settings.church_tax ? (Number(settings.church_tax_rate) || 0.01) : 0
    const effectiveRate = municipalRate + churchRate
    const giftTaxDebt = Math.round(taxableGiftValue * effectiveRate * 100) / 100

    // Find days since last payout
    const lastPayout = shadowLedgerEntries.find(e => e.type === 'payout')
    let daysSinceLastPayout: number | null = null
    if (lastPayout) {
      const lastPayoutDate = new Date(lastPayout.date)
      const today = new Date()
      daysSinceLastPayout = Math.floor((today.getTime() - lastPayoutDate.getTime()) / (1000 * 60 * 60 * 24))
    }

    // Recent entries for payout card (last 5)
    const recentEntries = shadowLedgerEntries.slice(0, 5).map(e => ({
      id: e.id,
      date: e.date,
      description: e.description,
      gross_amount: Number(e.gross_amount),
      net_amount: Number(e.net_amount),
      service_fee: Number(e.service_fee),
      pension_deduction: Number(e.pension_deduction),
      social_fees: Number(e.social_fees),
      income_tax_withheld: Number(e.income_tax_withheld),
      platform_fee: Number(e.platform_fee),
      type: e.type,
      provider: e.provider,
    }))

    return (
      <LightDashboardContent
        firstName={firstName}
        bankBalance={lightBankBalance}
        giftTaxDebt={giftTaxDebt}
        taxableGiftCount={taxableGifts.length}
        effectiveRate={effectiveRate}
        daysSinceLastPayout={daysSinceLastPayout}
        recentEntries={recentEntries}
        hobbyReserve={0}
      />
    )
  }

  // ── EF / AB dashboard (existing logic) ──────────────────────────────
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

  const { count: bankConnectionCount } = await supabase
    .from('bank_connections')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active')

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

  // Fetch mileage entries for schablonavdrag
  const { data: mileageEntries } = await supabase
    .from('mileage_entries')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', startOfYear.split('T')[0])

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

  // Fetch active campaigns with deliverables
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select(`
      *,
      customer:customers!campaigns_customer_id_fkey(id, name),
      deliverables(*)
    `)
    .eq('user_id', user.id)
    .in('status', ['negotiation', 'contracted', 'active'])
    .order('created_at', { ascending: false })

  // Fetch gift summary for current year
  const { data: gifts } = await supabase
    .from('gifts')
    .select('estimated_value, classification')
    .eq('user_id', user.id)
    .gte('date', startOfYear.split('T')[0])

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

  let giftSummary: GiftSummary | null = null
  if (gifts && gifts.length > 0) {
    giftSummary = {
      year: new Date().getFullYear(),
      total_count: gifts.length,
      total_value: 0,
      taxable_count: 0,
      taxable_value: 0,
      tax_free_count: 0,
      tax_free_value: 0,
      deductible_count: 0,
      deductible_value: 0,
    }

    for (const gift of gifts as Pick<Gift, 'estimated_value' | 'classification'>[]) {
      const value = Number(gift.estimated_value)
      const classification = gift.classification

      giftSummary.total_value += value

      if (classification?.taxable) {
        giftSummary.taxable_count++
        giftSummary.taxable_value += value
      } else {
        giftSummary.tax_free_count++
        giftSummary.tax_free_value += value
      }

      if (classification?.deductibleAsExpense) {
        giftSummary.deductible_count++
        giftSummary.deductible_value += value
      }
    }
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
        mileageEntries: mileageEntries || [],
        giftSummary,
        deadlines: (deadlines || []) as Deadline[],
        campaigns: (campaigns || []) as Campaign[],
        receiptQueue,
      }}
      onboardingProgress={onboardingProgress}
    />
  )
}
