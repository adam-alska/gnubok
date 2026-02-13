import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { estimateProductValue } from '@/lib/receipts/receipt-analyzer'
import { classifyGift } from '@/lib/benefits/gift-classifier'
import type { GiftInput } from '@/types'

/**
 * POST /api/receipts/product
 * Register a product/gift without a receipt
 * Uses AI to estimate value, then routes to gift classification
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const imageFile = formData.get('image') as File | null
    const manualValue = formData.get('estimated_value') as string | null
    const brandName = formData.get('brand_name') as string | null
    const description = formData.get('description') as string | null

    // Gift classification inputs
    const hasMotprestation = formData.get('has_motprestation') === 'true'
    const usedInBusiness = formData.get('used_in_business') === 'true'
    const usedPrivately = formData.get('used_privately') === 'true'
    const isSimplePromo = formData.get('is_simple_promo') === 'true'

    let estimatedValue = manualValue ? parseFloat(manualValue) : null
    let productDescription = description || ''
    let productBrand = brandName || null
    let imageUrl: string | null = null

    // If image provided, analyze and estimate value
    if (imageFile) {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      if (!validTypes.includes(imageFile.type)) {
        return NextResponse.json(
          { error: 'Invalid file type. Supported: JPEG, PNG, WebP, GIF' },
          { status: 400 }
        )
      }

      // Convert to base64
      const arrayBuffer = await imageFile.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')

      // Upload image to storage
      const ext = imageFile.type.split('/')[1]
      const filename = `${user.id}/products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filename, arrayBuffer, {
          contentType: imageFile.type,
          cacheControl: '3600',
        })

      if (uploadError) {
        console.error('Storage upload error:', uploadError)
      } else {
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filename)
        imageUrl = urlData.publicUrl
      }

      // Estimate value if not manually provided
      if (!estimatedValue) {
        try {
          const mimeType = imageFile.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
          const estimation = await estimateProductValue(base64, mimeType)

          estimatedValue = estimation.estimatedValue
          if (!productDescription) {
            productDescription = estimation.description
          }
          if (!productBrand && estimation.brand) {
            productBrand = estimation.brand
          }
        } catch (error) {
          console.error('Value estimation error:', error)
          // Continue without AI estimation
        }
      }
    }

    // Validate required data
    if (!estimatedValue || estimatedValue <= 0) {
      return NextResponse.json(
        { error: 'Estimated value is required' },
        { status: 400 }
      )
    }

    if (!productDescription) {
      return NextResponse.json(
        { error: 'Product description is required' },
        { status: 400 }
      )
    }

    // Classify the gift
    const giftInput: GiftInput = {
      estimatedValue,
      hasMotprestation,
      usedInBusiness,
      usedPrivately,
      isSimplePromoItem: isSimplePromo,
    }

    const classification = classifyGift(giftInput)

    // Create gift record
    const { data: gift, error: giftError } = await supabase
      .from('gifts')
      .insert({
        user_id: user.id,
        date: new Date().toISOString().split('T')[0],
        brand_name: productBrand || 'Okänt varumärke',
        description: productDescription,
        estimated_value: estimatedValue,
        has_motprestation: hasMotprestation,
        used_in_business: usedInBusiness,
        used_privately: usedPrivately,
        is_simple_promo: isSimplePromo,
        classification,
      })
      .select()
      .single()

    if (giftError) {
      console.error('Gift insert error:', giftError)
      return NextResponse.json({ error: 'Failed to create gift record' }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        gift,
        classification,
        imageUrl,
      },
    })
  } catch (error) {
    console.error('Product registration error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Registration failed' },
      { status: 500 }
    )
  }
}
