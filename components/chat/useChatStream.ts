'use client'

import { useState, useCallback, useRef } from 'react'
import type { ChatMessage, SourceReference, ChatSession } from '@/types/chat'

interface UseChatStreamOptions {
  onError?: (error: string) => void
}

interface UseChatStreamReturn {
  messages: ChatMessage[]
  isLoading: boolean
  isStreaming: boolean
  sessionId: string | null
  error: string | null
  sendMessage: (message: string) => Promise<void>
  loadSession: (sessionId: string) => Promise<void>
  clearChat: () => void
  setSessionId: (id: string | null) => void
}

export function useChatStream(options: UseChatStreamOptions = {}): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isLoading || isStreaming) return

    setError(null)
    setIsLoading(true)

    // Add user message immediately
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId || '',
      user_id: '',
      role: 'user',
      content: message.trim(),
      sources: [],
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])

    // Add placeholder for assistant response
    const assistantPlaceholder: ChatMessage = {
      id: `temp-assistant-${Date.now()}`,
      session_id: sessionId || '',
      user_id: '',
      role: 'assistant',
      content: '',
      sources: [],
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, assistantPlaceholder])

    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch('/api/extensions/ai-chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(),
          session_id: sessionId,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send message')
      }

      setIsLoading(false)
      setIsStreaming(true)

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let accumulatedContent = ''
      let sources: SourceReference[] = []
      let newSessionId = sessionId
      let messageId: string | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'session') {
                newSessionId = data.session_id
                setSessionId(data.session_id)
              } else if (data.type === 'content') {
                accumulatedContent += data.content
                setMessages((prev) => {
                  const newMessages = [...prev]
                  const lastMsg = newMessages[newMessages.length - 1]
                  if (lastMsg.role === 'assistant') {
                    lastMsg.content = accumulatedContent
                  }
                  return newMessages
                })
              } else if (data.type === 'sources') {
                sources = data.sources
                setMessages((prev) => {
                  const newMessages = [...prev]
                  const lastMsg = newMessages[newMessages.length - 1]
                  if (lastMsg.role === 'assistant') {
                    lastMsg.sources = sources
                  }
                  return newMessages
                })
              } else if (data.type === 'done') {
                messageId = data.message_id
                // Update the message IDs with real values
                setMessages((prev) => {
                  const newMessages = [...prev]
                  const lastMsg = newMessages[newMessages.length - 1]
                  if (lastMsg.role === 'assistant' && messageId) {
                    lastMsg.id = messageId
                    lastMsg.session_id = newSessionId || ''
                  }
                  return newMessages
                })
              } else if (data.type === 'error') {
                throw new Error(data.error)
              }
            } catch (parseError) {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled, remove the placeholder
        setMessages((prev) => prev.slice(0, -1))
      } else {
        const errorMessage = err instanceof Error ? err.message : 'An error occurred'
        setError(errorMessage)
        options.onError?.(errorMessage)
        // Update placeholder with error
        setMessages((prev) => {
          const newMessages = [...prev]
          const lastMsg = newMessages[newMessages.length - 1]
          if (lastMsg.role === 'assistant') {
            lastMsg.content = 'Ett fel uppstod. Försök igen.'
          }
          return newMessages
        })
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [sessionId, isLoading, isStreaming, options])

  const loadSession = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/extensions/ai-chat/sessions/${id}`)
      if (!response.ok) {
        throw new Error('Failed to load session')
      }

      const data = await response.json()
      setSessionId(id)
      setMessages(data.messages || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load session'
      setError(errorMessage)
      options.onError?.(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [options])

  const clearChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setMessages([])
    setSessionId(null)
    setError(null)
  }, [])

  return {
    messages,
    isLoading,
    isStreaming,
    sessionId,
    error,
    sendMessage,
    loadSession,
    clearChat,
    setSessionId,
  }
}
