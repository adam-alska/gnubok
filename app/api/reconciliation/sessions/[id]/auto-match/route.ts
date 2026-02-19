import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { autoMatchTransactions } from '@/lib/reconciliation/reconciliation-engine'
import type { Transaction, Invoice, Customer, MappingRule } from '@/types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success: rl, reset } = apiLimiter.check(user.id)
  if (!rl) return rateLimitResponse(reset)

  const { id } = await params

  // Verify session belongs to user
  const { data: session, error: sessionError } = await supabase
    .from('bank_reconciliation_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session hittades inte' }, { status: 404 })
  }

  // Get unmatched items with transactions
  const { data: items, error: itemsError } = await supabase
    .from('bank_reconciliation_items')
    .select('*, transaction:transactions(*)')
    .eq('session_id', id)
    .eq('is_reconciled', false)
    .eq('match_type', 'unmatched')

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 })
  }

  if (!items || items.length === 0) {
    return NextResponse.json({
      data: { matched: 0, unmatched: 0, message: 'Inga omatchade transaktioner att bearbeta' }
    })
  }

  // Delete the existing unmatched items - we will recreate them
  const unmatchedItemIds = items.map(i => i.id)
  await supabase
    .from('bank_reconciliation_items')
    .delete()
    .in('id', unmatchedItemIds)

  // Fetch data needed for matching
  const transactions = items
    .map(i => i.transaction)
    .filter(Boolean) as Transaction[]

  // Fetch invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, customer:customers(*)')
    .eq('user_id', user.id)
    .in('status', ['sent', 'overdue'])

  // Fetch supplier invoices
  const { data: supplierInvoices } = await supabase
    .from('supplier_invoices')
    .select('*, supplier:suppliers(name)')
    .eq('user_id', user.id)
    .in('status', ['received', 'attested', 'approved'])

  // Fetch mapping rules
  const { data: rules } = await supabase
    .from('mapping_rules')
    .select('*')
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .eq('is_active', true)
    .order('priority', { ascending: true })

  const formattedSupplierInvoices = (supplierInvoices || []).map(si => ({
    id: si.id,
    invoice_number: si.invoice_number,
    ocr_number: si.ocr_number,
    total: si.total,
    due_date: si.due_date,
    supplier_id: si.supplier_id,
    supplier_name: si.supplier?.name || undefined,
  }))

  // Run auto-matching
  const result = await autoMatchTransactions(
    user.id,
    id,
    transactions,
    (invoices || []) as (Invoice & { customer?: Customer })[],
    formattedSupplierInvoices,
    (rules || []) as MappingRule[]
  )

  return NextResponse.json({
    data: {
      matched: result.matched,
      unmatched: result.unmatched,
      total: transactions.length,
      message: `${result.matched} av ${transactions.length} transaktioner matchade automatiskt`,
    },
  })
}
