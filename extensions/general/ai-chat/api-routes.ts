import { NextResponse } from 'next/server'
import type { ApiRouteDefinition, ExtensionContext } from '@/lib/extensions/types'
import { generateChatResponse, streamChatResponse } from '@/extensions/general/ai-chat/chatbot/chain'
import { CHATBOT_CONFIG } from '@/extensions/general/ai-chat/chatbot/config'
import type { ChatMessage, ChatRequest, SourceReference } from '@/types/chat'

// Simple in-memory rate limiting (per user)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const limit = rateLimitMap.get(userId)

  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(userId, {
      count: 1,
      resetTime: now + 60000, // 1 minute window
    })
    return true
  }

  if (limit.count >= CHATBOT_CONFIG.rateLimitPerMinute) {
    return false
  }

  limit.count++
  return true
}

// ============================================================
// POST / — Send a message and get a response
// ============================================================

async function handlePostChat(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  // Rate limiting
  if (!checkRateLimit(userId)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a moment.' },
      { status: 429 }
    )
  }

  try {
    const body: ChatRequest = await request.json()
    const { message, session_id } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      )
    }

    let sessionId = session_id

    // Create new session if not provided
    if (!sessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: userId,
          title: message.slice(0, 100), // Use first 100 chars of message as title
        })
        .select()
        .single()

      if (sessionError) {
        console.error('Error creating session:', sessionError)
        return NextResponse.json(
          { error: 'Failed to create chat session' },
          { status: 500 }
        )
      }

      sessionId = newSession.id
    } else {
      // Verify session belongs to user
      const { data: existingSession } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()

      if (!existingSession) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        )
      }
    }

    // Save user message
    const { error: userMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        user_id: userId,
        role: 'user',
        content: message.trim(),
        sources: [],
      })
      .select()
      .single()

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError)
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      )
    }

    // Get conversation history
    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(CHATBOT_CONFIG.maxHistoryMessages)

    const conversationHistory = (history || []) as ChatMessage[]

    // Generate AI response
    const result = await generateChatResponse(message.trim(), conversationHistory)

    // Save assistant message
    const { data: assistantMessage, error: assistantMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        user_id: userId,
        role: 'assistant',
        content: result.content,
        sources: result.sources,
      })
      .select()
      .single()

    if (assistantMsgError) {
      console.error('Error saving assistant message:', assistantMsgError)
      return NextResponse.json(
        { error: 'Failed to save response' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: assistantMessage,
      session_id: sessionId,
    })
  } catch (err) {
    console.error('Chat error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to process chat' },
      { status: 500 }
    )
  }
}

// ============================================================
// POST /stream — Streaming chat response via Server-Sent Events
// ============================================================

async function handlePostStream(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  if (!checkRateLimit(userId)) {
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
          user_id: userId,
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
        .eq('user_id', userId)
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
        user_id: userId,
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
              user_id: userId,
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

// ============================================================
// GET /sessions — List all chat sessions for the user
// ============================================================

async function handleGetSessions(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')

  const { data, error, count } = await supabase
    .from('chat_sessions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    )
  }

  return NextResponse.json({ data, count })
}

// ============================================================
// POST /sessions — Create a new chat session
// ============================================================

async function handlePostSession(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { title } = body

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: userId,
        title: title || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating session:', error)
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create session' },
      { status: 400 }
    )
  }
}

// ============================================================
// GET /sessions/:id — Get a single chat session with messages
// ============================================================

async function handleGetSession(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('_id')

  if (!id) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
  }

  // Get session with messages
  const { data: session, error: sessionError } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Get messages
  const { data: messages, error: messagesError } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', id)
    .order('created_at', { ascending: true })

  if (messagesError) {
    console.error('Error fetching messages:', messagesError)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    session,
    messages: messages || [],
  })
}

// ============================================================
// PATCH /sessions/:id — Update a chat session (e.g., rename)
// ============================================================

async function handlePatchSession(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('_id')

  if (!id) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { title } = body

    const { data, error } = await supabase
      .from('chat_sessions')
      .update({ title })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating session:', error)
      return NextResponse.json(
        { error: 'Failed to update session' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update session' },
      { status: 400 }
    )
  }
}

// ============================================================
// DELETE /sessions/:id — Delete a chat session and its messages
// ============================================================

async function handleDeleteSession(
  request: Request,
  ctx?: ExtensionContext
): Promise<Response> {
  const userId = ctx!.userId
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('_id')

  if (!id) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
  }

  // Delete session (messages will cascade delete due to FK)
  const { error } = await supabase
    .from('chat_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    console.error('Error deleting session:', error)
    return NextResponse.json(
      { error: 'Failed to delete session' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}

// ============================================================
// Route definitions
// ============================================================

export const aiChatApiRoutes: ApiRouteDefinition[] = [
  {
    method: 'POST',
    path: '/',
    handler: handlePostChat,
  },
  {
    method: 'POST',
    path: '/stream',
    handler: handlePostStream,
  },
  {
    method: 'GET',
    path: '/sessions',
    handler: handleGetSessions,
  },
  {
    method: 'POST',
    path: '/sessions',
    handler: handlePostSession,
  },
  {
    method: 'GET',
    path: '/sessions/:id',
    handler: handleGetSession,
  },
  {
    method: 'PATCH',
    path: '/sessions/:id',
    handler: handlePatchSession,
  },
  {
    method: 'DELETE',
    path: '/sessions/:id',
    handler: handleDeleteSession,
  },
]
