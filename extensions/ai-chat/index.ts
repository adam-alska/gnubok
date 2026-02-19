import type { Extension } from '@/lib/extensions/types'

/**
 * AI Chat Extension
 *
 * Provides an AI-powered chatbot assistant for Swedish tax and bookkeeping
 * questions. Uses RAG (Retrieval Augmented Generation) with a knowledge base
 * of Swedish tax laws, regulations, and best practices.
 *
 * Components:
 * - chatbot/: Chain, config, prompts, embeddings, retriever
 * - ingestion/: CLI tool for ingesting knowledge base documents
 */
export const aiChatExtension: Extension = {
  id: 'ai-chat',
  name: 'AI-assistent',
  version: '1.0.0',
  settingsPanel: {
    label: 'AI-assistent',
    path: '/settings/extensions/ai-chat',
  },
}
