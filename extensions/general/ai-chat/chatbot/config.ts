// AI Chatbot configuration

export const CHATBOT_CONFIG = {
  // LLM settings
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 2048,
  temperature: 0.3,

  // Retrieval settings
  retrievalK: 5,
  similarityThreshold: 0.7,

  // Embedding settings
  embeddingModel: 'text-embedding-ada-002',

  // Chunking settings for ingestion
  chunkSize: 1000,
  chunkOverlap: 200,

  // Rate limiting
  rateLimitPerMinute: 10,

  // Conversation history
  maxHistoryMessages: 10,
} as const
