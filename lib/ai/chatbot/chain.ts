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
import type { ChatMessage, SourceReference } from '@/types/chat'

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
