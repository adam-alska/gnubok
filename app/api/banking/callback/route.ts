import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createSession, getAccountBalance, type AccountInfo } from '@/lib/banking/enable-banking'

interface StoredAccount {
  uid: string
  iban?: string
  name?: string
  currency: string
  balance?: number
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // Enable Banking returns: ?code=XXX&state=user_id or ?error=XXX&error_description=YYY
  const code = searchParams.get('code')
  const state = searchParams.get('state') // This is the user_id we passed during authorization
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // Redirect URL for success/error
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Handle errors from bank authorization
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

  const supabase = await createClient()

  try {
    // Create session from authorization code
    const sessionData = await createSession(code)

    // Extract data from session response
    const { session_id, accounts, access, aspsp } = sessionData
    const consentExpiresAt = access.valid_until

    // Get balances for each account
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

    // Find the pending connection for this user
    // We match by user_id (state) and status='pending'
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
      // Create a new connection if no pending one exists
      const { error: insertError } = await supabase
        .from('bank_connections')
        .insert({
          user_id: state,
          bank_id: `${aspsp.name.toLowerCase().replace(/\s+/g, '-')}-${aspsp.country.toLowerCase()}`,
          bank_name: aspsp.name,
          session_id,
          status: 'active',
          accounts: accountsWithBalances,
          consent_expires_at: consentExpiresAt,
          last_synced_at: new Date().toISOString(),
        })

      if (insertError) {
        throw new Error('Failed to create connection')
      }
    } else {
      // Update the pending connection with session data
      const { error: updateError } = await supabase
        .from('bank_connections')
        .update({
          session_id,
          status: 'active',
          accounts: accountsWithBalances,
          consent_expires_at: consentExpiresAt,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', pendingConnection.id)

      if (updateError) {
        throw new Error('Failed to update connection')
      }
    }

    // Check if the user has completed onboarding to decide redirect target
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

    // Try to update connection status to error
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
