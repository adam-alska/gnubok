import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createSession, getAccountBalance, type AccountInfo } from '@/extensions/general/enable-banking/lib/api-client'
import type { StoredAccount } from '@/extensions/general/enable-banking/types'

/**
 * GET /api/extensions/enable-banking/callback
 *
 * OAuth callback for Enable Banking PSD2 authorization.
 * Must be a real Next.js route (not extension handler) because
 * banks redirect to this URL directly.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const code = searchParams.get('code')
  const state = searchParams.get('state') // Cryptographic oauth_state token
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (error) {
    const errorMessage = errorDescription || error
    console.error('[enable-banking] Bank authorization denied', {
      error,
      error_description: errorDescription,
      has_state: !!state,
    })

    // Clean up the pending bank_connections row so it doesn't accumulate
    if (state) {
      try {
        const supabase = await createServiceClient()

        // Fetch connection details for logging before updating
        const { data: pendingConn } = await supabase
          .from('bank_connections')
          .select('id, user_id, bank_name')
          .eq('oauth_state', state)
          .eq('status', 'pending')
          .single()

        if (pendingConn) {
          console.error('[enable-banking] Authorization denied details', {
            connection_id: pendingConn.id,
            user_id: pendingConn.user_id,
            bank_name: pendingConn.bank_name,
            error_code: error,
            error_description: errorDescription,
          })

          await supabase
            .from('bank_connections')
            .update({ status: 'error', error_message: errorMessage, oauth_state: null })
            .eq('id', pendingConn.id)
        }
      } catch (cleanupError) {
        console.error('[enable-banking] Failed to clean up pending bank connection:', cleanupError)
      }
    }

    return NextResponse.redirect(
      `${baseUrl}/settings?bank_error=${encodeURIComponent(errorMessage)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?bank_error=missing_parameters`)
  }

  const supabase = await createServiceClient()

  try {
    // Look up pending connection by oauth_state (CSRF-safe)
    const { data: pendingConnection, error: findError } = await supabase
      .from('bank_connections')
      .select('id, user_id')
      .eq('oauth_state', state)
      .eq('status', 'pending')
      .single()

    if (findError || !pendingConnection) {
      console.error('No pending connection for oauth_state:', findError)
      return NextResponse.redirect(
        `${baseUrl}/settings?bank_error=${encodeURIComponent('invalid_state')}`
      )
    }

    const userId = pendingConnection.user_id

    const sessionData = await createSession(code)
    const { session_id, accounts, access } = sessionData
    const consentExpiresAt = access.valid_until

    const accountsWithBalances: StoredAccount[] = await Promise.all(
      accounts.map(async (account: AccountInfo) => {
        try {
          const balance = await getAccountBalance(account.uid)
          return {
            uid: account.uid,
            iban: account.account_id?.iban,
            name: account.name || account.product,
            currency: account.currency,
            balance: balance.amount,
          }
        } catch (balanceError) {
          console.error(`Failed to get balance for account ${account.uid}:`, balanceError)
          return {
            uid: account.uid,
            iban: account.account_id?.iban,
            name: account.name || account.product,
            currency: account.currency,
            balance: undefined,
          }
        }
      })
    )

    const { error: updateError } = await supabase
      .from('bank_connections')
      .update({
        session_id,
        status: 'active',
        accounts_data: accountsWithBalances,
        consent_expires: consentExpiresAt,
        last_synced_at: new Date().toISOString(),
        oauth_state: null, // Clear to prevent replay
      })
      .eq('id', pendingConnection.id)

    if (updateError) {
      throw new Error('Failed to update connection')
    }

    const connectionId = pendingConnection.id

    const { data: userSettings } = await supabase
      .from('company_settings')
      .select('onboarding_complete')
      .eq('user_id', userId)
      .single()

    const redirectTarget = userSettings?.onboarding_complete
      ? `/settings?bank_connected=true&connection_id=${connectionId}`
      : `/onboarding?bank_connected=true&connection_id=${connectionId}`

    return NextResponse.redirect(`${baseUrl}${redirectTarget}`)
  } catch (error) {
    console.error('Bank callback error:', error)

    try {
      await supabase
        .from('bank_connections')
        .update({ status: 'error', oauth_state: null })
        .eq('oauth_state', state)
        .eq('status', 'pending')
    } catch {
      // Ignore cleanup errors
    }

    return NextResponse.redirect(
      `${baseUrl}/settings?bank_error=${encodeURIComponent('Connection failed')}`
    )
  }
}
