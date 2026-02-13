// Chat types for AI chatbot

export interface ChatMessage {
  id: string
  session_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  sources: SourceReference[]
  created_at: string
}

export interface ChatSession {
  id: string
  user_id: string
  title: string | null
  created_at: string
}

export interface SourceReference {
  id: string
  source_file: string
  title: string
  section_title: string | null
  similarity: number
}

export interface KnowledgeDocument {
  id: string
  source_file: string
  title: string
  section_title: string | null
  content: string
  content_hash: string
  embedding: number[] | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface ChatRequest {
  message: string
  session_id?: string
}

export interface ChatResponse {
  message: ChatMessage
  session_id: string
}

export interface StreamChunk {
  type: 'content' | 'sources' | 'done' | 'error'
  content?: string
  sources?: SourceReference[]
  error?: string
}
