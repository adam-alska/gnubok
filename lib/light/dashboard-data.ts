import { createClient } from '@/lib/supabase/server'
import { calculateLightTax } from '@/lib/tax/light-calculator'
import type { Gift, GiftClassification } from '@/types'

export interface LightDashboardData {
  firstName: string | null
  bankBalance: number | null
  giftTaxDebt: number
  taxableGiftCount: number
  effectiveRate: number
  daysSinceLastPayout: number | null
  hobbyReserve: number
  recentEntries: Array<{
    id: string
    date: string
    description: string | null
    gross_amount: number
    net_amount: number
    service_fee: number
    pension_deduction: number
    social_fees: number
    income_tax_withheld: number
    platform_fee: number
    type: string
    provider: string | null
  }>
}

export async function fetchLightDashboardData(
  userId: string
): Promise<LightDashboardData> {
  const supabase = await createClient()

  const currentYear = new Date().getFullYear()
  const startOfYear = `${currentYear}-01-01`
  const endOfYear = `${currentYear}-12-31`

  // Run all queries in parallel
  const [
    profileResult,
    settingsResult,
    bankResult,
    giftsResult,
    entriesResult,
    lastPayoutResult,
  ] = await Promise.all([
    // 1. Fetch profile for name
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single(),

    // 2. Fetch company settings for tax rates and umbrella config
    supabase
      .from('company_settings')
      .select(
        'municipal_tax_rate, church_tax, church_tax_rate, umbrella_provider, umbrella_fee_percent, umbrella_pension_percent'
      )
      .eq('user_id', userId)
      .single(),

    // 3. Fetch bank balance
    supabase
      .from('bank_connections')
      .select('accounts, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1),

    // 4. Fetch gifts for current year (not returned)
    supabase
      .from('gifts')
      .select('estimated_value, classification, returned')
      .eq('user_id', userId)
      .eq('returned', false)
      .gte('date', startOfYear)
      .lte('date', endOfYear),

    // 5. Fetch shadow ledger entries for current year (recent first, for the card)
    supabase
      .from('shadow_ledger_entries')
      .select(
        'id, date, description, gross_amount, net_amount, service_fee, pension_deduction, social_fees, income_tax_withheld, platform_fee, type, provider'
      )
      .eq('user_id', userId)
      .gte('date', startOfYear)
      .lte('date', endOfYear)
      .order('date', { ascending: false })
      .limit(5),

    // 6. Fetch last payout date for SGI shield
    supabase
      .from('shadow_ledger_entries')
      .select('date')
      .eq('user_id', userId)
      .eq('type', 'payout')
      .order('date', { ascending: false })
      .limit(1),
  ])

  // Parse profile
  const firstName = profileResult.data?.full_name?.split(' ')[0] || null

  // Parse settings
  const settings = settingsResult.data
  const municipalTaxRate = Number(settings?.municipal_tax_rate) || 0.3238
  const churchTaxRate = settings?.church_tax
    ? Number(settings?.church_tax_rate) || 0.01
    : 0
  const effectiveRate = municipalTaxRate + churchTaxRate

  // Parse bank balance
  let bankBalance: number | null = null
  const bankConnections = bankResult.data
  if (bankConnections && bankConnections.length > 0) {
    const accounts = bankConnections[0].accounts as
      | { balance: number }[]
      | null
    if (accounts && accounts.length > 0) {
      bankBalance = accounts.reduce(
        (sum, acc) => sum + (acc.balance || 0),
        0
      )
    }
  }

  // Parse gifts and compute taxable value
  const gifts = giftsResult.data || []
  let taxableGiftValue = 0
  let taxableGiftCount = 0

  for (const gift of gifts as Pick<
    Gift,
    'estimated_value' | 'classification' | 'returned'
  >[]) {
    const classification = gift.classification as GiftClassification | null
    if (classification?.taxable) {
      taxableGiftCount++
      taxableGiftValue += Number(gift.estimated_value)
    }
  }

  // Calculate light tax to get gift tax debt and hobby reserve
  const lightTax = calculateLightTax({
    taxableGiftValue,
    municipalTaxRate,
    churchTaxRate,
    bankBalance,
  })

  const giftTaxDebt = lightTax.gift_tax
  const hobbyReserve = lightTax.hobby_tax

  // Parse shadow ledger entries
  const recentEntries = (entriesResult.data || []).map((entry) => ({
    id: entry.id as string,
    date: entry.date as string,
    description: entry.description as string | null,
    gross_amount: Number(entry.gross_amount),
    net_amount: Number(entry.net_amount),
    service_fee: Number(entry.service_fee),
    pension_deduction: Number(entry.pension_deduction),
    social_fees: Number(entry.social_fees),
    income_tax_withheld: Number(entry.income_tax_withheld),
    platform_fee: Number(entry.platform_fee),
    type: entry.type as string,
    provider: entry.provider as string | null,
  }))

  // Calculate days since last payout
  let daysSinceLastPayout: number | null = null
  const lastPayout = lastPayoutResult.data
  if (lastPayout && lastPayout.length > 0) {
    const lastPayoutDate = new Date(lastPayout[0].date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    lastPayoutDate.setHours(0, 0, 0, 0)
    const diffMs = today.getTime() - lastPayoutDate.getTime()
    daysSinceLastPayout = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  }

  return {
    firstName,
    bankBalance,
    giftTaxDebt,
    taxableGiftCount,
    effectiveRate,
    daysSinceLastPayout,
    hobbyReserve,
    recentEntries,
  }
}
