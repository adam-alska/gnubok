import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { checkExclusivityConflicts } from '@/lib/campaigns/exclusivity-checker'
import type {
  ContractExtractionResult,
  CreateCampaignInput,
  CreateDeliverableInput,
  CreateExclusivityInput,
  Exclusivity,
} from '@/types'

interface CreateFromContractInput {
  contractId: string
  extraction: ContractExtractionResult
  customerId: string | null
  endCustomerId: string | null
  brandName?: string | null
  createNewCustomer?: {
    name: string
    org_number?: string
    email?: string
    customer_type: 'individual' | 'swedish_business' | 'eu_business' | 'non_eu_business'
  }
  createNewEndCustomer?: {
    name: string
    org_number?: string
    email?: string
    customer_type: 'individual' | 'swedish_business' | 'eu_business' | 'non_eu_business'
  }
  overrides?: Partial<CreateCampaignInput>
}

/**
 * POST /api/campaigns/from-contract
 * Create a campaign from extracted contract data
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: CreateFromContractInput = await request.json()
  const { contractId, extraction, overrides } = body
  let { customerId, endCustomerId } = body

  // Verify contract exists and belongs to user
  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .eq('user_id', user.id)
    .single()

  if (contractError) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  }

  try {
    // Create new customers if needed
    if (body.createNewCustomer && !customerId) {
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          user_id: user.id,
          name: body.createNewCustomer.name,
          org_number: body.createNewCustomer.org_number,
          email: body.createNewCustomer.email,
          customer_type: body.createNewCustomer.customer_type,
          country: 'Sweden',
          default_payment_terms: extraction.financials.paymentTerms || 30,
        })
        .select()
        .single()

      if (customerError) {
        throw new Error(`Failed to create customer: ${customerError.message}`)
      }
      customerId = newCustomer.id
    }

    if (body.createNewEndCustomer && !endCustomerId) {
      const { data: newEndCustomer, error: endCustomerError } = await supabase
        .from('customers')
        .insert({
          user_id: user.id,
          name: body.createNewEndCustomer.name,
          org_number: body.createNewEndCustomer.org_number,
          email: body.createNewEndCustomer.email,
          customer_type: body.createNewEndCustomer.customer_type,
          country: 'Sweden',
          default_payment_terms: 30,
        })
        .select()
        .single()

      if (endCustomerError) {
        throw new Error(`Failed to create end customer: ${endCustomerError.message}`)
      }
      endCustomerId = newEndCustomer.id
    }

    // Create campaign
    const campaignData: CreateCampaignInput = {
      customer_id: customerId || undefined,
      end_customer_id: endCustomerId || undefined,
      name: extraction.campaignName || `Samarbete ${new Date().toLocaleDateString('sv-SE')}`,
      brand_name: body.brandName || extraction.parties.brand?.name || undefined,
      campaign_type: 'influencer',
      total_value: extraction.financials.amount || undefined,
      currency: extraction.financials.currency || 'SEK',
      vat_included: extraction.financials.vatIncluded ?? false,
      payment_terms: extraction.financials.paymentTerms || undefined,
      billing_frequency: extraction.financials.billingFrequency || undefined,
      start_date: extraction.period.startDate || undefined,
      end_date: extraction.period.endDate || undefined,
      publication_date: extraction.period.publicationDate || undefined,
      draft_deadline: (extraction.period as Record<string, unknown>).draftDeadline as string || undefined,
      ...overrides,
    }

    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        user_id: user.id,
        ...campaignData,
        status: 'contracted',
        contract_signed_at: extraction.signingDate || new Date().toISOString().split('T')[0],
      })
      .select()
      .single()

    if (campaignError) {
      throw new Error(`Failed to create campaign: ${campaignError.message}`)
    }

    // Link contract to campaign
    await supabase
      .from('contracts')
      .update({
        campaign_id: campaign.id,
        is_primary: true,
        extraction_status: 'completed',
      })
      .eq('id', contractId)

    // Create deliverables
    const deliverables: { id: string }[] = []
    for (const del of extraction.deliverables) {
      const deliverableData: CreateDeliverableInput = {
        campaign_id: campaign.id,
        title: del.description || `${del.type} - ${del.platform || 'Okänd plattform'}`,
        deliverable_type: del.type,
        platform: del.platform || 'instagram',
        account_handle: del.account || undefined,
        quantity: del.quantity,
        due_date: del.dueDate || undefined,
      }

      const { data: deliverable, error: deliverableError } = await supabase
        .from('deliverables')
        .insert({
          user_id: user.id,
          ...deliverableData,
          status: 'pending',
        })
        .select('id')
        .single()

      if (deliverableError) {
        console.error('Failed to create deliverable:', deliverableError)
        continue
      }
      deliverables.push(deliverable)
    }

    // Create exclusivity if present
    let exclusivityConflicts: unknown[] = []
    if (extraction.exclusivity.categories.length > 0) {
      // Calculate exclusivity dates
      const exclusivityStart = extraction.period.startDate ||
        new Date().toISOString().split('T')[0]

      let exclusivityEnd = extraction.period.endDate ||
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      // Extend end date if post period specified
      if (extraction.exclusivity.postPeriodDays) {
        const endDate = new Date(exclusivityEnd)
        endDate.setDate(endDate.getDate() + extraction.exclusivity.postPeriodDays)
        exclusivityEnd = endDate.toISOString().split('T')[0]
      }

      // Check for conflicts
      const { data: existingExclusivities } = await supabase
        .from('exclusivities')
        .select('*, campaign:campaigns(*)')
        .eq('user_id', user.id)
        .neq('campaign_id', campaign.id)

      if (existingExclusivities) {
        exclusivityConflicts = checkExclusivityConflicts(
          {
            categories: extraction.exclusivity.categories,
            start_date: exclusivityStart,
            end_date: exclusivityEnd,
          } as Exclusivity,
          existingExclusivities as Exclusivity[]
        )
      }

      const exclusivityData: CreateExclusivityInput = {
        campaign_id: campaign.id,
        categories: extraction.exclusivity.categories,
        excluded_brands: extraction.exclusivity.excludedBrands,
        start_date: exclusivityStart,
        end_date: exclusivityEnd,
        start_calculation_type: 'absolute',
        end_calculation_type: extraction.exclusivity.postReference ? 'relative' : 'absolute',
        end_reference: extraction.exclusivity.postReference || undefined,
        end_offset_days: extraction.exclusivity.postPeriodDays || undefined,
      }

      await supabase
        .from('exclusivities')
        .insert({
          user_id: user.id,
          ...exclusivityData,
        })
    }

    // Create deadlines
    const createdDeadlines: unknown[] = []
    for (const deadline of extraction.deadlines) {
      let dueDate = deadline.absoluteDate

      // Calculate relative dates if possible
      if (!dueDate && deadline.isRelative && deadline.referenceEvent && deadline.offsetDays) {
        let referenceDate: string | null = null

        switch (deadline.referenceEvent) {
          case 'publication':
            referenceDate = extraction.period.publicationDate
            break
          case 'delivery':
            referenceDate = extraction.period.endDate
            break
          case 'contract':
            referenceDate = extraction.signingDate
            break
        }

        if (referenceDate) {
          const refDate = new Date(referenceDate)
          refDate.setDate(refDate.getDate() + deadline.offsetDays)
          dueDate = refDate.toISOString().split('T')[0]
        }
      }

      // Skip if we still don't have a date
      if (!dueDate) continue

      const { data: createdDeadline, error: deadlineError } = await supabase
        .from('deadlines')
        .insert({
          user_id: user.id,
          title: deadline.description,
          due_date: dueDate,
          deadline_type: deadline.type,
          priority: 'normal',
          customer_id: customerId,
          campaign_id: campaign.id,
          is_auto_generated: true,
          date_calculation_type: deadline.isRelative ? 'relative' : 'absolute',
          reference_event: deadline.referenceEvent,
          offset_days: deadline.offsetDays,
        })
        .select()
        .single()

      if (!deadlineError && createdDeadline) {
        createdDeadlines.push(createdDeadline)
      }
    }

    // Also create standard campaign deadlines
    if (campaign.end_date) {
      // Invoicing deadline (5 days after end)
      const invoiceDate = new Date(campaign.end_date)
      invoiceDate.setDate(invoiceDate.getDate() + 5)

      await supabase.from('deadlines').insert({
        user_id: user.id,
        title: `Fakturera: ${campaign.name}`,
        due_date: invoiceDate.toISOString().split('T')[0],
        deadline_type: 'invoicing',
        priority: 'important',
        customer_id: customerId,
        campaign_id: campaign.id,
        is_auto_generated: true,
      })
    }

    return NextResponse.json({
      data: {
        campaign,
        deliverablesCreated: deliverables.length,
        deadlinesCreated: createdDeadlines.length,
        exclusivityConflicts,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create campaign'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
