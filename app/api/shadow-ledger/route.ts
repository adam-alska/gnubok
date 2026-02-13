import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { calculateGiftVirtualTaxDebt } from '@/lib/tax/light-calculator'
import type { CreateShadowLedgerEntryInput } from '@/types'

/**
 * GET /api/shadow-ledger
 * List shadow ledger entries for the authenticated user
 * Query params: year (optional, defaults to current year)
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

  const { data, error } = await supabase
    .from('shadow_ledger_entries')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * POST /api/shadow-ledger
 * Create a new shadow ledger entry
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: CreateShadowLedgerEntryInput = await request.json()

  if (!body.date || !body.type || body.gross_amount === undefined || body.net_amount === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Fetch settings for umbrella config and tax rates
  const { data: settings } = await supabase
    .from('company_settings')
    .select('umbrella_provider, umbrella_fee_percent, umbrella_pension_percent, municipal_tax_rate, church_tax, church_tax_rate')
    .eq('user_id', user.id)
    .single()

  // For payout type: auto-populate service_fee and pension_deduction from settings if not provided
  let serviceFee = body.service_fee ?? 0
  let pensionDeduction = body.pension_deduction ?? 0
  let provider = body.provider ?? null

  if (body.type === 'payout' && settings) {
    if (!body.provider && settings.umbrella_provider) {
      provider = settings.umbrella_provider
    }
    if (body.service_fee === undefined && settings.umbrella_fee_percent) {
      serviceFee = Math.round(body.gross_amount * (Number(settings.umbrella_fee_percent) / 100) * 100) / 100
    }
    if (body.pension_deduction === undefined && settings.umbrella_pension_percent) {
      pensionDeduction = Math.round(body.gross_amount * (Number(settings.umbrella_pension_percent) / 100) * 100) / 100
    }
  }

  // Calculate virtual tax debt for gift entries
  let virtualTaxDebt = 0
  if (body.type === 'gift' && settings) {
    const municipalRate = Number(settings.municipal_tax_rate) || 0.3238
    const churchRate = settings.church_tax ? (Number(settings.church_tax_rate) || 0.01) : 0
    virtualTaxDebt = calculateGiftVirtualTaxDebt(body.gross_amount, municipalRate, churchRate)
  }

  const { data, error } = await supabase
    .from('shadow_ledger_entries')
    .insert({
      user_id: user.id,
      date: body.date,
      type: body.type,
      source: body.source || 'manual',
      provider,
      gross_amount: body.gross_amount,
      platform_fee: body.platform_fee ?? 0,
      service_fee: serviceFee,
      pension_deduction: pensionDeduction,
      social_fees: body.social_fees ?? 0,
      income_tax_withheld: body.income_tax_withheld ?? 0,
      net_amount: body.net_amount,
      currency: body.currency || 'SEK',
      description: body.description || null,
      bank_transaction_id: body.bank_transaction_id || null,
      gift_id: body.gift_id || null,
      campaign_id: body.campaign_id || null,
      metadata: body.metadata || {},
      virtual_tax_debt: virtualTaxDebt,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
