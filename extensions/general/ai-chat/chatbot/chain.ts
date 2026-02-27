import { ChatAnthropic } from '@langchain/anthropic'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { CHATBOT_CONFIG } from './config'
import {
  SYSTEM_PROMPT,
  formatContextFromSources,
  formatConversationHistory,
} from './prompts'
import {
  retrieveRelevantDocuments,
  documentsToSources,
  type RetrievedDocument,
} from './retriever'
import { routeMessage, type RouteType } from './router'
import { createAccountingTools } from './tools'
import { streamAgentResponse, type ToolResultEntry } from './agent'
import { generateArtifact, type ArtifactSpec } from './artifacts'
import type { ChatMessage, SourceReference } from '@/types/chat'
import type { SupabaseClient } from '@supabase/supabase-js'

// Initialize the LLM
function getChatModel() {
  return new ChatAnthropic({
    modelName: CHATBOT_CONFIG.model,
    maxTokens: CHATBOT_CONFIG.maxTokens,
    temperature: CHATBOT_CONFIG.temperature,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })
}

export interface ChatResult {
  content: string
  sources: SourceReference[]
}

export async function generateChatResponse(
  userMessage: string,
  conversationHistory: ChatMessage[]
): Promise<ChatResult> {
  // 1. Retrieve relevant documents
  const relevantDocs = await retrieveRelevantDocuments(userMessage)

  // 2. Format context from retrieved documents
  const context = formatContextFromSources(
    relevantDocs.map((doc) => ({
      content: doc.content,
      title: doc.title,
      section_title: doc.section_title,
      source_file: doc.source_file,
    }))
  )

  // 3. Format conversation history (last N messages)
  const recentHistory = conversationHistory.slice(
    -CHATBOT_CONFIG.maxHistoryMessages
  )
  const historyText = formatConversationHistory(
    recentHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))
  )

  // 4. Build the system prompt with context
  const systemPrompt = SYSTEM_PROMPT.replace('{context}', context).replace(
    '{history}',
    historyText
  )

  // 5. Generate response
  const model = getChatModel()
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ])

  // 6. Extract content and sources
  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

  return {
    content,
    sources: documentsToSources(relevantDocs),
  }
}

export async function* streamChatResponse(
  userMessage: string,
  conversationHistory: ChatMessage[]
): AsyncGenerator<{ type: 'content' | 'sources'; data: string | SourceReference[] }> {
  // 1. Retrieve relevant documents first
  const relevantDocs = await retrieveRelevantDocuments(userMessage)

  // 2. Format context from retrieved documents
  const context = formatContextFromSources(
    relevantDocs.map((doc) => ({
      content: doc.content,
      title: doc.title,
      section_title: doc.section_title,
      source_file: doc.source_file,
    }))
  )

  // 3. Format conversation history
  const recentHistory = conversationHistory.slice(
    -CHATBOT_CONFIG.maxHistoryMessages
  )
  const historyText = formatConversationHistory(
    recentHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }))
  )

  // 4. Build the system prompt
  const systemPrompt = SYSTEM_PROMPT.replace('{context}', context).replace(
    '{history}',
    historyText
  )

  // 5. Stream the response
  const model = getChatModel()
  const stream = await model.stream([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ])

  for await (const chunk of stream) {
    const content =
      typeof chunk.content === 'string'
        ? chunk.content
        : JSON.stringify(chunk.content)
    if (content) {
      yield { type: 'content', data: content }
    }
  }

  // 6. Yield sources at the end
  yield { type: 'sources', data: documentsToSources(relevantDocs) }
}

// ── Routed response (data / hybrid / knowledge) ────────────────

export type RoutedStreamEvent =
  | { type: 'content'; content: string }
  | { type: 'sources'; sources: SourceReference[] }
  | { type: 'tool_start'; toolName: string }
  | { type: 'artifact'; artifact: ArtifactSpec }
  | { type: 'route'; route: RouteType }

/**
 * High-level streaming function: routes the message, then either uses
 * the existing RAG chain (knowledge) or the LangGraph agent (data/hybrid).
 * Generates artifact post-hoc on data/hybrid routes.
 */
export async function* streamRoutedResponse(
  userMessage: string,
  conversationHistory: ChatMessage[],
  supabase: SupabaseClient,
  userId: string,
  sessionId?: string
): AsyncGenerator<RoutedStreamEvent> {
  // 1. Route the message
  const { route, rewrittenQuery } = await routeMessage(userMessage, conversationHistory)
  yield { type: 'route', route }

  // 2. Knowledge-only: use existing RAG chain
  if (route === 'knowledge') {
    for await (const chunk of streamChatResponse(rewrittenQuery, conversationHistory)) {
      if (chunk.type === 'content') {
        yield { type: 'content', content: chunk.data as string }
      } else if (chunk.type === 'sources') {
        yield { type: 'sources', sources: chunk.data as SourceReference[] }
      }
    }
    return
  }

  // 3. Data or hybrid: use LangGraph agent with tools
  const tools = createAccountingTools(supabase, userId)

  // For hybrid, get RAG context
  let ragContext: string | undefined
  let sources: SourceReference[] = []
  if (route === 'hybrid') {
    try {
      const relevantDocs = await retrieveRelevantDocuments(rewrittenQuery)
      ragContext = formatContextFromSources(
        relevantDocs.map((doc) => ({
          content: doc.content,
          title: doc.title,
          section_title: doc.section_title,
          source_file: doc.source_file,
        }))
      )
      sources = documentsToSources(relevantDocs)
    } catch {
      // RAG failure is non-critical for hybrid route
    }
  }

  let fullContent = ''
  let toolResults: ToolResultEntry[] = []

  for await (const event of streamAgentResponse({
    query: rewrittenQuery,
    route,
    tools,
    conversationHistory,
    ragContext,
  })) {
    if (event.type === 'tool_start') {
      yield { type: 'tool_start', toolName: event.toolName! }
    } else if (event.type === 'content') {
      fullContent += event.content!
      yield { type: 'content', content: event.content! }
    } else if (event.type === 'done') {
      toolResults = event.toolResults || []
    }
  }

  // 4. Yield sources if hybrid
  if (sources.length > 0) {
    yield { type: 'sources', sources }
  }

  // 5. Generate artifact (post-processing)
  if (toolResults.length > 0 && fullContent.length > 0) {
    try {
      const artifact = await generateArtifact(toolResults, fullContent)
      if (artifact) {
        yield { type: 'artifact', artifact }
      }
    } catch (e) {
      console.warn('Artifact generation failed:', e)
    }
  }
}
