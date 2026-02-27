import { ChatAnthropic } from '@langchain/anthropic'
import { CHATBOT_CONFIG } from './config'
import type { ChatMessage } from '@/types/chat'

export type RouteType = 'knowledge' | 'data' | 'hybrid'

export interface RouterResult {
  route: RouteType
  rewrittenQuery: string
}

// Swedish data-related keywords for fast-path heuristic
const DATA_NOUNS = [
  'faktura', 'fakturor', 'fakturorna',
  'leverantörsfaktura', 'leverantörsfakturor',
  'transaktion', 'transaktioner', 'transaktionerna',
  'verifikation', 'verifikationer', 'verifikationerna',
  'resultaträkning', 'balansräkning',
  'moms', 'momsdeklaration', 'momssammanställning',
  'saldo', 'saldon', 'kontosaldo',
  'konto', 'konton', 'kontona',
  'kunder', 'kundfordringar',
  'leverantörsskulder',
  'intäkter', 'kostnader', 'utgifter',
  'resultat', 'årsresultat',
  'bokföring', 'bokförda', 'obokförda',
  'obetalda', 'förfallna',
  'nyckeltal', 'företaget', 'företagsinfo',
]

const POSSESSIVE_PRONOUNS = ['mina', 'min', 'mitt', 'mig', 'våra', 'vår', 'vårt']

const KNOWLEDGE_TERMS = [
  'momsgransen', 'momsgränsen', 'avdrag', 'skatteregler',
  'bokföringslag', 'bokföringslagen', 'regler', 'lag',
  'hur fungerar', 'vad innebär', 'vad betyder', 'vad är',
  'när måste', 'hur räknar', 'hur beräknar',
  'enskild firma', 'aktiebolag', 'egenavgifter',
  'prisbasbelopp', 'schablonavdrag', 'representation',
  'friskvårdsbidrag', 'traktamente',
]

/**
 * Fast-path keyword heuristic. Returns a route if confident, null otherwise.
 */
function heuristicClassify(query: string): RouteType | null {
  const lower = query.toLowerCase()
  const words = lower.split(/\s+/)

  const hasPossessive = POSSESSIVE_PRONOUNS.some((p) => words.includes(p))
  const hasDataNoun = DATA_NOUNS.some((n) => lower.includes(n))
  const hasKnowledgeTerm = KNOWLEDGE_TERMS.some((t) => lower.includes(t))

  // "Visa mina fakturor" — clearly data
  if (hasPossessive && hasDataNoun && !hasKnowledgeTerm) return 'data'

  // Action verbs with data nouns
  const actionVerbs = ['visa', 'hämta', 'lista', 'sök', 'hitta', 'hur går', 'hur ser', 'hur mycket', 'hur många', 'vilka']
  const hasAction = actionVerbs.some((v) => lower.includes(v))
  if (hasAction && hasDataNoun && !hasKnowledgeTerm) return 'data'

  // Pure knowledge question with no data references
  if (hasKnowledgeTerm && !hasPossessive && !hasDataNoun) return 'knowledge'

  // "Hur ser min resultaträkning ut?" — data (has possessive + data noun)
  if (hasPossessive && hasDataNoun && hasKnowledgeTerm) return 'hybrid'

  return null // ambiguous → fall through to LLM
}

/**
 * LLM-based classification + query rewrite for multi-turn context.
 */
async function llmClassify(
  query: string,
  conversationHistory: ChatMessage[]
): Promise<RouterResult> {
  const model = new ChatAnthropic({
    modelName: CHATBOT_CONFIG.routerModel,
    maxTokens: 256,
    temperature: 0,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })

  const historyContext = conversationHistory
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 200)}`)
    .join('\n')

  const prompt = `Classify the user's question and rewrite it for a data query system.

Conversation history:
${historyContext || '(none)'}

User question: "${query}"

Classification rules:
- "knowledge": General questions about Swedish tax law, accounting rules, regulations (no user-specific data needed)
- "data": Questions about the user's own accounting data (invoices, transactions, balances, reports)
- "hybrid": Questions that need both user data AND knowledge context

Rewriting rules:
- Resolve pronouns ("dem", "de", "den") using conversation history
- Make the query self-contained (no context needed to understand it)
- If it's a knowledge question, keep the original query

Respond ONLY with valid JSON:
{"route": "knowledge"|"data"|"hybrid", "rewrittenQuery": "..."}
`

  try {
    const response = await model.invoke(prompt)
    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    // Extract JSON from response
    const jsonMatch = text.match(/\{[^}]+\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const route = ['knowledge', 'data', 'hybrid'].includes(parsed.route)
        ? (parsed.route as RouteType)
        : 'hybrid'
      return {
        route,
        rewrittenQuery: parsed.rewrittenQuery || query,
      }
    }
  } catch (e) {
    console.warn('Router LLM classification failed, defaulting to hybrid:', e)
  }

  return { route: 'hybrid', rewrittenQuery: query }
}

/**
 * Route a user message: fast-path heuristic first, LLM fallback for ambiguous cases.
 */
export async function routeMessage(
  query: string,
  conversationHistory: ChatMessage[]
): Promise<RouterResult> {
  const heuristicResult = heuristicClassify(query)

  if (heuristicResult) {
    // For data/hybrid with conversation history, still rewrite the query for context
    if (heuristicResult !== 'knowledge' && conversationHistory.length > 0) {
      const { rewrittenQuery } = await llmClassify(query, conversationHistory)
      return { route: heuristicResult, rewrittenQuery }
    }
    return { route: heuristicResult, rewrittenQuery: query }
  }

  // Ambiguous — use LLM
  return llmClassify(query, conversationHistory)
}
