import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { classifyGift, classifyGiftForEntity } from '@/lib/benefits/gift-classifier'
import { createGiftJournalEntry } from '@/lib/benefits/gift-booking'
import { calculateGiftVirtualTaxDebt } from '@/lib/tax/light-calculator'
import type { CreateGiftInput, GiftInput, Gift, EntityType } from '@/types'

/**
 * GET /api/gifts
 * List gifts for the authenticated user
 * Query params: year (optional, defaults to current year)
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse query params
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') || new Date().getFullYear().toString()

  // Build date range for the year
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const { data, error } = await supabase
    .from('gifts')
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
 * POST /api/gifts
 * Create a new gift with auto-classification
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: CreateGiftInput = await request.json()

  // Validate required fields
  if (!body.date || !body.brand_name || !body.description || body.estimated_value === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Fetch entity type and tax settings
  const { data: settings } = await supabase
    .from('company_settings')
    .select('entity_type, municipal_tax_rate, church_tax, church_tax_rate')
    .eq('user_id', user.id)
    .single()

  const entityType: EntityType = (settings?.entity_type as EntityType) || 'enskild_firma'

  // Build classification input
  const classificationInput: GiftInput = {
    estimatedValue: body.estimated_value,
    hasMotprestation: body.has_motprestation,
    usedInBusiness: body.used_in_business,
    usedPrivately: body.used_privately,
    isSimplePromoItem: body.is_simple_promo || false,
  }

  // Classify the gift using entity-type-aware classifier
  const classification = classifyGiftForEntity(classificationInput, entityType)

  // Insert the gift with classification
  const { data, error } = await supabase
    .from('gifts')
    .insert({
      user_id: user.id,
      date: body.date,
      brand_name: body.brand_name,
      description: body.description,
      estimated_value: body.estimated_value,
      has_motprestation: body.has_motprestation,
      used_in_business: body.used_in_business,
      used_privately: body.used_privately,
      is_simple_promo: body.is_simple_promo || false,
      classification,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (entityType === 'light') {
    // Light mode: create shadow_ledger_entry instead of journal entry
    if (classification.taxable && data) {
      try {
        const municipalRate = Number(settings?.municipal_tax_rate) || 0.3238
        const churchRate = settings?.church_tax ? (Number(settings?.church_tax_rate) || 0.01) : 0
        const virtualTaxDebt = calculateGiftVirtualTaxDebt(
          body.estimated_value,
          municipalRate,
          churchRate
        )

        await supabase
          .from('shadow_ledger_entries')
          .insert({
            user_id: user.id,
            date: body.date,
            type: 'gift',
            source: 'manual',
            gross_amount: body.estimated_value,
            net_amount: body.estimated_value,
            description: `Gåva: ${body.description} (${body.brand_name})`,
            gift_id: data.id,
            virtual_tax_debt: virtualTaxDebt,
          })
      } catch (err) {
        console.error('Failed to create shadow ledger entry for gift:', err)
      }
    }
  } else {
    // EF/AB mode: create journal entry for taxable gifts
    let journalEntryId: string | null = null
    if (classification.taxable && data) {
      try {
        const journalEntry = await createGiftJournalEntry(user.id, data as Gift)
        if (journalEntry) {
          journalEntryId = journalEntry.id

          // Update gift with journal entry reference
          await supabase
            .from('gifts')
            .update({ journal_entry_id: journalEntryId })
            .eq('id', data.id)

          // Update the returned data
          data.journal_entry_id = journalEntryId
        }
      } catch (bookingError) {
        console.error('Failed to create gift journal entry:', bookingError)
        return NextResponse.json({
          data,
          warning: 'Gåvan sparades men bokföring kunde inte skapas. Kontrollera att räkenskapsår finns.',
        })
      }
    }
  }

  return NextResponse.json({ data })
}
