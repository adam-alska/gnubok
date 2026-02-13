import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { estimateProductValue } from '@/lib/receipts/receipt-analyzer'

/**
 * POST /api/gifts/estimate
 * Lightweight endpoint: accepts an image, returns AI price estimate.
 * Does NOT upload to storage, classify, or write to DB.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const imageFile = formData.get('image') as File | null

    if (!imageFile) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 })
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Supported: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      )
    }

    const arrayBuffer = await imageFile.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = imageFile.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

    const estimation = await estimateProductValue(base64, mimeType)

    return NextResponse.json({ data: estimation })
  } catch (error) {
    console.error('Gift estimation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Estimation failed' },
      { status: 500 }
    )
  }
}
