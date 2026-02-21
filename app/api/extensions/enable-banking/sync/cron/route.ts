import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { syncAccountTransactions } from '@/extensions/general/enable-banking/lib/sync'
import { isConsentExpiringSoon, getDaysUntilExpiry } from '@/extensions/general/enable-banking/lib/api-client'
import type { StoredAccount } from '@/extensions/general/enable-banking/types'

/**
 * GET /api/extensions/enable-banking/sync/cron
 * Automatic daily bank transaction sync
 * Runs at 05:00 UTC (07:00 Swedish time)
 *
 * Processes up to 10 connections per run (Vercel Hobby 60s timeout).
 * Prioritizes connections not synced for the longest time.
 * Deduplication via external_id makes repeated runs safe.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: connections, error: connError } = await supabase
    .from('bank_connections')
    .select('*')
    .eq('status', 'active')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(10)

  if (connError) {
    console.error('Failed to fetch bank connections:', connError)
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({ message: 'No active connections to sync', processed: 0 })
  }

  const results: {
    connectionId: string
    userId: string
    bankName: string
    imported: number
    duplicates: number
    errors: number
    status: 'synced' | 'expired' | 'expiring_soon' | 'error'
    daysUntilExpiry?: number | null
  }[] = []

  for (const connection of connections) {
    try {
      const daysLeft = getDaysUntilExpiry(connection.consent_expires)
      const isExpired = daysLeft !== null && daysLeft <= 0

      if (isExpired) {
        await supabase
          .from('bank_connections')
          .update({ status: 'expired' })
          .eq('id', connection.id)

        results.push({
          connectionId: connection.id,
          userId: connection.user_id,
          bankName: connection.bank_name,
          imported: 0,
          duplicates: 0,
          errors: 0,
          status: 'expired',
          daysUntilExpiry: 0,
        })
        continue
      }

      const expiringSoon = isConsentExpiringSoon(connection.consent_expires)

      const toDate = new Date().toISOString().split('T')[0]
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

      const accounts = (connection.accounts_data as StoredAccount[] || []).map(a => ({ ...a }))

      let totalImported = 0
      let totalDuplicates = 0
      let totalErrors = 0

      for (const account of accounts) {
        const result = await syncAccountTransactions(
          supabase,
          connection.user_id,
          connection.id,
          account,
          fromDate,
          toDate
        )

        totalImported += result.imported
        totalDuplicates += result.duplicates
        totalErrors += result.errors
      }

      await supabase
        .from('bank_connections')
        .update({
          accounts_data: accounts,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', connection.id)

      results.push({
        connectionId: connection.id,
        userId: connection.user_id,
        bankName: connection.bank_name,
        imported: totalImported,
        duplicates: totalDuplicates,
        errors: totalErrors,
        status: expiringSoon ? 'expiring_soon' : 'synced',
        daysUntilExpiry: daysLeft,
      })
    } catch (error) {
      console.error(`Sync failed for connection ${connection.id}:`, error)
      results.push({
        connectionId: connection.id,
        userId: connection.user_id,
        bankName: connection.bank_name,
        imported: 0,
        duplicates: 0,
        errors: 1,
        status: 'error',
      })
    }
  }

  const totalImported = results.reduce((sum, r) => sum + r.imported, 0)
  const totalExpired = results.filter(r => r.status === 'expired').length
  const totalExpiringSoon = results.filter(r => r.status === 'expiring_soon').length
  const totalFailed = results.filter(r => r.status === 'error').length

  console.log(`[bank-sync-cron] Processed ${results.length} connections: ${totalImported} imported, ${totalExpired} expired, ${totalExpiringSoon} expiring soon, ${totalFailed} failed`)

  return NextResponse.json({
    processed: results.length,
    totalImported,
    totalExpired,
    totalExpiringSoon,
    totalFailed,
    results,
  })
}
