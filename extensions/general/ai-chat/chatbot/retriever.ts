import { createServiceClient } from '@/lib/supabase/server'
import { generateEmbedding } from './embeddings'
import { CHATBOT_CONFIG } from './config'
import type { SourceReference } from '@/types/chat'

export interface RetrievedDocument {
  id: string
  source_file: string
  title: string
  section_title: string | null
  content: string
  metadata: Record<string, unknown>
  similarity: number
}

export async function retrieveRelevantDocuments(
  query: string,
  matchCount: number = CHATBOT_CONFIG.retrievalK,
  matchThreshold: number = CHATBOT_CONFIG.similarityThreshold
): Promise<RetrievedDocument[]> {
  const supabase = await createServiceClient()

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query)

  // Call the match_documents function
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    match_threshold: matchThreshold,
  })

  if (error) {
    console.error('Error retrieving documents:', error)
    throw new Error('Failed to retrieve relevant documents')
  }

  return (data || []) as RetrievedDocument[]
}

export function documentsToSources(
  documents: RetrievedDocument[]
): SourceReference[] {
  return documents.map((doc) => ({
    id: doc.id,
    source_file: doc.source_file,
    title: doc.title,
    section_title: doc.section_title,
    similarity: doc.similarity,
  }))
}
