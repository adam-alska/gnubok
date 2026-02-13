import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { text } = await request.json()

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'Text is required' }, { status: 400 })
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Du är en assistent som hjälper influencers. Sammanfatta följande mailkonversation/text till en strukturerad briefing.

Formatera sammanfattningen med dessa rubriker (hoppa över de som inte nämns):
- **Varumärke/Kund**: Vilken kund eller varumärke det gäller
- **Vad ska göras**: Innehåll/publiceringar som förväntas
- **Deadlines**: Datum och tidsramar
- **Belopp**: Ersättning om nämnt
- **Övriga detaljer**: Annat viktigt

Texten att sammanfatta:

${text}`,
        },
      ],
    })

    const summary = message.content[0].type === 'text' ? message.content[0].text : ''

    return NextResponse.json({ data: { summary } })
  } catch (error) {
    console.error('Briefing summarization error:', error)
    return NextResponse.json(
      { error: 'Failed to summarize briefing' },
      { status: 500 }
    )
  }
}
