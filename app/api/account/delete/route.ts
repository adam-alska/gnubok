import { createClient } from '@/lib/supabase/server'
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
    // RPC disables protective triggers, deletes from auth.users (CASCADE
    // cleans up all public tables), then re-enables triggers — all in one tx.
    const { error } = await supabase.rpc('delete_user_account', {
      target_user_id: user.id,
    })

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
