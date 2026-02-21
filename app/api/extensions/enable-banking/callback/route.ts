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
  const state = searchParams.get('state') // This is the user_id we passed during authorization
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (error) {
    const errorMessage = errorDescription || error
    console.error('Bank authorization error:', errorMessage)
    return NextResponse.redirect(
      `${baseUrl}/settings?bank_error=${encodeURIComponent(errorMessage)}`
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/settings?bank_error=missing_parameters`)
  }

  const supabase = await createServiceClient()

  try {
    const sessionData = await createSession(code)
    const { session_id, accounts, access, aspsp } = sessionData
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

    const { data: pendingConnection, error: findError } = await supabase
      .from('bank_connections')
      .select('id')
      .eq('user_id', state)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (findError || !pendingConnection) {
      console.error('Could not find pending connection:', findError)
      const { error: insertError } = await supabase
        .from('bank_connections')
        .insert({
          user_id: state,
          provider: `${aspsp.name.toLowerCase().replace(/\s+/g, '-')}-${aspsp.country.toLowerCase()}`,
          bank_name: aspsp.name,
          session_id,
          status: 'active',
          accounts_data: accountsWithBalances,
          consent_expires: consentExpiresAt,
          last_synced_at: new Date().toISOString(),
        })

      if (insertError) {
        console.error('Insert error:', insertError)
        throw new Error('Failed to create connection')
      }
    } else {
      const { error: updateError } = await supabase
        .from('bank_connections')
        .update({
          session_id,
          status: 'active',
          accounts_data: accountsWithBalances,
          consent_expires: consentExpiresAt,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', pendingConnection.id)

      if (updateError) {
        throw new Error('Failed to update connection')
      }
    }

    const { data: userSettings } = await supabase
      .from('company_settings')
      .select('onboarding_complete')
      .eq('user_id', state)
      .single()

    const redirectTarget = userSettings?.onboarding_complete
      ? '/settings?bank_connected=true'
      : '/onboarding?bank_connected=true'

    return NextResponse.redirect(`${baseUrl}${redirectTarget}`)
  } catch (error) {
    console.error('Bank callback error:', error)

    try {
      await supabase
        .from('bank_connections')
        .update({ status: 'error' })
        .eq('user_id', state)
        .eq('status', 'pending')
    } catch {
      // Ignore cleanup errors
    }

    return NextResponse.redirect(
      `${baseUrl}/settings?bank_error=${encodeURIComponent('Connection failed')}`
    )
  }
}
