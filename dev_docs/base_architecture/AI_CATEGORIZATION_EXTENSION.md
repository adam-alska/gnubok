# AI Categorization Extension — Implementation Summary

This document describes the ai-categorization extension: the second first-party extension built on the Part 3 event bus and extension registry. It uses Claude Haiku to suggest BAS account categorizations for bank transactions, following the same canonical pattern established by receipt-ocr.

---

## Problem

Transaction categorization is the most frequent daily task. Every downstream report (momsdeklaration, income statement, balance sheet, NE-bilaga, SRU export) depends on transactions being mapped to the correct BAS accounts.

Before this extension, suggestions came only from:

- **Mapping rules** — user-defined merchant/description patterns (confidence 0.8)
- **Pattern matching** — built-in regex heuristics from `expense-warnings.ts` (confidence 0.6)
- **User history** — most frequently used categories (confidence 0.1–0.5)

These sources cover common recurring transactions but fail on novel descriptions, edge cases, and new users with no history.

## Solution

An `ai-categorization` extension that:

1. Listens to `transaction.synced` events and auto-generates AI-powered category suggestions for uncategorized transactions
2. Stores suggestions in `extension_data` (pre-computed, ready when the user opens the transaction list)
3. Exposes an on-demand API for manual "AI suggest" triggers
4. Merges AI suggestions into the existing suggestion pipeline alongside rule/pattern/history sources

**Key constraint:** Suggestions only, never auto-commit. The extension stores suggestions in `extension_data` but never creates journal entries. The user confirms via the existing categorization UI, preserving audit trail integrity.

---

## Files Changed

### New files

| File | Purpose |
|------|---------|
| `extensions/ai-categorization/categorizer.ts` | AI provider interface + Anthropic implementation |
| `extensions/ai-categorization/index.ts` | Extension: settings, event handler, public API, extension object |
| `app/api/extensions/ai-categorization/settings/route.ts` | GET/PATCH API for per-user extension settings |
| `app/api/extensions/ai-categorization/suggestions/route.ts` | GET (pre-computed) / POST (on-demand) suggestions API |

### Modified files

| File | Change |
|------|--------|
| `lib/extensions/loader.ts` | Imported and registered `aiCategorizationExtension` |
| `lib/transactions/category-suggestions.ts` | Added `'ai'` to `SuggestedCategory.source` union; added `mergeAiSuggestions()` |
| `app/api/transactions/suggest-categories/route.ts` | Reads pre-computed AI suggestions from `extension_data` and merges into results |

---

## Provider Abstraction

The architecture doc requires "no hard dependency on any specific AI provider". The categorizer implements this via a `CategorizationProvider` interface.

### `CategorizationProvider` interface

```typescript
interface CategorizationProvider {
  categorize(
    transactions: TransactionForCategorization[],
    context: CategorizationContext
  ): Promise<CategorizationSuggestion[]>
}
```

### `TransactionForCategorization`

Minimal transaction data sent to the AI:

```typescript
interface TransactionForCategorization {
  id: string
  description: string
  amount: number        // negative = expense, positive = income
  date: string
  merchant_name: string | null
  mcc_code: number | null
  currency: string
}
```

### `CategorizationContext`

Contextual data that improves accuracy:

```typescript
interface CategorizationContext {
  entityType: EntityType                              // 'enskild_firma' | 'aktiebolag'
  recentHistory: { description: string; category: string }[]  // last 50 categorized
}
```

### `CategorizationSuggestion`

The result per transaction:

```typescript
interface CategorizationSuggestion {
  transactionId: string
  category: TransactionCategory
  basAccount: string          // BAS account number (e.g. '5420')
  taxCode: string | null      // 'MPI', 'MP1', or null
  confidence: number          // 0.0–1.0
  reasoning: string           // Swedish-language explanation
  isPrivate: boolean          // true = likely private expense
}
```

### `AnthropicCategorizationProvider`

The default implementation using `@anthropic-ai/sdk` (already a project dependency):

- Model: `claude-haiku-4-5-20251001` (same as receipt-analyzer, chosen for cost efficiency)
- Batch size: max 20 transactions per API call (cross-transaction pattern recognition)
- Retry logic: 3 attempts with exponential backoff, no retry on JSON parse errors
- Response validation: filters to valid transaction IDs and valid `TransactionCategory` values

The system prompt includes:

1. Full `TransactionCategory` → BAS account mapping table
2. Entity type (EF uses 2013 for private, AB uses 2893)
3. Swedish non-deductible expense rules (kläder, gym, kosmetika, etc. with legal references)
4. VAT treatment rules (bank fees exempt, standard 25% otherwise)
5. User's recent categorization history (up to 30 entries) for learning patterns

