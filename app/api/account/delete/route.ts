import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const DeleteAccountSchema = z.object({
  confirm: z.literal('RADERA'),
})

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = DeleteAccountSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Skriv RADERA för att bekräfta kontoborttagning' },
      { status: 400 }
    )
  }

  try {
    // Delete the auth user via service role — all data cascades via ON DELETE CASCADE
    const serviceClient = await createServiceClient()
    const { error } = await serviceClient.auth.admin.deleteUser(user.id)

    if (error) {
      console.error('Failed to delete user:', error)
      return NextResponse.json(
        { error: 'Kunde inte radera kontot. Försök igen.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Account deletion error:', error)
    return NextResponse.json(
      { error: 'Kunde inte radera kontot. Försök igen.' },
      { status: 500 }
    )
  }
}
