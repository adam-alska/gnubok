import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, GenerateAGIInputSchema } from '@/lib/validation'
import { generateAGIDeclaration } from '@/lib/payroll/agi-generator'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const raw = await request.json()
  const validation = validateBody(GenerateAGIInputSchema, raw)
  if (!validation.success) return validation.response
  const body = validation.data

  try {
    const declarationId = await generateAGIDeclaration(
      body.year,
      body.month,
      user.id,
      supabase
    )

    // Fetch the created declaration
    const { data: declaration } = await supabase
      .from('agi_declarations')
      .select('*')
      .eq('id', declarationId)
      .single()

    return NextResponse.json({ data: declaration })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generering misslyckades' },
      { status: 400 }
    )
  }
}
