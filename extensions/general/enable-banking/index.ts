import type { Extension } from '@/lib/extensions/types'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { eventBus } from '@/lib/events'
import {
  startAuthorization,
  getASPSPs,
  createSession,
  getAccountBalance,
  isConsentExpiringSoon,
  getDaysUntilExpiry,
  type ASPSP,
  type AccountInfo,
} from './lib/api-client'
import { syncAccountTransactions } from './lib/sync'
import type { StoredAccount } from './types'
import type { Transaction } from '@/types'

/**
 * Enable Banking (PSD2) extension
 *
 * Provides automatic bank transaction sync via PSD2 open banking.
 * This is an opt-in extension — uncomment the import in loader.ts to activate.
 *
 * Required environment variables:
 * - ENABLE_BANKING_APP_ID
 * - ENABLE_BANKING_PRIVATE_KEY (base64-encoded PEM)
 * - ENABLE_BANKING_SANDBOX (optional, for sandbox mode)
 */
export const enableBankingExtension: Extension = {
  id: 'enable-banking',
  name: 'Enable Banking (PSD2)',
  version: '1.0.0',

  settingsPanel: {
    label: 'Bankintegration (PSD2)',
    path: '/settings?tab=banking',
  },

  apiRoutes: [
    {
      method: 'GET',
      path: '/banks',
      handler: async () => {
        try {
          const aspsps = await getASPSPs('SE')
          const banks = aspsps.map((aspsp: ASPSP) => ({
            name: aspsp.name,
            country: aspsp.country,
            logo: aspsp.logo,
            bic: aspsp.bic,
          }))
          return NextResponse.json({ banks })
        } catch (error) {
          console.error('Error fetching banks:', error)
          return NextResponse.json({
            banks: [
              { name: 'Nordea', country: 'SE', bic: 'NDEASESS' },
              { name: 'SEB', country: 'SE', bic: 'ESSESESS' },
              { name: 'Swedbank', country: 'SE', bic: 'SWEDSESS' },
              { name: 'Handelsbanken', country: 'SE', bic: 'HANDSESS' },
            ]
          })
        }
      },
    },
    {
      method: 'POST',
      path: '/connect',
      handler: async (request: Request) => {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { aspsp_name, aspsp_country } = await request.json()

        if (!aspsp_name || !aspsp_country) {
          return NextResponse.json(
            { error: 'aspsp_name and aspsp_country are required' },
            { status: 400 }
          )
        }

        try {
          const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/extensions/enable-banking/callback`

          const { url, authorization_id } = await startAuthorization(
            aspsp_name,
            aspsp_country,
            redirectUrl,
            user.id,
            'personal'
          )

          const { data: connection, error } = await supabase
            .from('bank_connections')
            .insert({
              user_id: user.id,
              provider: `${aspsp_name.toLowerCase().replace(/\s+/g, '-')}-${aspsp_country.toLowerCase()}`,
              bank_name: aspsp_name,
              authorization_id,
              status: 'pending',
            })
            .select()
            .single()

          if (error) {
            console.error('Database error:', error)
            throw new Error('Failed to store connection')
          }

          return NextResponse.json({
            connection_id: connection.id,
            authorization_url: url,
          })
        } catch (error) {
          console.error('Bank connection error:', error)
          return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Connection failed' },
            { status: 500 }
          )
        }
      },
    },
    {
      method: 'POST',
      path: '/sync',
      handler: async (request: Request) => {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { connection_id, days_back = 30 } = await request.json()

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

          const syncedAt = new Date().toISOString()
          await supabase
            .from('bank_connections')
            .update({
              accounts_data: accounts,
              last_synced_at: syncedAt,
            })
            .eq('id', connection.id)

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
      },
    },
  ],

  eventHandlers: [],
}
