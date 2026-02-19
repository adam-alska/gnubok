/**
 * Document Conversion Engine
 *
 * Handles conversions in the Offert -> Order -> Faktura pipeline.
 */

import { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Convert a quote to an order.
 *
 * Creates an order from the quote's data and items,
 * then updates the quote status to 'converted'.
 *
 * @param quoteId - The quote ID to convert
 * @param userId - The authenticated user ID
 * @param supabase - Supabase client
 * @returns The created order or error
 */
export async function convertQuoteToOrder(
  quoteId: string,
  userId: string,
  supabase: SupabaseClient
) {
  // Fetch quote with items
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*, items:quote_items(*)')
    .eq('id', quoteId)
    .eq('user_id', userId)
    .single()

  if (quoteError || !quote) {
    return { error: 'Offerten hittades inte', data: null }
  }

  // Validate quote status
  if (!['draft', 'sent', 'accepted'].includes(quote.status)) {
    return { error: 'Offerten kan inte konverteras i nuvarande status', data: null }
  }

  // Get next order number
  const { data: settings } = await supabase
    .from('company_settings')
    .select('next_order_number, order_prefix')
    .eq('user_id', userId)
    .single()

  const nextNumber = settings?.next_order_number || 1
  const prefix = settings?.order_prefix || 'ORD'
  const orderNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`

  const today = new Date().toISOString().split('T')[0]

  // Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      customer_id: quote.customer_id,
      quote_id: quoteId,
      order_number: orderNumber,
      order_date: today,
      status: 'confirmed',
      currency: quote.currency,
      exchange_rate: quote.exchange_rate,
      subtotal: quote.subtotal,
      vat_amount: quote.vat_amount,
      total: quote.total,
      vat_treatment: quote.vat_treatment,
      vat_rate: quote.vat_rate,
      your_reference: quote.your_reference,
      our_reference: quote.our_reference,
      notes: quote.notes,
    })
    .select()
    .single()

  if (orderError || !order) {
    return { error: orderError?.message || 'Kunde inte skapa order', data: null }
  }

  // Create order items from quote items
  const quoteItems = (quote.items || []) as Array<{
    sort_order: number
    description: string
    quantity: number
    unit: string
    unit_price: number
    line_total: number
  }>

  if (quoteItems.length > 0) {
    const orderItems = quoteItems.map((item) => ({
      order_id: order.id,
      sort_order: item.sort_order,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      line_total: item.line_total,
    }))

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)

    if (itemsError) {
      // Rollback order creation
      await supabase.from('orders').delete().eq('id', order.id)
      return { error: 'Kunde inte skapa orderrader', data: null }
    }
  }

  // Update quote status
  await supabase
    .from('quotes')
    .update({
      status: 'converted',
      converted_to_order_id: order.id,
    })
    .eq('id', quoteId)

  // Increment order number
  await supabase
    .from('company_settings')
    .update({ next_order_number: nextNumber + 1 })
    .eq('user_id', userId)

  return { error: null, data: order }
}

/**
 * Convert an order to an invoice.
 *
 * Creates an invoice from the order's data and items using the
 * create_invoice_with_items RPC, then updates the order status to 'invoiced'.
 *
 * @param orderId - The order ID to convert
 * @param userId - The authenticated user ID
 * @param supabase - Supabase client
 * @returns The created invoice or error
 */
export async function convertOrderToInvoice(
  orderId: string,
  userId: string,
  supabase: SupabaseClient
) {
  // Fetch order with items
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single()

  if (orderError || !order) {
    return { error: 'Ordern hittades inte', data: null }
  }

  // Validate order status
  if (order.status === 'invoiced' || order.status === 'cancelled') {
    return { error: 'Ordern kan inte faktureras i nuvarande status', data: null }
  }

  const today = new Date().toISOString().split('T')[0]
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 30)
  const dueDateStr = dueDate.toISOString().split('T')[0]

  // Prepare invoice data
  const invoiceData = {
    user_id: userId,
    customer_id: order.customer_id,
    invoice_date: today,
    due_date: dueDateStr,
    currency: order.currency,
    exchange_rate: order.exchange_rate,
    subtotal: order.subtotal,
    vat_amount: order.vat_amount,
    total: order.total,
    vat_treatment: order.vat_treatment || 'standard_25',
    vat_rate: order.vat_rate || 25,
    your_reference: order.your_reference,
    our_reference: order.our_reference,
    notes: order.notes,
  }

  // Prepare items data
  const orderItems = (order.items || []) as Array<{
    sort_order: number
    description: string
    quantity: number
    unit: string
    unit_price: number
    line_total: number
  }>

  const itemsData = orderItems.map((item) => ({
    sort_order: item.sort_order,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    line_total: item.line_total,
  }))

  // Create invoice via RPC
  const { data: invoiceResult, error: rpcError } = await supabase.rpc('create_invoice_with_items', {
    p_invoice: invoiceData,
    p_items: itemsData,
  })

  if (rpcError || !invoiceResult) {
    return { error: rpcError?.message || 'Kunde inte skapa faktura', data: null }
  }

  // Update order status
  await supabase
    .from('orders')
    .update({
      status: 'invoiced',
      converted_to_invoice_id: (invoiceResult as { id: string }).id,
    })
    .eq('id', orderId)

  // If order was created from a quote, update the quote too
  if (order.quote_id) {
    await supabase
      .from('quotes')
      .update({
        converted_to_invoice_id: (invoiceResult as { id: string }).id,
      })
      .eq('id', order.quote_id)
  }

  return { error: null, data: invoiceResult }
}

/**
 * Convert a quote directly to an invoice, skipping the order step.
 *
 * @param quoteId - The quote ID to convert
 * @param userId - The authenticated user ID
 * @param supabase - Supabase client
 * @returns The created invoice or error
 */
export async function convertQuoteToInvoice(
  quoteId: string,
  userId: string,
  supabase: SupabaseClient
) {
  // Fetch quote with items
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*, items:quote_items(*)')
    .eq('id', quoteId)
    .eq('user_id', userId)
    .single()

  if (quoteError || !quote) {
    return { error: 'Offerten hittades inte', data: null }
  }

  // Validate quote status
  if (!['draft', 'sent', 'accepted'].includes(quote.status)) {
    return { error: 'Offerten kan inte konverteras i nuvarande status', data: null }
  }

  const today = new Date().toISOString().split('T')[0]
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 30)
  const dueDateStr = dueDate.toISOString().split('T')[0]

  // Prepare invoice data
  const invoiceData = {
    user_id: userId,
    customer_id: quote.customer_id,
    invoice_date: today,
    due_date: dueDateStr,
    currency: quote.currency,
    exchange_rate: quote.exchange_rate,
    subtotal: quote.subtotal,
    vat_amount: quote.vat_amount,
    total: quote.total,
    vat_treatment: quote.vat_treatment || 'standard_25',
    vat_rate: quote.vat_rate || 25,
    your_reference: quote.your_reference,
    our_reference: quote.our_reference,
    notes: quote.notes,
  }

  // Prepare items data
  const quoteItems = (quote.items || []) as Array<{
    sort_order: number
    description: string
    quantity: number
    unit: string
    unit_price: number
    line_total: number
  }>

  const itemsData = quoteItems.map((item) => ({
    sort_order: item.sort_order,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    line_total: item.line_total,
  }))

  // Create invoice via RPC
  const { data: invoiceResult, error: rpcError } = await supabase.rpc('create_invoice_with_items', {
    p_invoice: invoiceData,
    p_items: itemsData,
  })

  if (rpcError || !invoiceResult) {
    return { error: rpcError?.message || 'Kunde inte skapa faktura', data: null }
  }

  // Update quote status
  await supabase
    .from('quotes')
    .update({
      status: 'converted',
      converted_to_invoice_id: (invoiceResult as { id: string }).id,
    })
    .eq('id', quoteId)

  return { error: null, data: invoiceResult }
}
