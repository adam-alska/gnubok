interface TokenResult {
  access_token: string
  expires_in?: number
}

export async function exchangeBrioxToken(applicationToken: string): Promise<TokenResult> {
  const clientId = process.env.BRIOX_CLIENT_ID
  if (!clientId) throw new Error('BRIOX_CLIENT_ID is not configured')

  const response = await fetch('https://api.briox.se/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'application_token',
      client_id: clientId,
      application_token: applicationToken,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Briox token exchange failed: ${response.status} ${errorText}`)
  }

  return response.json()
}

export async function getBjornLundenToken(): Promise<TokenResult> {
  const clientId = process.env.BJORN_LUNDEN_CLIENT_ID
  const clientSecret = process.env.BJORN_LUNDEN_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('BJORN_LUNDEN_CLIENT_ID/SECRET is not configured')
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const response = await fetch('https://auth.bjornlunden.se/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Björn Lundén token exchange failed: ${response.status} ${errorText}`)
  }

  return response.json()
}
