import { ChatAnthropic } from '@langchain/anthropic'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { CHATBOT_CONFIG } from './config'
import {
  SYSTEM_PROMPT_DATA,
  SYSTEM_PROMPT_HYBRID,
  formatConversationHistory,
} from './prompts'
import type { ChatMessage } from '@/types/chat'
import type { RouteType } from './router'

export interface AgentStreamEvent {
  type: 'tool_start' | 'content' | 'done'
  toolName?: string
  content?: string
  toolResults?: ToolResultEntry[]
}

export interface ToolResultEntry {
  toolName: string
  result: string
}

/**
 * Run the LangGraph agent with tool calling and stream events.
 */
export async function* streamAgentResponse(options: {
  query: string
  route: RouteType
  tools: StructuredToolInterface[]
  conversationHistory: ChatMessage[]
  ragContext?: string
}): AsyncGenerator<AgentStreamEvent> {
  const { query, route, tools, conversationHistory, ragContext } = options

  // Build system prompt based on route
  const historyText = formatConversationHistory(
    conversationHistory.slice(-CHATBOT_CONFIG.maxHistoryMessages).map((m) => ({
      role: m.role,
      content: m.content,
    }))
  )

  let systemPrompt: string
  if (route === 'data') {
    systemPrompt = SYSTEM_PROMPT_DATA.replace('{history}', historyText)
  } else {
    const context = ragContext || 'Ingen specifik kontext hittades i kunskapsbasen.'
    systemPrompt = SYSTEM_PROMPT_HYBRID
      .replace('{context}', context)
      .replace('{history}', historyText)
  }

  // Create the model
  const model = new ChatAnthropic({
    modelName: CHATBOT_CONFIG.agentModel,
    maxTokens: CHATBOT_CONFIG.agentMaxTokens,
    temperature: CHATBOT_CONFIG.temperature,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })

  // Create the agent
  const agent = createReactAgent({
    llm: model,
    tools,
    prompt: systemPrompt,
  })

  // Build input messages
  const messages: (HumanMessage | AIMessage)[] = []

  // Add recent history as messages for the agent
  const recent = conversationHistory.slice(-CHATBOT_CONFIG.maxHistoryMessages)
  for (const msg of recent) {
    if (msg.role === 'user') {
      messages.push(new HumanMessage(msg.content))
    } else {
      messages.push(new AIMessage(msg.content))
    }
  }
  messages.push(new HumanMessage(query))

  // Track tool results for artifact generation
  const toolResults: ToolResultEntry[] = []

  // Stream the agent execution using streamEvents for fine-grained control
  const eventStream = agent.streamEvents(
    { messages },
    {
      version: 'v2',
      recursionLimit: CHATBOT_CONFIG.maxAgentIterations * 2 + 1,
    }
  )

  for await (const event of eventStream) {
    // Tool start events
    if (event.event === 'on_tool_start') {
      yield { type: 'tool_start', toolName: event.name }
    }

    // Tool end events — capture results
    if (event.event === 'on_tool_end') {
      const output = event.data?.output
      const result = typeof output === 'string' ? output : JSON.stringify(output ?? '')
      toolResults.push({
        toolName: event.name,
        result,
      })
    }

    // LLM streaming tokens (final response text)
    if (event.event === 'on_chat_model_stream') {
      const chunk = event.data?.chunk
      if (chunk) {
        const content = typeof chunk.content === 'string'
          ? chunk.content
          : Array.isArray(chunk.content)
            ? chunk.content
                .filter((c: { type: string }) => c.type === 'text')
                .map((c: { text: string }) => c.text)
                .join('')
            : ''
        if (content) {
          yield { type: 'content', content }
        }
      }
    }
  }

  yield { type: 'done', toolResults }
}
