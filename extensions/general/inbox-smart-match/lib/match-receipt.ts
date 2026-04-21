/**
 * Text-only LLM matcher — decides which candidate bank transaction (if any)
 * corresponds to a classified receipt. Uses Bedrock Converse with structured
 * tool output. No image input: the receipt is already represented by the
 * extracted data, and candidates are pure text.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
  type ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime'
import type { CandidateTransaction, ExtractedDocument } from './fetch-candidates'
import { getMatchAnchors } from './fetch-candidates'

export interface ReceiptMatchResult {
  matched: boolean
  transactionId: string | null
  confidence: number // 0..1
  reasoning: string
  usage: { inputTokens: number; outputTokens: number }
}

let _client: BedrockRuntimeClient | null = null

function getClient(): BedrockRuntimeClient {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'eu-north-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  }
  return _client
}

const SYSTEM_PROMPT = `Du är en expert på att matcha svenska bokföringsdokument (kvitton, fakturor) mot banktransaktioner.

Du får:
- Dokumentdata (handlare/leverantör, belopp, valuta, datum) från AI-extraktion
- En lista med kandidat-banktransaktioner (id, beskrivning, belopp, valuta, datum)

Uppgift: identifiera vilken (om någon) banktransaktion som motsvarar dokumentet.

Resonera utifrån:
- Belopp: bör vara identiskt eller mycket nära (ta hänsyn till valutaväxling om olika valutor)
- Datum: för kvitton bokförs banktransaktionen ofta 0-3 dagar efter köpet; för leverantörsfakturor kan betalningen ske flera dagar till veckor efter fakturadatum
- Handlare/leverantör: bankens beskrivning är ofta förkortad/versaler ("WILLYS SÖDERM" = "Willys Hemma Södermalm"). Matcha semantiskt, inte bokstavligt

Om inget förslag är trovärdigt — returnera matched=false.
Anropa ALLTID verktyget match_receipt med resultatet.
Motivering ska vara kort, på svenska och förklara varför transaktionen valdes.`

const MATCH_TOOL: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: 'match_receipt',
        description: 'Returnera vilken kandidat-transaktion som matchar kvittot',
        inputSchema: {
          json: {
            type: 'object',
            required: ['matched', 'confidence', 'reasoning'],
            properties: {
              matched: {
                type: 'boolean',
                description: 'true om en kandidat matchar, false annars',
              },
              transaction_id: {
                type: ['string', 'null'],
                description: 'id för den matchande kandidaten (null om matched=false)',
              },
              confidence: {
                type: 'integer',
                minimum: 0,
                maximum: 100,
                description: 'Säkerhet 0-100. Sätt lågt när matched=false.',
              },
              reasoning: {
                type: 'string',
                description: '1-2 meningar på svenska som förklarar beslutet.',
              },
            },
          },
        },
      },
    },
  ],
  toolChoice: { any: {} },
}

export interface MatchReceiptInput {
  extracted: ExtractedDocument
  candidates: CandidateTransaction[]
}

/**
 * Call Bedrock to choose the best matching transaction.
 * Returns a neutral result (matched=false) if the model doesn't find a fit or
 * the tool schema is missing from the response.
 */
export async function matchReceiptToCandidate(
  input: MatchReceiptInput
): Promise<ReceiptMatchResult> {
  const anchors = getMatchAnchors(input.extracted)
  const receiptBrief = {
    merchant: anchors?.counterpartyName ?? null,
    amount: anchors?.amount ?? null,
    currency: anchors?.currency ?? 'SEK',
    date: anchors?.date ?? null,
    vat_amount: input.extracted.totals?.vatAmount ?? null,
  }

  const candidateLines = input.candidates.map((c) => ({
    id: c.id,
    date: c.date,
    description: c.description,
    amount: c.amount,
    amount_sek: c.amount_sek,
    currency: c.currency,
    merchant_name: c.merchant_name,
  }))

  const userPrompt = `Dokument:
${JSON.stringify(receiptBrief, null, 2)}

Kandidat-transaktioner:
${JSON.stringify(candidateLines, null, 2)}

Vilken transaktion matchar dokumentet? Om ingen matchar, returnera matched=false.`

  const messages: Message[] = [
    {
      role: 'user',
      content: [{ text: userPrompt }],
    },
  ]

  const modelId = process.env.BEDROCK_MODEL_ID || 'eu.anthropic.claude-sonnet-4-6'
  const maxTokens = parseInt(process.env.BEDROCK_MAX_TOKENS || '1024', 10)

  const command = new ConverseCommand({
    modelId,
    messages,
    system: [{ text: SYSTEM_PROMPT }],
    toolConfig: MATCH_TOOL,
    inferenceConfig: { maxTokens, temperature: 0 },
  })

  const response = await getClient().send(command)

  const usage = {
    inputTokens: response.usage?.inputTokens ?? 0,
    outputTokens: response.usage?.outputTokens ?? 0,
  }

  const outputMessage = response.output?.message
  if (!outputMessage?.content) {
    return { matched: false, transactionId: null, confidence: 0, reasoning: 'Inget LLM-svar', usage }
  }

  const toolUseBlock = outputMessage.content.find(
    (block): block is ContentBlock.ToolUseMember => 'toolUse' in block && block.toolUse !== undefined
  )

  if (!toolUseBlock?.toolUse?.input) {
    return { matched: false, transactionId: null, confidence: 0, reasoning: 'Inget verktygsanrop', usage }
  }

  const raw = toolUseBlock.toolUse.input as Record<string, unknown>
  const matched = Boolean(raw.matched)
  const rawId = typeof raw.transaction_id === 'string' ? raw.transaction_id : null
  const transactionId = matched
    ? (input.candidates.find((c) => c.id === rawId)?.id ?? null)
    : null
  const confidenceRaw = Number(raw.confidence)
  const confidence =
    isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw / 100))
      : 0
  const reasoning = typeof raw.reasoning === 'string' ? raw.reasoning.trim() : ''

  // If LLM said matched but we can't resolve the transaction_id to a candidate,
  // degrade gracefully to unmatched so downstream isn't left dangling.
  if (matched && !transactionId) {
    return {
      matched: false,
      transactionId: null,
      confidence: 0,
      reasoning: reasoning || 'LLM angav ogiltigt transaction_id',
      usage,
    }
  }

  return { matched, transactionId, confidence, reasoning, usage }
}
