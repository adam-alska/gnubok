import { ChatAnthropic } from '@langchain/anthropic'
import { z } from 'zod'
import { CHATBOT_CONFIG } from './config'
import type { ToolResultEntry } from './agent'
import type { ArtifactSpec } from '@/types/chat'

// ── Artifact Zod Schemas ────────────────────────────────────────

const ChartDataPoint = z.object({
  label: z.string(),
  value: z.number(),
  color: z.string().optional(),
})

const ChartArtifact = z.object({
  type: z.enum(['bar_chart', 'line_chart', 'pie_chart', 'stacked_bar']),
  title: z.string(),
  data: z.array(ChartDataPoint),
  unit: z.string().optional(),
  subtitle: z.string().optional(),
})

const TableColumn = z.object({
  key: z.string(),
  label: z.string(),
  align: z.enum(['left', 'right']).optional(),
})

const TableArtifact = z.object({
  type: z.literal('table'),
  title: z.string(),
  columns: z.array(TableColumn),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  summary_row: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
})

const KpiCard = z.object({
  label: z.string(),
  value: z.string(),
  trend: z.enum(['up', 'down', 'flat']).optional(),
  change: z.string().optional(),
})

const KpiCardsArtifact = z.object({
  type: z.literal('kpi_cards'),
  title: z.string().optional(),
  cards: z.array(KpiCard),
})

const AgingBucket = z.object({
  label: z.string(),
  amount: z.number(),
  count: z.number(),
})

const AgingBucketsArtifact = z.object({
  type: z.literal('aging_buckets'),
  title: z.string(),
  buckets: z.array(AgingBucket),
  total: z.number(),
})

export const ArtifactSpecSchema = z.discriminatedUnion('type', [
  ChartArtifact,
  TableArtifact,
  KpiCardsArtifact,
  AgingBucketsArtifact,
])

export type { ArtifactSpec } from '@/types/chat'

// ── Artifact System Prompt ──────────────────────────────────────

const ARTIFACT_SYSTEM_PROMPT = `You are a data visualization expert. Given tool results and an AI response about accounting data, generate a structured artifact spec for visual display.

## EXACT schemas (follow field names precisely):

### Chart (bar_chart, line_chart, pie_chart, stacked_bar):
{"type":"bar_chart","title":"...","data":[{"label":"Category name","value":1234}],"unit":"kr"}
IMPORTANT: Each item in "data" MUST have "label" (string) and "value" (number). NOT "name", NOT "amount" — use exactly "label" and "value".

### Table:
{"type":"table","title":"...","columns":[{"key":"col1","label":"Header","align":"right"}],"rows":[{"col1":"value"}],"summary_row":{"col1":"Total"}}

### KPI cards:
{"type":"kpi_cards","title":"...","cards":[{"label":"Metric","value":"1 234 kr","trend":"up","change":"+12%"}]}
IMPORTANT: "trend" MUST be exactly "up", "down", or "flat". No other values allowed.

### Aging buckets:
{"type":"aging_buckets","title":"...","buckets":[{"label":"0 dagar","amount":1000,"count":2}],"total":5000}

## Rules:
1. Return ONLY a single JSON object (not an array!) or the word "null". The top-level must be an object with a "type" field.
2. Choose chart type based on data:
   - Income/balance sheet sections → "bar_chart"
   - Distribution (VAT, account classes) → "pie_chart"
   - Company overview → "kpi_cards"
   - AR/AP aging → "aging_buckets"
   - Lists with >3 items + amounts → "table"
   - Simple answers, few items, yes/no → null
3. Use Swedish labels. Use "kr" as unit for monetary charts.
4. Max 12 chart data points. Aggregate small items as "Övrigt".
5. For tables, include summary_row with totals where appropriate.`

// ── Normalizer ──────────────────────────────────────────────────

/**
 * Fix common LLM field name mistakes before Zod validation.
 * Mutates the object in place.
 */
function normalizeArtifact(obj: Record<string, unknown>): void {
  if (!obj || typeof obj !== 'object') return

  // Chart types: normalize data[].name→label, data[].amount→value
  const chartTypes = ['bar_chart', 'line_chart', 'pie_chart', 'stacked_bar']
  if (chartTypes.includes(obj.type as string) && Array.isArray(obj.data)) {
    for (const item of obj.data) {
      if (item && typeof item === 'object') {
        if ('name' in item && !('label' in item)) {
          item.label = item.name
          delete item.name
        }
        if ('amount' in item && !('value' in item)) {
          item.value = item.amount
          delete item.amount
        }
        if ('total' in item && !('value' in item)) {
          item.value = item.total
          delete item.total
        }
        if ('value' in item && typeof item.value === 'string') {
          const num = parseFloat(String(item.value).replace(/\s/g, '').replace(',', '.'))
          if (!isNaN(num)) item.value = num
        }
      }
    }
  }

  // KPI cards: normalize trend values
  if (obj.type === 'kpi_cards' && Array.isArray(obj.cards)) {
    const trendMap: Record<string, string> = {
      neutral: 'flat', stable: 'flat', none: 'flat', '-': 'flat',
      negative: 'down', decrease: 'down', declining: 'down',
      positive: 'up', increase: 'up', increasing: 'up', growing: 'up',
    }
    for (const card of obj.cards) {
      if (card && typeof card === 'object' && 'trend' in card) {
        const t = String(card.trend).toLowerCase()
        if (trendMap[t]) {
          card.trend = trendMap[t]
        } else if (t !== 'up' && t !== 'down' && t !== 'flat') {
          // Unknown trend value — remove it so optional field passes
          delete card.trend
        }
      }
    }
  }
}

// ── Generator ───────────────────────────────────────────────────

/**
 * Generate an artifact spec from tool results using a post-processing LLM call.
 * Returns null if no visualization is appropriate.
 */
export async function generateArtifact(
  toolResults: ToolResultEntry[],
  assistantResponse: string
): Promise<ArtifactSpec | null> {
  if (toolResults.length === 0) return null

  const model = new ChatAnthropic({
    modelName: CHATBOT_CONFIG.artifactModel,
    maxTokens: 1024,
    temperature: 0,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })

  const toolSummary = toolResults
    .map((r) => `Tool: ${r.toolName}\nResult: ${r.result.slice(0, 2000)}`)
    .join('\n\n---\n\n')

  const prompt = `${ARTIFACT_SYSTEM_PROMPT}

## Tool results:
${toolSummary}

## AI response:
${assistantResponse.slice(0, 1000)}

Generate the artifact JSON or "null":`

  try {
    const response = await model.invoke(prompt)
    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    const trimmed = text.trim()
    if (trimmed === 'null' || trimmed === '"null"') return null

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = trimmed
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    let parsed = JSON.parse(jsonStr)

    // If LLM returned an array, try to wrap it as kpi_cards
    if (Array.isArray(parsed)) {
      // Array of cards → wrap as kpi_cards
      if (parsed.length > 0 && parsed[0] && typeof parsed[0] === 'object' && 'label' in parsed[0]) {
        parsed = { type: 'kpi_cards', title: 'Översikt', cards: parsed }
      } else {
        console.warn('Artifact returned unexpected array')
        return null
      }
    }

    // Normalize common LLM field name mistakes before validation
    normalizeArtifact(parsed)

    const validated = ArtifactSpecSchema.safeParse(parsed)

    if (validated.success) {
      return validated.data as ArtifactSpec
    }

    console.warn('Artifact validation failed:', validated.error.issues)
    return null
  } catch (e) {
    console.warn('Artifact generation failed:', e)
    return null
  }
}
