import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { analyzeReceipt } from '@/extensions/receipt-ocr/lib/receipt-analyzer'
import { processLineItems } from '@/extensions/receipt-ocr/lib/receipt-categorizer'
import { eventBus } from '@/lib/events/bus'
import { ensureInitialized } from '@/lib/init'

ensureInitialized()

/**
 * POST /api/receipts/upload
 * Upload a receipt image and extract data using Claude Vision
 *
 * Accepts multipart/form-data with:
 * - image: The receipt image file
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

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Supported: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      )
    }

    // Convert file to base64
    const arrayBuffer = await imageFile.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Generate unique filename
    const ext = imageFile.type.split('/')[1]
    const filename = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filename, arrayBuffer, {
        contentType: imageFile.type,
        cacheControl: '3600',
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filename)
    const imageUrl = urlData.publicUrl

    // Create receipt record with pending status
    const { data: receipt, error: insertError } = await supabase
      .from('receipts')
      .insert({
        user_id: user.id,
        image_url: imageUrl,
        status: 'processing',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Receipt insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create receipt record' }, { status: 500 })
    }

    // Analyze receipt with Claude Vision
    try {
      const mimeType = imageFile.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
      const extraction = await analyzeReceipt(base64, mimeType)

      // Process and categorize line items
      const processedLineItems = processLineItems(extraction.lineItems)

      // Update receipt with extracted data
      const { error: updateError } = await supabase
        .from('receipts')
        .update({
          status: 'extracted',
          extraction_confidence: extraction.confidence,
          merchant_name: extraction.merchant.name,
          merchant_org_number: extraction.merchant.orgNumber,
          merchant_vat_number: extraction.merchant.vatNumber,
          receipt_date: extraction.receipt.date,
          receipt_time: extraction.receipt.time,
          total_amount: extraction.totals.total,
          currency: extraction.receipt.currency,
          vat_amount: extraction.totals.vatAmount,
          is_restaurant: extraction.flags.isRestaurant,
          is_systembolaget: extraction.flags.isSystembolaget,
          is_foreign_merchant: extraction.flags.isForeignMerchant,
          raw_extraction: extraction,
        })
        .eq('id', receipt.id)

      if (updateError) {
        console.error('Receipt update error:', updateError)
      }

      // Insert line items
      if (processedLineItems.length > 0) {
        const lineItemsToInsert = processedLineItems.map((item, index) => ({
          receipt_id: receipt.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          line_total: item.lineTotal,
          vat_rate: item.vatRate,
          vat_amount: item.vatRate && item.lineTotal ? (item.lineTotal * item.vatRate) / (100 + item.vatRate) : null,
          extraction_confidence: item.confidence,
          suggested_category: item.suggestedCategory,
          sort_order: index,
        }))

        const { error: lineItemsError } = await supabase
          .from('receipt_line_items')
          .insert(lineItemsToInsert)

        if (lineItemsError) {
          console.error('Line items insert error:', lineItemsError)
        }
      }

      // Fetch the complete receipt with line items
      const { data: completeReceipt, error: fetchError } = await supabase
        .from('receipts')
        .select(`
          *,
          line_items:receipt_line_items(*)
        `)
        .eq('id', receipt.id)
        .single()

      if (fetchError) {
        console.error('Fetch error:', fetchError)
        return NextResponse.json({
          data: {
            id: receipt.id,
            status: 'extracted',
            extraction,
          },
        })
      }

      // Emit receipt.extracted event
      await eventBus.emit({
        type: 'receipt.extracted',
        payload: {
          receipt: completeReceipt,
          documentId: null,
          confidence: extraction.confidence,
          userId: user.id,
        },
      })

      return NextResponse.json({ data: completeReceipt })
    } catch (analysisError) {
      console.error('Receipt analysis error:', analysisError)

      // Update receipt with error status
      await supabase
        .from('receipts')
        .update({
          status: 'error',
          raw_extraction: {
            error: analysisError instanceof Error ? analysisError.message : 'Unknown error',
          },
        })
        .eq('id', receipt.id)

      return NextResponse.json(
        {
          error: 'Failed to analyze receipt',
          receiptId: receipt.id,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