---

## Extension: `extensions/ai-categorization/index.ts`

### Settings

```typescript
interface AiCategorizationSettings {
  autoSuggestEnabled: boolean     // default: true
  confidenceThreshold: number     // default: 0.7
  providerModel: string           // default: 'claude-haiku-4-5-20251001'
}
```

Stored as an `extension_data` row with `extension_id='ai-categorization'`, `key='settings'`, `value=<jsonb>`.

- `getSettings(userId)` reads from DB and merges with defaults (forward-compatible)
- `saveSettings(userId, partial)` merges partial update with current, upserts on `(user_id, extension_id, key)`

### Event Handler: `transaction.synced`

When new transactions arrive from banking sync:

1. **Gate:** Is `autoSuggestEnabled` in user's settings? — if not, return
2. **Gate:** Filter to uncategorized transactions only (`is_business === null`) — if none, return
3. Fetch entity type from `company_settings`
4. Fetch user's last 50 categorized transactions (for learning patterns)
5. Call `provider.categorize(batch, context)`
6. Filter suggestions to those above `confidenceThreshold`
7. Store each qualified suggestion to `extension_data` as `key: "suggestion:{transactionId}"`
8. Log summary with `[ai-categorization]` prefix

### Public API: `categorizeTransactions(userId, transactionIds)`

Exported function for on-demand categorization (used by the suggestions POST endpoint):

1. Fetch transactions by IDs
2. Build context (entity type + history)
3. Call provider
4. Store all suggestions (no threshold filtering — user explicitly requested)
5. Return suggestions

### Extension Object

```typescript
export const aiCategorizationExtension: Extension = {
  id: 'ai-categorization',
  name: 'AI Kategorisering',
  version: '1.0.0',
  eventHandlers: [
    { eventType: 'transaction.synced', handler: handleTransactionSynced },
  ],
  settingsPanel: {
    label: 'AI Kategorisering',
    path: '/settings/extensions/ai-categorization',
  },
  async onInstall(ctx) { await saveSettings(ctx.userId, DEFAULT_SETTINGS) },
}
```

---

## Suggestion Storage

Suggestions are stored as individual rows in `extension_data`:

| Column | Value |
|--------|-------|
| `user_id` | The user who owns the transaction |
| `extension_id` | `'ai-categorization'` |
| `key` | `'suggestion:{transactionId}'` |
| `value` | The full `CategorizationSuggestion` object as JSONB |

This per-transaction key scheme allows:

- Fast lookup by transaction ID (used by the suggest-categories route)
- Batch lookup via `IN` clause on keys
- Natural overwrite on re-categorization (upsert on unique constraint)

---

## Suggestions API: `app/api/extensions/ai-categorization/suggestions/route.ts`

### `GET ?transaction_ids=id1,id2,...`

Reads pre-computed suggestions from `extension_data`. Returns only what's already stored — no AI call.

Response: `{ suggestions: { [txId]: CategorizationSuggestion } }`

### `POST { transaction_ids: [...] }`

Triggers on-demand AI categorization via `categorizeTransactions()`. Stores results and returns them.

Response: `{ suggestions: { [txId]: CategorizationSuggestion } }`

Both endpoints limit to 50 transaction IDs per request.

---

## Settings API: `app/api/extensions/ai-categorization/settings/route.ts`

Mirrors the receipt-ocr settings route exactly:

- **GET** — Returns the current user's merged settings (DB value + defaults)
- **PATCH** — Accepts a partial settings object, validates keys against allowlist (`autoSuggestEnabled`, `confidenceThreshold`, `providerModel`), saves via `saveSettings()`

---

## Integration with Existing Suggestion Pipeline

### `lib/transactions/category-suggestions.ts`

Two changes:

1. **Source type extended:** `SuggestedCategory.source` union widened from `'mapping_rule' | 'pattern' | 'history'` to `'mapping_rule' | 'pattern' | 'history' | 'ai'`

2. **New merge function:**

```typescript
function mergeAiSuggestions(
  existing: SuggestedCategory[],
  aiSuggestions: { category: string; basAccount: string; confidence: number; reasoning: string }[]
): SuggestedCategory[]
```

Inserts AI suggestions into the list, deduplicating by category (skips categories already present from higher-priority sources). Returns top 5 sorted by confidence.

### `app/api/transactions/suggest-categories/route.ts`

After computing rule/pattern/history suggestions for each transaction, the route now:

1. Fetches pre-computed AI suggestions from `extension_data` for all requested transaction IDs (single batch query)
2. For each transaction with an AI suggestion, calls `mergeAiSuggestions()` to blend it in
3. Returns the merged result

