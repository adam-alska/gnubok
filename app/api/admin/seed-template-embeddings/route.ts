import { NextResponse } from 'next/server'
import { seedAllTemplateEmbeddings, getSchemaVersion } from '@/lib/bookkeeping/template-embeddings'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { seeded, errors } = await seedAllTemplateEmbeddings()

    return NextResponse.json({
      success: errors.length === 0,
      seeded,
      errors,
      schema_version: getSchemaVersion(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: `Seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
