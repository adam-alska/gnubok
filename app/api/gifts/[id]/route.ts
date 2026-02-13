import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { classifyGift } from '@/lib/benefits/gift-classifier'
import { createGiftJournalEntry } from '@/lib/benefits/gift-booking'
import type { CreateGiftInput, GiftInput, Gift } from '@/types'

/**
 * GET /api/gifts/[id]
 * Get a single gift by ID
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('gifts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Gift not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

/**
 * PUT /api/gifts/[id]
 * Update a gift with re-classification
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: Partial<CreateGiftInput> = await request.json()

  // First, get existing gift to merge with updates
  const { data: existing, error: fetchError } = await supabase
    .from('gifts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Gift not found' }, { status: 404 })
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  // Merge existing with updates
  const merged = {
    date: body.date ?? existing.date,
    brand_name: body.brand_name ?? existing.brand_name,
    description: body.description ?? existing.description,
    estimated_value: body.estimated_value ?? existing.estimated_value,
    has_motprestation: body.has_motprestation ?? existing.has_motprestation,
    used_in_business: body.used_in_business ?? existing.used_in_business,
    used_privately: body.used_privately ?? existing.used_privately,
    is_simple_promo: body.is_simple_promo ?? existing.is_simple_promo,
  }

  // Re-classify with updated values
  const classificationInput: GiftInput = {
    estimatedValue: merged.estimated_value,
    hasMotprestation: merged.has_motprestation,
    usedInBusiness: merged.used_in_business,
    usedPrivately: merged.used_privately,
    isSimplePromoItem: merged.is_simple_promo,
  }
  const classification = classifyGift(classificationInput)

  // Update the gift
  const { data, error } = await supabase
    .from('gifts')
    .update({
      ...merged,
      classification,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Handle journal entry update
  // If classification changed to/from taxable, we may need to create/update entry
  const wasBookable = existing.classification?.taxable && existing.journal_entry_id
  const isBookable = classification.taxable

  if (isBookable && !existing.journal_entry_id) {
    // Need to create a new journal entry
    try {
      const journalEntry = await createGiftJournalEntry(user.id, data as Gift)
      if (journalEntry) {
        await supabase
          .from('gifts')
          .update({ journal_entry_id: journalEntry.id })
          .eq('id', id)
        data.journal_entry_id = journalEntry.id
      }
    } catch (bookingError) {
      console.error('Failed to create gift journal entry:', bookingError)
      return NextResponse.json({
        data,
        warning: 'Gåvan uppdaterades men bokföring kunde inte skapas.',
      })
    }
  } else if (isBookable && existing.journal_entry_id) {
    // Classification changed but still taxable - add warning that old entry may need reversal
    return NextResponse.json({
      data,
      warning: 'Klassificeringen ändrades. Den befintliga verifikationen kan behöva makuleras manuellt.',
    })
  }

  return NextResponse.json({ data })
}

/**
 * DELETE /api/gifts/[id]
 * Delete a gift
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase.from('gifts').delete().eq('id', id).eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
