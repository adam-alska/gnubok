import { createClient } from '@/lib/supabase/server'
import { streamChatResponse } from '@/extensions/ai-chat/chatbot/chain'
import { CHATBOT_CONFIG } from '@/extensions/ai-chat/chatbot/config'
import type { ChatMessage, ChatRequest, SourceReference } from '@/types/chat'

// Simple in-memory rate limiting (per user)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const limit = rateLimitMap.get(userId)

  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(userId, {
      count: 1,
      resetTime: now + 60000,
    })
    return true
  }

  if (limit.count >= CHATBOT_CONFIG.rateLimitPerMinute) {
    return false
  }

  limit.count++
  return true
}

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

  if (!checkRateLimit(user.id)) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body: ChatRequest = await request.json()
    const { message, session_id } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

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
