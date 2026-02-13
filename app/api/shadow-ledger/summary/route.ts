import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { ShadowLedgerSummary, ShadowLedgerEntryType } from '@/types'

/**
 * GET /api/shadow-ledger/summary
 * Aggregated summary of shadow ledger entries for a year
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') || new Date().getFullYear().toString()

  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const { data: entries, error } = await supabase
    .from('shadow_ledger_entries')
    .select('type, gross_amount, net_amount, service_fee, income_tax_withheld, pension_deduction, social_fees, platform_fee, virtual_tax_debt')
    .eq('user_id', user.id)
    .gte('date', startDate)
    .lte('date', endDate)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const types: ShadowLedgerEntryType[] = ['payout', 'gift', 'expense', 'hobby_income', 'hobby_expense']
  const byType = {} as Record<ShadowLedgerEntryType, { count: number; gross: number; net: number }>
  for (const t of types) {
    byType[t] = { count: 0, gross: 0, net: 0 }
  }

  let totalGross = 0
  let totalNet = 0
  let totalFees = 0
  let totalTaxWithheld = 0
  let totalPension = 0
  let totalSocialFees = 0
  let totalPlatformFees = 0
  let virtualTaxDebt = 0

  for (const entry of entries || []) {
    const type = entry.type as ShadowLedgerEntryType
    const gross = Number(entry.gross_amount)
    const net = Number(entry.net_amount)

    totalGross += gross
    totalNet += net
    totalFees += Number(entry.service_fee) || 0
    totalTaxWithheld += Number(entry.income_tax_withheld) || 0
    totalPension += Number(entry.pension_deduction) || 0
    totalSocialFees += Number(entry.social_fees) || 0
    totalPlatformFees += Number(entry.platform_fee) || 0
    virtualTaxDebt += Number(entry.virtual_tax_debt) || 0

    if (byType[type]) {
      byType[type].count++
      byType[type].gross += gross
      byType[type].net += net
    }
  }

  const summary: ShadowLedgerSummary = {
    year: parseInt(year),
    total_gross: Math.round(totalGross * 100) / 100,
    total_net: Math.round(totalNet * 100) / 100,
    total_fees: Math.round(totalFees * 100) / 100,
    total_tax_withheld: Math.round(totalTaxWithheld * 100) / 100,
    total_pension: Math.round(totalPension * 100) / 100,
    total_social_fees: Math.round(totalSocialFees * 100) / 100,
    total_platform_fees: Math.round(totalPlatformFees * 100) / 100,
    virtual_tax_debt: Math.round(virtualTaxDebt * 100) / 100,
    entry_count: (entries || []).length,
    by_type: byType,
  }

  return NextResponse.json({ data: summary })
}
