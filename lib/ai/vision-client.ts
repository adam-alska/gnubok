/**
 * Shared Vision Client for Claude Haiku
 *
 * SERVER-ONLY: Uses the Anthropic SDK.
 *
 * Consolidates the duplicated Anthropic SDK logic from classifier.ts,
 * receipt-analyzer.ts, and invoice-analyzer.ts into one shared module.
 */

import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { preprocessImage } from './preprocess-image'

const anthropic = new Anthropic()

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export interface VisionRequest {
  base64: string
  mimeType: string
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  preprocess?: boolean
}

/**
 * Call Claude Haiku Vision with retry logic.
 * Handles PDF vs image content blocks, preprocessing, retries,
 * and JSON fence stripping.
 *
 * Returns parsed JSON from the model response.
 */
export async function callVision(request: VisionRequest): Promise<unknown> {
  const {
    systemPrompt,
    userPrompt,
    maxTokens = 4096,
    preprocess = true,
  } = request

  let { base64, mimeType } = request

  const isPdf = mimeType === 'application/pdf'
  const isImage = mimeType.startsWith('image/')

  if (!isPdf && !isImage) {
    throw new Error(`Unsupported file type: ${mimeType}`)
  }

  // Preprocess images (not PDFs) unless explicitly disabled
  if (preprocess && !isPdf) {
    const preprocessed = await preprocessImage(base64, mimeType)
    base64 = preprocessed.base64
    mimeType = preprocessed.mimeType
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const contentBlocks: Anthropic.MessageCreateParams['messages'][0]['content'] = isPdf
        ? [
            {
              type: 'document' as const,
              source: {
                type: 'base64' as const,
                media_type: 'application/pdf' as const,
                data: base64,
              },
            },
            { type: 'text' as const, text: userPrompt },
          ]
        : [
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: mimeType as ImageMediaType,
                data: base64,
              },
            },
            { type: 'text' as const, text: userPrompt },
          ]

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: contentBlocks }],
        system: systemPrompt,
      })

      const content = message.content[0]
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from AI')
      }

      const jsonText = stripJsonFences(content.text)
      return JSON.parse(jsonText)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')

      // Don't retry on JSON parse errors
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to parse AI response: ${lastError.message}`)
      }

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1))
      }
    }
  }

  throw new Error(`Vision API call failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}

/**
 * Strip markdown JSON fences from AI response text.
 */
export function stripJsonFences(text: string): string {
  let result = text.trim()

  if (result.startsWith('```json')) {
    result = result.slice(7)
  } else if (result.startsWith('```')) {
    result = result.slice(3)
  }
  if (result.endsWith('```')) {
    result = result.slice(0, -3)
  }

  return result.trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
