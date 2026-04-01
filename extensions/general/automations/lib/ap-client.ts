/**
 * Activepieces API client for user provisioning and token management.
 */

const AP_URL = process.env.ACTIVEPIECES_URL ?? 'http://localhost'
const AP_API_KEY = process.env.ACTIVEPIECES_API_KEY ?? ''

interface APAuthResponse {
  token: string
  id: string
  projectId: string
  firstName: string
  lastName: string
  email: string
}

interface APSignUpRequest {
  email: string
  password: string
  firstName: string
  lastName: string
}

async function apFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${AP_URL}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(AP_API_KEY ? { Authorization: `Bearer ${AP_API_KEY}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Activepieces API error ${res.status}: ${body}`)
  }
  return res.json()
}

async function apFetchWithToken<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${AP_URL}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Activepieces API error ${res.status}: ${body}`)
  }
  return res.json()
}

/**
 * Sign up a new user in Activepieces.
 * Used to mirror gnubok users into the AP instance.
 */
export async function signUp(params: APSignUpRequest): Promise<APAuthResponse> {
  return apFetch<APAuthResponse>('/authentication/sign-up', {
    method: 'POST',
    body: JSON.stringify({
      ...params,
      trackEvents: false,
      newsLetter: false,
    }),
  })
}

/**
 * Sign in an existing user in Activepieces.
 * Returns a fresh JWT token for iframe embedding.
 */
export async function signIn(email: string, password: string): Promise<APAuthResponse> {
  return apFetch<APAuthResponse>('/authentication/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

/**
 * Create a connection (credential) in the user's AP project.
 * Used to pre-configure the gnubok piece connection.
 */
export async function createConnection(
  token: string,
  params: {
    displayName: string
    pieceName: string
    type: string
    value: Record<string, string>
  }
): Promise<{ id: string }> {
  return apFetchWithToken<{ id: string }>('/app-connections', token, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/**
 * Trigger an Activepieces flow via webhook URL.
 */
export async function triggerWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Webhook failed ${res.status}: ${body}`)
  }
}

export function getActivepiecesUrl(): string {
  return AP_URL
}
