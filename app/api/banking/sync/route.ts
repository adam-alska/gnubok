import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { syncAccountTransactions } from '@/lib/banking/sync-transactions'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, SyncBankInputSchema } from '@/lib/validation'

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

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const raw = await request.json()
  const validation = validateBody(SyncBankInputSchema, raw)
  if (!validation.success) return validation.response
  const { connection_id, days_back } = validation.data

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
    const accounts = (connection.accounts as StoredAccount[] || []).map(a => ({ ...a }))

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
    await supabase
      .from('bank_connections')
      .update({
        accounts,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', connection.id)

    return NextResponse.json({
      imported: totalImported,
      duplicates: totalDuplicates,
      last_synced_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