This means AI suggestions appear alongside existing sources with no latency — they were pre-computed during bank sync.

---

## Suggestion Priority

The existing pipeline already sorts by confidence. With AI added, the effective priority becomes:

| Source | Typical Confidence | When |
|--------|--------------------|------|
| Mapping rules | 0.8 | User-defined patterns match |
| AI | 0.7–0.95 | Pre-computed from sync |
| Pattern matching | 0.6 | Built-in regex matches |
| User history | 0.1–0.5 | Most frequently used categories |

AI suggestions naturally slot between mapping rules and pattern matching. For novel transactions where no mapping rule or pattern exists, AI becomes the top suggestion.

---

## Event Flow

```
Bank Sync
    |
POST /banking/sync
    |
emit transaction.synced
    |
    +---> receipt-ocr extension (auto-match receipts)
    |
    +---> ai-categorization extension
          |
          Gate: autoSuggestEnabled?
          Gate: has uncategorized transactions?
          |
          Fetch entity type + history
          Call AnthropicCategorizationProvider.categorize()
          Filter by confidenceThreshold
          Store to extension_data (suggestion:{txId})
          |
          [suggestions pre-computed and waiting]


User opens transaction list
    |
POST /api/transactions/suggest-categories
    |
    +---> getSuggestedCategories() [mapping rules + patterns + history]
    +---> Read extension_data [pre-computed AI suggestions]
    +---> mergeAiSuggestions()
    |
    v
Response: merged suggestions with source labels
    |
User sees: "AI: Programvara (5420) — confidence 0.9"


User clicks "AI suggest" button (on-demand)
    |
POST /api/extensions/ai-categorization/suggestions
    |
    +---> categorizeTransactions()
    |     Call AI provider
    |     Store results
    |
    v
Response: fresh AI suggestions
```

---

## Existing Code Reused

| Import | From | Used in |
|--------|------|---------|
| `Anthropic` | `@anthropic-ai/sdk` | `AnthropicCategorizationProvider` |
| `getSettings()`/`saveSettings()` pattern | `extensions/receipt-ocr/index.ts` | Settings management (same pattern) |
| `getSuggestedCategories()` | `lib/transactions/category-suggestions.ts` | Existing pipeline (unchanged) |
| `createClient()` | `lib/supabase/server.ts` | DB access throughout |

No existing service logic was duplicated. The extension adds a new AI-powered source to the existing suggestion pipeline.

---

## Architectural Patterns Followed

1. **Suggestions only, never auto-commit.** AI writes to `extension_data`, never to `journal_entries`. The user confirms via existing categorization UI.
2. **Provider abstraction from day one.** `CategorizationProvider` interface means the AI model is swappable without changing extension logic.
3. **Cost-efficient model.** Claude Haiku (same as receipt-analyzer) keeps per-sync costs low.
4. **Batch processing.** One AI call per sync handles up to 20 transactions. Cross-transaction context (e.g., "all ICA transactions = groceries") improves accuracy.
5. **Pre-computed suggestions.** AI runs on sync, results are stored. No user-facing latency when opening the transaction list.
6. **Graceful degradation.** If the AI call fails, the handler catches and logs. Existing rule/pattern/history suggestions still work. No user-facing error.
7. **Gate-guarded.** Every handler checks user settings before doing work.
8. **One-way dependency.** Base never imports from `extensions/`. Only `loader.ts` imports the extension object.
9. **`[ai-categorization]` prefix.** Console logging convention for grep-ability.

---

## No New Migrations

No database schema changes were needed. The existing `extension_data` table (created in Part 3, migration `20240101000020_extension_data.sql`) handles all storage:

- Settings: `key='settings'`
- Per-transaction suggestions: `key='suggestion:{transactionId}'`

The unique constraint `(user_id, extension_id, key)` ensures upsert semantics.

---

## Verification

- `npx tsc --noEmit` — zero TypeScript errors
- `npx vitest run` — all 78 existing tests pass (11 test files)
- Manual: trigger bank sync → check console for `[ai-categorization]` logs
- Manual: open transactions page → uncategorized transactions show AI suggestions (source: `'ai'`) alongside existing pattern/history suggestions
- Manual: disable `autoSuggestEnabled` in settings → sync does not trigger AI
- Manual: `POST /api/extensions/ai-categorization/suggestions` with transaction IDs → returns on-demand suggestions
- Manual: `GET /api/extensions/ai-categorization/settings` → returns default settings
- Manual: `PATCH /api/extensions/ai-categorization/settings` → updates settings
