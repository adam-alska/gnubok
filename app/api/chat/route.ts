import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateChatResponse } from '@/lib/ai/chatbot/chain'
import { CHATBOT_CONFIG } from '@/lib/ai/chatbot/config'
import type { ChatMessage, ChatRequest } from '@/types/chat'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { validateBody, ChatRequestSchema } from '@/lib/validation'

/**
 * POST /api/chat
 * Send a message and get a response
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  try {
    const raw = await request.json()
    const validation = validateBody(ChatRequestSchema, raw)
    if (!validation.success) return validation.response
    const { message, session_id } = validation.data

    let sessionId = session_id

    // Create new session if not provided
    if (!sessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
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
        .eq('user_id', user.id)
        .single()

      if (!existingSession) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        )
      }
    }

    // Save user message
    const { data: userMessage, error: userMsgError } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        user_id: user.id,
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
        user_id: user.id,
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
