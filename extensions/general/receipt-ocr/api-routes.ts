import { NextResponse } from 'next/server'
import type { ApiRouteDefinition, ExtensionContext } from '@/lib/extensions/types'
import type { ConfirmReceiptInput, Receipt, ReceiptLineItem, Transaction } from '@/types'
import { analyzeReceipt } from './lib/receipt-analyzer'
import { processLineItems, getDefaultClassification } from './lib/receipt-categorizer'
import { findTransactionMatches } from './lib/receipt-matcher'
import { getSettings, saveSettings } from './index'

// ============================================================
// / — GET: list receipts
// ============================================================

async function handleListReceipts(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  let query = supabase
    .from('receipts')
    .select(`
      *,
      line_items:receipt_line_items(*)
    `, { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Receipts fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    count,
    limit,
    offset,
  })
}

// ============================================================
// /upload — POST: upload receipt image and extract data
// ============================================================

async function handleUpload(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

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
    const filename = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filename, arrayBuffer, {
        contentType: imageFile.type,
        cacheControl: '3600',
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    // WORM archive copy (non-blocking -- receipt flow continues even if this fails)
    let wormDocumentId: string | null = null
    try {
      const { uploadDocument } = await import('@/lib/core/documents/document-service')
      const wormDoc = await uploadDocument(supabase, userId, {
        name: imageFile.name,
        buffer: arrayBuffer,
        type: imageFile.type,
      }, { upload_source: 'camera' })
      wormDocumentId = wormDoc.id
    } catch (archiveErr) {
      console.error('[receipt-upload] WORM archive copy failed:', archiveErr)
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filename)
    const imageUrl = urlData.publicUrl

    // Create receipt record with pending status
    const { data: receipt, error: insertError } = await supabase
      .from('receipts')
      .insert({
        user_id: userId,
        image_url: imageUrl,
        status: 'processing',
        document_id: wormDocumentId,
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
      const { defaultIsBusiness } = getDefaultClassification(
        extraction.flags.isRestaurant,
        extraction.flags.isSystembolaget
      )

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
          category: item.category,
          bas_account: item.basAccount,
          is_business: defaultIsBusiness,
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
      const { eventBus } = await import('@/lib/events/bus')
      await eventBus.emit({
        type: 'receipt.extracted',
        payload: {
          receipt: completeReceipt,
          documentId: wormDocumentId,
          confidence: extraction.confidence,
          userId,
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

// ============================================================
// /queue — GET: unmatched receipts and queue statistics
// ============================================================

async function handleGetQueue(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  // Parse query params
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const unmatched = searchParams.get('unmatched') === 'true'

  // Build query
  let query = supabase
    .from('receipts')
    .select(`
      *,
      line_items:receipt_line_items(*)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  if (unmatched) {
    query = query.is('matched_transaction_id', null)
  }

  const { data: receipts, error: receiptsError } = await query

  if (receiptsError) {
    console.error('Receipts fetch error:', receiptsError)
    return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
  }

  // Get counts for queue summary
  const { count: unmatchedReceiptsCount } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .is('matched_transaction_id', null)

  const { count: pendingReviewCount } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'extracted')

  const { count: unmatchedTransactionsCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lt('amount', 0)
    .is('receipt_id', null)

  // Calculate streak (days with at least one categorized transaction)
  const { data: recentActivity } = await supabase
    .from('receipts')
    .select('created_at')
    .eq('user_id', userId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(30)

  let streakCount = 0
  if (recentActivity && recentActivity.length > 0) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const activityDates = new Set(
      recentActivity.map((r) => new Date(r.created_at).toISOString().split('T')[0])
    )

    const checkDate = new Date(today)
    while (activityDates.has(checkDate.toISOString().split('T')[0])) {
      streakCount++
      checkDate.setDate(checkDate.getDate() - 1)
    }
  }

  return NextResponse.json({
    data: {
      receipts,
      summary: {
        unmatched_receipts_count: unmatchedReceiptsCount || 0,
        unmatched_transactions_count: unmatchedTransactionsCount || 0,
        pending_review_count: pendingReviewCount || 0,
        streak_count: streakCount,
      },
    },
  })
}

// ============================================================
// /:id — GET: single receipt with line items
// ============================================================

async function handleGetReceipt(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('_id')

  if (!id) {
    return NextResponse.json({ error: 'Receipt ID is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('receipts')
    .select(`
      *,
      line_items:receipt_line_items(*),
      matched_transaction:transactions(*)
    `)
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// ============================================================
// /:id — DELETE: delete receipt and line items
// ============================================================

async function handleDeleteReceipt(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('_id')

  if (!id) {
    return NextResponse.json({ error: 'Receipt ID is required' }, { status: 400 })
  }

  // Get receipt to find image URL for cleanup
  const { data: receipt } = await supabase
    .from('receipts')
    .select('image_url, matched_transaction_id')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (!receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }

  // Unlink from transaction if matched
  if (receipt.matched_transaction_id) {
    await supabase
      .from('transactions')
      .update({ receipt_id: null })
      .eq('id', receipt.matched_transaction_id)
  }

  // Delete receipt (line items are cascade deleted)
  const { error } = await supabase
    .from('receipts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Optionally delete image from storage
  if (receipt.image_url) {
    try {
      const urlParts = receipt.image_url.split('/receipts/')
      if (urlParts[1]) {
        await supabase.storage.from('receipts').remove([urlParts[1]])
      }
    } catch {
      // Ignore storage cleanup errors
    }
  }

  return NextResponse.json({ success: true })
}

// ============================================================
// /:id/confirm — POST: confirm line item classifications
// ============================================================

async function handleConfirm(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('_id')

  if (!id) {
    return NextResponse.json({ error: 'Receipt ID is required' }, { status: 400 })
  }

  // Verify receipt ownership
  const { data: receipt, error: fetchError } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (fetchError || !receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }

  const body: ConfirmReceiptInput = await request.json()

  // Update line items with classifications
  if (body.line_items && body.line_items.length > 0) {
    for (const item of body.line_items) {
      const { error: updateError } = await supabase
        .from('receipt_line_items')
        .update({
          is_business: item.is_business,
          category: item.category || null,
          bas_account: item.bas_account || null,
        })
        .eq('id', item.id)
        .eq('receipt_id', id)

      if (updateError) {
        console.error('Line item update error:', updateError)
      }
    }
  }

  // Build receipt update
  const receiptUpdate: Record<string, unknown> = {
    status: 'confirmed',
  }

  // Add restaurant representation data if provided
  if (body.representation_persons !== undefined) {
    receiptUpdate.representation_persons = body.representation_persons
  }
  if (body.representation_purpose !== undefined) {
    receiptUpdate.representation_purpose = body.representation_purpose
  }

  // Link to transaction if provided
  if (body.matched_transaction_id) {
    // Verify transaction ownership
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('id')
      .eq('id', body.matched_transaction_id)
      .eq('user_id', userId)
      .single()

    if (!txError && transaction) {
      receiptUpdate.matched_transaction_id = body.matched_transaction_id

      // Also update the transaction with the receipt link
      await supabase
        .from('transactions')
        .update({ receipt_id: id })
        .eq('id', body.matched_transaction_id)
    }
  }

  // Update the receipt
  const { data: updatedReceipt, error: updateError } = await supabase
    .from('receipts')
    .update(receiptUpdate)
    .eq('id', id)
    .select(`
      *,
      line_items:receipt_line_items(*)
    `)
    .single()

  if (updateError) {
    console.error('Receipt update error:', updateError)
    return NextResponse.json({ error: 'Failed to update receipt' }, { status: 500 })
  }

  // Calculate business/private totals from line items
  const lineItems = ((updatedReceipt as unknown as Receipt).line_items || []) as ReceiptLineItem[]
  let businessTotal = 0
  let privateTotal = 0
  for (const item of lineItems) {
    if (item.is_business === true) {
      businessTotal += item.line_total
    } else if (item.is_business === false) {
      privateTotal += item.line_total
    }
  }

  // Emit receipt.confirmed event
  const { eventBus } = await import('@/lib/events/bus')
  await eventBus.emit({
    type: 'receipt.confirmed',
    payload: {
      receipt: updatedReceipt as unknown as Receipt,
      businessTotal: Math.round(businessTotal * 100) / 100,
      privateTotal: Math.round(privateTotal * 100) / 100,
      userId,
    },
  })

  return NextResponse.json({ data: updatedReceipt })
}

// ============================================================
// /:id/match — POST: find potential transaction matches
// ============================================================

async function handleFindMatches(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('_id')

  if (!id) {
    return NextResponse.json({ error: 'Receipt ID is required' }, { status: 400 })
  }

  // Fetch receipt
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (receiptError || !receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }

  // Get date range for transaction search (+/-7 days from receipt date)
  const receiptDate = receipt.receipt_date ? new Date(receipt.receipt_date) : new Date()
  const startDate = new Date(receiptDate)
  startDate.setDate(startDate.getDate() - 7)
  const endDate = new Date(receiptDate)
  endDate.setDate(endDate.getDate() + 7)

  // Fetch unmatched transactions in date range
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .is('receipt_id', null)
    .lt('amount', 0) // Only expenses
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (txError) {
    console.error('Transaction fetch error:', txError)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }

  // Find matches
  const matches = findTransactionMatches(
    receipt as unknown as Receipt,
    transactions as Transaction[]
  )

  return NextResponse.json({
    data: {
      receipt_id: id,
      matches: matches.slice(0, 5), // Return top 5 matches
    },
  })
}

// ============================================================
// /:id/match — PATCH: link receipt to a specific transaction
// ============================================================

async function handleLinkMatch(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('_id')

  if (!id) {
    return NextResponse.json({ error: 'Receipt ID is required' }, { status: 400 })
  }

  const body = await request.json()
  const { transaction_id, match_confidence } = body

  if (!transaction_id) {
    return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
  }

  // Verify receipt ownership
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('*, line_items:receipt_line_items(*)')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (receiptError || !receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }

  // Verify transaction ownership
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transaction_id)
    .eq('user_id', userId)
    .single()

  if (txError || !transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // Update receipt with match
  const { error: updateReceiptError } = await supabase
    .from('receipts')
    .update({
      matched_transaction_id: transaction_id,
      match_confidence: match_confidence || null,
    })
    .eq('id', id)

  if (updateReceiptError) {
    console.error('Receipt update error:', updateReceiptError)
    return NextResponse.json({ error: 'Failed to update receipt' }, { status: 500 })
  }

  // Update transaction with receipt link
  const { error: updateTxError } = await supabase
    .from('transactions')
    .update({ receipt_id: id })
    .eq('id', transaction_id)

  if (updateTxError) {
    console.error('Transaction update error:', updateTxError)
  }

  // Emit receipt.matched event
  const { eventBus } = await import('@/lib/events/bus')
  await eventBus.emit({
    type: 'receipt.matched',
    payload: {
      receipt: receipt as unknown as Receipt,
      transaction: transaction as Transaction,
      confidence: match_confidence || 0,
      autoMatched: false,
      userId,
    },
  })

  return NextResponse.json({
    data: {
      receipt_id: id,
      transaction_id,
      matched: true,
    },
  })
}

// ============================================================
// /settings — GET: get current settings
// ============================================================

async function handleGetSettings(
  _request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const settings = await getSettings(userId)
  return NextResponse.json({ data: settings })
}

// ============================================================
// /settings — PUT: update settings
// ============================================================

async function handleUpdateSettings(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const body = await request.json()

  // Validate setting keys
  const allowedKeys = [
    'autoOcrEnabled',
    'autoMatchEnabled',
    'autoMatchThreshold',
    'ocrConfidenceThreshold',
  ]
  const filtered: Record<string, unknown> = {}
  for (const key of allowedKeys) {
    if (key in body) {
      filtered[key] = body[key]
    }
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
  }

  const settings = await saveSettings(userId, filtered)
  return NextResponse.json({ data: settings })
}

// ============================================================
// Route definitions
// ============================================================

export const receiptOcrApiRoutes: ApiRouteDefinition[] = [
  {
    method: 'GET',
    path: '/',
    handler: handleListReceipts,
  },
  {
    method: 'POST',
    path: '/upload',
    handler: handleUpload,
  },
  {
    method: 'GET',
    path: '/queue',
    handler: handleGetQueue,
  },
  {
    method: 'GET',
    path: '/:id',
    handler: handleGetReceipt,
  },
  {
    method: 'DELETE',
    path: '/:id',
    handler: handleDeleteReceipt,
  },
  {
    method: 'POST',
    path: '/:id/confirm',
    handler: handleConfirm,
  },
  {
    method: 'POST',
    path: '/:id/match',
    handler: handleFindMatches,
  },
  {
    method: 'PATCH',
    path: '/:id/match',
    handler: handleLinkMatch,
  },
  {
    method: 'GET',
    path: '/settings',
    handler: handleGetSettings,
  },
  {
    method: 'PUT',
    path: '/settings',
    handler: handleUpdateSettings,
  },
]
