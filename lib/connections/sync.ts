import type { SupabaseClient } from '@supabase/supabase-js'
import type { AccountingProvider } from '@/types'
import { refreshAccessToken, isOAuthProvider } from './oauth'
import { fetchFortnoxCompanyInfo } from './fortnox-api'

interface SyncResult {
  success: boolean
  error?: string
}

export async function syncProviderConnection(
  adminClient: SupabaseClient,
  connectionId: string,
  provider: AccountingProvider
): Promise<SyncResult> {
  try {
    // Fetch tokens
    const { data: tokenData, error: tokenError } = await adminClient
      .from('provider_connection_tokens')
      .select('*')
      .eq('connection_id', connectionId)
      .single()

    if (tokenError || !tokenData) {
      return { success: false, error: 'No tokens found for connection' }
    }

    let accessToken = tokenData.access_token

    // Refresh if OAuth and token is expired (5-min buffer)
    if (isOAuthProvider(provider) && tokenData.token_expires_at) {
      const expiresAt = new Date(tokenData.token_expires_at)
      const bufferMs = 5 * 60 * 1000
      if (expiresAt.getTime() - bufferMs < Date.now()) {
        if (!tokenData.refresh_token) {
          return { success: false, error: 'Token expired and no refresh token available' }
        }

        try {
          const refreshed = await refreshAccessToken(provider, tokenData.refresh_token)
          accessToken = refreshed.access_token

          await adminClient
            .from('provider_connection_tokens')
            .update({
              access_token: refreshed.access_token,
              refresh_token: refreshed.refresh_token ?? tokenData.refresh_token,
              token_expires_at: refreshed.expires_in
                ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
                : tokenData.token_expires_at,
            })
            .eq('connection_id', connectionId)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Token refresh failed'
          await adminClient
            .from('provider_connections')
            .update({ status: 'expired', error_message: message })
            .eq('id', connectionId)
          return { success: false, error: message }
        }
      }
    }

    // Fetch company info (Fortnox only)
    if (provider === 'fortnox') {
      const info = await fetchFortnoxCompanyInfo(accessToken)
      if (info) {
        await adminClient
          .from('provider_connections')
          .update({ provider_company_name: info.CompanyName })
          .eq('id', connectionId)
      }
    }

    // Update last_synced_at
    await adminClient
      .from('provider_connections')
      .update({ last_synced_at: new Date().toISOString(), error_message: null })
      .eq('id', connectionId)

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    return { success: false, error: message }
  }
}
