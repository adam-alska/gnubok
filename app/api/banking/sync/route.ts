import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { eventBus } from '@/lib/events'
import { ensureInitialized } from '@/lib/init'
import { syncAccountTransactions } from '@/lib/banking/sync-transactions'
import type { Transaction } from '@/types'

ensureInitialized()

interface StoredAccount {
  uid: string
  iban?: string
  name?: string
  currency: string
  balance?: number
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { connection_id, days_back = 30 } = await request.json()

  // Get the bank connection
  const { data: connection, error: connectionError } = await supabase
    .from('bank_connections')
    .select('*')
    .eq('id', connection_id)
    .eq('user_id', user.id)
    .single()

  if (connectionError || !connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  if (connection.status !== 'active') {
    return NextResponse.json({ error: 'Connection is not active' }, { status: 400 })
  }

  try {
    const accounts = (connection.accounts_data as StoredAccount[] || []).map(a => ({ ...a }))

    const toDate = new Date().toISOString().split('T')[0]
    const fromDate = new Date(Date.now() - days_back * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    let totalImported = 0
    let totalDuplicates = 0

    for (const account of accounts) {
      const result = await syncAccountTransactions(
        supabase,
        user.id,
        connection.id,
        account,
        fromDate,
        toDate
      )

      totalImported += result.imported
      totalDuplicates += result.duplicates
    }

    // Update connection with new account balances and sync timestamp
    const syncedAt = new Date().toISOString()
    await supabase
      .from('bank_connections')
      .update({
        accounts_data: accounts,
        last_synced_at: syncedAt,
      })
      .eq('id', connection.id)

    // Emit event with newly synced transactions
    if (totalImported > 0) {
      const { data: syncedTransactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('bank_connection_id', connection.id)
        .gte('created_at', fromDate)
        .order('created_at', { ascending: false })
        .limit(totalImported)

      if (syncedTransactions && syncedTransactions.length > 0) {
        await eventBus.emit({
          type: 'transaction.synced',
          payload: { transactions: syncedTransactions as Transaction[], userId: user.id },
        })
      }
    }

    return NextResponse.json({
      imported: totalImported,
      duplicates: totalDuplicates,
      last_synced_at: syncedAt,
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
