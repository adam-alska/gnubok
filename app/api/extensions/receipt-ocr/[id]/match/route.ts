import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { findTransactionMatches } from '@/extensions/general/receipt-ocr/lib/receipt-matcher'
import { eventBus } from '@/lib/events/bus'
import { ensureInitialized } from '@/lib/init'
import type { Receipt, Transaction } from '@/types'

ensureInitialized()

/**
 * POST /api/receipts/[id]/match
 * Find potential transaction matches for a receipt
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch receipt
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (receiptError || !receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }

  // Get date range for transaction search (±7 days from receipt date)
  const receiptDate = receipt.receipt_date ? new Date(receipt.receipt_date) : new Date()
  const startDate = new Date(receiptDate)
  startDate.setDate(startDate.getDate() - 7)
  const endDate = new Date(receiptDate)
  endDate.setDate(endDate.getDate() + 7)

  // Fetch unmatched transactions in date range
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
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

/**
 * PATCH /api/receipts/[id]/match
 * Link a receipt to a specific transaction
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    .eq('user_id', user.id)
    .single()

  if (receiptError || !receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }

  // Verify transaction ownership
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transaction_id)
    .eq('user_id', user.id)
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
  await eventBus.emit({
    type: 'receipt.matched',
    payload: {
      receipt: receipt as unknown as Receipt,
      transaction: transaction as Transaction,
      confidence: match_confidence || 0,
      autoMatched: false,
      userId: user.id,
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

/**
 * DELETE /api/receipts/[id]/match
 * Unlink a receipt from its matched transaction
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify receipt ownership and get current transaction link
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('id, matched_transaction_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (receiptError || !receipt) {
    return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
  }

  const transactionId = receipt.matched_transaction_id

  // Remove match from receipt
  const { error: updateReceiptError } = await supabase
    .from('receipts')
    .update({
      matched_transaction_id: null,
      match_confidence: null,
    })
    .eq('id', id)

  if (updateReceiptError) {
    console.error('Receipt update error:', updateReceiptError)
    return NextResponse.json({ error: 'Failed to update receipt' }, { status: 500 })
  }

  // Remove receipt link from transaction
  if (transactionId) {
    await supabase
      .from('transactions')
      .update({ receipt_id: null })
      .eq('id', transactionId)
  }

  return NextResponse.json({
    data: {
      receipt_id: id,
      unmatched: true,
    },
  })
}
