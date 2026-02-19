/**
 * Knowledge Base Ingestion Script
 *
 * Loads markdown files from dev_docs/ai_knowledge_base/,
 * chunks them by sections, generates embeddings, and stores in Supabase.
 *
 * Run with: npx tsx lib/ai/ingestion/ingest.ts
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { OpenAIEmbeddings } from '@langchain/openai'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { logger } from '@/lib/logger'

// Configuration
const DOCS_DIR = path.join(process.cwd(), 'dev_docs', 'ai_knowledge_base')
const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 200
const EMBEDDING_MODEL = 'text-embedding-ada-002'

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const embeddings = new OpenAIEmbeddings({
  modelName: EMBEDDING_MODEL,
  openAIApiKey: process.env.OPENAI_API_KEY,
})

interface DocumentChunk {
  source_file: string
  title: string
  section_title: string | null
  content: string
  content_hash: string
  metadata: Record<string, unknown>
}

interface Section {
  title: string
  content: string
  level: number
}

/**
 * Parse a markdown file into sections based on headings
 */
function parseMarkdownSections(content: string): Section[] {
  const lines = content.split('\n')
  const sections: Section[] = []
  let currentSection: Section | null = null
  let contentBuffer: string[] = []

  for (const line of lines) {
    // Check for headings (H1, H2, H3)
    const h1Match = line.match(/^# (.+)$/)
    const h2Match = line.match(/^## (.+)$/)
    const h3Match = line.match(/^### (.+)$/)

    if (h1Match || h2Match || h3Match) {
      // Save previous section
      if (currentSection && contentBuffer.length > 0) {
        currentSection.content = contentBuffer.join('\n').trim()
        if (currentSection.content) {
          sections.push(currentSection)
        }
      }

      // Start new section
      const title = h1Match?.[1] || h2Match?.[1] || h3Match?.[1] || ''
      const level = h1Match ? 1 : h2Match ? 2 : 3
      currentSection = { title, content: '', level }
      contentBuffer = []
    } else {
      contentBuffer.push(line)
    }
  }

  // Don't forget the last section
  if (currentSection && contentBuffer.length > 0) {
    currentSection.content = contentBuffer.join('\n').trim()
    if (currentSection.content) {
      sections.push(currentSection)
    }
  }

  return sections
}

/**
 * Split text into chunks while preserving context
 */
function chunkText(text: string, maxSize: number, overlap: number): string[] {
  if (text.length <= maxSize) {
    return [text]
  }

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + maxSize

    // Try to break at a natural point (paragraph, sentence, or word)
    if (end < text.length) {
      // Look for paragraph break
      const paragraphBreak = text.lastIndexOf('\n\n', end)
      if (paragraphBreak > start + maxSize / 2) {
        end = paragraphBreak
      } else {
        // Look for sentence break
        const sentenceBreak = text.lastIndexOf('. ', end)
        if (sentenceBreak > start + maxSize / 2) {
          end = sentenceBreak + 1
        } else {
          // Look for word break
          const wordBreak = text.lastIndexOf(' ', end)
          if (wordBreak > start + maxSize / 2) {
            end = wordBreak
          }
        }
      }
    }

    chunks.push(text.slice(start, end).trim())
    start = end - overlap
    if (start < 0) start = 0
    if (end >= text.length) break
  }

  return chunks.filter((c) => c.length > 0)
}

/**
 * Extract metadata from content (trigger words, categories, etc.)
 */
function extractMetadata(
  content: string,
  sectionTitle: string
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}

  // Extract scenario IDs (e.g., "Scenario 001")
  const scenarioMatches = content.match(/Scenario\s+(\d{3})/gi)
  if (scenarioMatches) {
    metadata.scenarios = scenarioMatches.map((m) =>
      m.replace(/Scenario\s+/i, '')
    )
  }

  // Extract mentioned thresholds/amounts
  const amountMatches = content.match(/(\d+[\s\d]*)\s*(kr|SEK|kronor)/gi)
  if (amountMatches) {
    metadata.amounts = amountMatches.slice(0, 5) // Limit to first 5
  }

  // Extract platform mentions
  const platforms = [
    'YouTube',
    'Twitch',
    'Instagram',
    'TikTok',
    'Patreon',
    'Spotify',
    'Adtraction',
  ]
  const mentionedPlatforms = platforms.filter((p) =>
    content.toLowerCase().includes(p.toLowerCase())
  )
  if (mentionedPlatforms.length > 0) {
    metadata.platforms = mentionedPlatforms
  }

  // Extract categories based on keywords
  const categories: string[] = []
  if (/moms|vat/i.test(content)) categories.push('moms')
  if (/skatt|deklaration/i.test(content)) categories.push('skatt')
  if (/avdrag/i.test(content)) categories.push('avdrag')
  if (/bokför|konto|bas/i.test(content)) categories.push('bokföring')
  if (/sgi|sjuk|föräldra|pension/i.test(content))
    categories.push('socialförsäkring')
  if (/ef|enskild firma/i.test(content)) categories.push('enskild_firma')
  if (/ab|aktiebolag/i.test(content)) categories.push('aktiebolag')

  if (categories.length > 0) {
    metadata.categories = categories
  }

  return metadata
}

/**
 * Generate content hash for deduplication
 */
function generateHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/**
 * Process a single markdown file
 */
function processFile(filePath: string): DocumentChunk[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const fileName = path.basename(filePath)
  const sections = parseMarkdownSections(content)

  const chunks: DocumentChunk[] = []

  // Get document title from first H1
  const documentTitle =
    sections.find((s) => s.level === 1)?.title || fileName.replace('.md', '')

  for (const section of sections) {
    // Skip empty sections
    if (!section.content || section.content.length < 50) {
      continue
    }

    // Chunk large sections
    const textChunks = chunkText(section.content, CHUNK_SIZE, CHUNK_OVERLAP)

    for (let i = 0; i < textChunks.length; i++) {
      const chunkContent = textChunks[i]
      const sectionTitle =
        section.level === 1
          ? null
          : textChunks.length > 1
            ? `${section.title} (del ${i + 1}/${textChunks.length})`
            : section.title

      chunks.push({
        source_file: fileName,
        title: documentTitle,
        section_title: sectionTitle,
        content: chunkContent,
        content_hash: generateHash(chunkContent),
        metadata: extractMetadata(chunkContent, section.title),
      })
    }
  }

  return chunks
}

/**
 * Main ingestion function
 */
async function ingest() {
  logger.info('ingestion', 'Starting knowledge base ingestion')
  logger.info('ingestion', `Reading files from: ${DOCS_DIR}`)

  // Get all markdown files
  const files = fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()

  logger.info('ingestion', 'Found markdown files', { count: files.length })

  // Process all files
  const allChunks: DocumentChunk[] = []
  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file)
    logger.info('ingestion', `Processing: ${file}`)
    const chunks = processFile(filePath)
    allChunks.push(...chunks)
    logger.info('ingestion', `Chunks created`, { file, chunks: chunks.length })
  }

  logger.info('ingestion', 'Total chunks', { count: allChunks.length })

  // Clear existing documents (optional - comment out for incremental updates)
  logger.info('ingestion', 'Clearing existing documents')
  const { error: deleteError } = await supabase
    .from('knowledge_documents')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

  if (deleteError) {
    logger.error('ingestion', 'Error clearing documents', { error: deleteError.message })
    // Continue anyway
  }

  // Generate embeddings in batches
  const BATCH_SIZE = 20
  let processed = 0

  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE)
    const contents = batch.map((c) => c.content)

    logger.info('ingestion', 'Generating embeddings for batch', { batch: Math.floor(i / BATCH_SIZE) + 1, totalBatches: Math.ceil(allChunks.length / BATCH_SIZE) })

    // Generate embeddings
    const embeddingVectors = await embeddings.embedDocuments(contents)

    // Prepare records for insertion
    const records = batch.map((chunk, idx) => ({
      source_file: chunk.source_file,
      title: chunk.title,
      section_title: chunk.section_title,
      content: chunk.content,
      content_hash: chunk.content_hash,
      embedding: embeddingVectors[idx],
      metadata: chunk.metadata,
    }))

    // Insert into Supabase
    const { error: insertError } = await supabase
      .from('knowledge_documents')
      .insert(records)

    if (insertError) {
      logger.error('ingestion', 'Error inserting batch', { error: insertError.message })
      throw insertError
    }

    processed += batch.length
    logger.info('ingestion', 'Inserted documents', { processed, total: allChunks.length })
  }

  logger.info('ingestion', 'Ingestion complete', { totalInserted: allChunks.length })

  // Verify
  const { count } = await supabase
    .from('knowledge_documents')
    .select('*', { count: 'exact', head: true })

  logger.info('ingestion', 'Documents in database', { count })
}

// Run if called directly
ingest().catch((error) => {
  logger.error('ingestion', 'Ingestion failed', { error: error instanceof Error ? error.message : String(error) })
  process.exit(1)
})
