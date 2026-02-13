import { OpenAIEmbeddings } from '@langchain/openai'
import { CHATBOT_CONFIG } from './config'

// Singleton instance for embeddings
let embeddingsInstance: OpenAIEmbeddings | null = null

export function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddingsInstance) {
    embeddingsInstance = new OpenAIEmbeddings({
      modelName: CHATBOT_CONFIG.embeddingModel,
      openAIApiKey: process.env.OPENAI_API_KEY,
    })
  }
  return embeddingsInstance
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = getEmbeddings()
  return embeddings.embedQuery(text)
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings = getEmbeddings()
  return embeddings.embedDocuments(texts)
}
