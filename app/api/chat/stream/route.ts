import { createClient } from '@/lib/supabase/server'
import { streamChatResponse } from '@/lib/ai/chatbot/chain'
import { CHATBOT_CONFIG } from '@/lib/ai/chatbot/config'
import type { ChatMessage, ChatRequest, SourceReference } from '@/types/chat'
import { apiLimiter } from '@/lib/rate-limit'
import { ChatRequestSchema } from '@/lib/validation'

/**
 * POST /api/chat/stream
 * Streaming chat response via Server-Sent Events
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) {
    return new Response(
      JSON.stringify({ error: 'Too many requests' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
          'X-RateLimit-Reset': String(reset),
        },
      }
    )
  }

  try {
    const raw = await request.json()
    const result = ChatRequestSchema.safeParse(raw)
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: result.error.flatten().fieldErrors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    const { message, session_id } = result.data

    let sessionId = session_id

    // Create new session if not provided
    if (!sessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: message.slice(0, 100),
        })
        .select()
        .single()

      if (sessionError) {
        return new Response(
          JSON.stringify({ error: 'Failed to create session' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      sessionId = newSession.id
    } else {
      // Verify session belongs to user
      const { data: existingSession } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single()

      if (!existingSession) {
        return new Response(
          JSON.stringify({ error: 'Session not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Save user message
    await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        user_id: user.id,
        role: 'user',
        content: message.trim(),
        sources: [],
      })

    // Get conversation history
    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(CHATBOT_CONFIG.maxHistoryMessages)

    const conversationHistory = (history || []) as ChatMessage[]

    // Create streaming response
    const encoder = new TextEncoder()
    let fullContent = ''
    let sources: SourceReference[] = []

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send session ID first
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'session', session_id: sessionId })}\n\n`)
          )

          // Stream the response
          for await (const chunk of streamChatResponse(message.trim(), conversationHistory)) {
            if (chunk.type === 'content') {
              fullContent += chunk.data as string
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'content', content: chunk.data })}\n\n`)
              )
            } else if (chunk.type === 'sources') {
              sources = chunk.data as SourceReference[]
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'sources', sources: chunk.data })}\n\n`)
              )
            }
          }

          // Save the complete assistant message
          const { data: savedMessage } = await supabase
            .from('chat_messages')
            .insert({
              session_id: sessionId,
              user_id: user.id,
              role: 'assistant',
              content: fullContent,
              sources,
            })
            .select()
            .single()

          // Send done signal with message ID
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done', message_id: savedMessage?.id })}\n\n`)
          )

          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: 'Streaming failed' })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    console.error('Stream setup error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to setup stream' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
