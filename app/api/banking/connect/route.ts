import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { startAuthorization, getASPSPs, type ASPSP } from '@/lib/banking/enable-banking'
import { apiLimiter, authLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, ConnectBankInputSchema } from '@/lib/validation'

export async function GET() {
  try {
    const aspsps = await getASPSPs('SE')

    // Transform to frontend-friendly format
    const banks = aspsps.map((aspsp: ASPSP) => ({
      name: aspsp.name,
      country: aspsp.country,
      logo: aspsp.logo,
      bic: aspsp.bic,
    }))

    return NextResponse.json({ banks })
  } catch (error) {
    console.error('Error fetching banks:', error)
    // Return fallback list
    return NextResponse.json({
      banks: [
        { name: 'Nordea', country: 'SE', bic: 'NDEASESS' },
        { name: 'SEB', country: 'SE', bic: 'ESSESESS' },
        { name: 'Swedbank', country: 'SE', bic: 'SWEDSESS' },
        { name: 'Handelsbanken', country: 'SE', bic: 'HANDSESS' },
      ]
    })
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = authLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const raw = await request.json()
  const validation = validateBody(ConnectBankInputSchema, raw)
  if (!validation.success) return validation.response
  const { aspsp_name, aspsp_country } = validation.data

  try {
    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/banking/callback`

    // Start the authorization flow with Enable Banking
    const { url, authorization_id } = await startAuthorization(
      aspsp_name,
      aspsp_country,
      redirectUrl,
      user.id, // state parameter - returned in callback
      'personal'
    )

    // Store pending connection in database with authorization_id
    // Note: session_id will be set after callback receives the code
    const { data: connection, error } = await supabase
      .from('bank_connections')
      .insert({
        user_id: user.id,
        bank_id: `${aspsp_name.toLowerCase().replace(/\s+/g, '-')}-${aspsp_country.toLowerCase()}`,
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
}
