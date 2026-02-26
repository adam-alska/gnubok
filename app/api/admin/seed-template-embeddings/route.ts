import { NextResponse } from 'next/server'
import { extensionRegistry } from '@/lib/extensions/registry'
import { ensureInitialized } from '@/lib/init'

ensureInitialized()

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const aiExt = extensionRegistry.get('ai-categorization')
  if (!aiExt?.services?.seedAllTemplateEmbeddings || !aiExt?.services?.getSchemaVersion) {
    return NextResponse.json(
      { error: 'ai-categorization extension not loaded' },
      { status: 503 }
    )
  }

  try {
    const { seeded, errors } = await aiExt.services.seedAllTemplateEmbeddings()
    const schemaVersion = await aiExt.services.getSchemaVersion()

    return NextResponse.json({
      success: errors.length === 0,
      seeded,
      errors,
      schema_version: schemaVersion,
    })
  } catch (error) {
    return NextResponse.json(
      { error: `Seeding failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
