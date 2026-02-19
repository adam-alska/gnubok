# Receipt-OCR Extension — Implementation Summary

This document describes the receipt-ocr extension: the first real extension built on the Part 3 event bus and extension registry infrastructure. It bridges the document archive to the receipt pipeline via events and establishes the canonical pattern for all future extensions.

---

## Problem

Receipt-OCR functionality existed as built-in code (`lib/receipts/`, `app/api/receipts/`), but was disconnected from the event system:

- Uploading a document via the archive did not trigger OCR
- New bank transactions did not auto-match to receipts
- No domain events were emitted when receipts were extracted, matched, or confirmed

The event bus and extension registry (Part 3) were built but had zero real extensions using them.

## Solution

A `receipt-ocr` extension that:

1. Listens to `document.uploaded` events and auto-triggers OCR on images
2. Listens to `transaction.synced` events and auto-matches receipts to new transactions
3. Emits its own domain events (`receipt.extracted`, `receipt.matched`, `receipt.confirmed`) so downstream extensions can react

**Principle followed:** Services = reusable logic in `lib/`. Extensions = event-driven glue. API routes = HTTP interface.

---

## Files Changed

### New files

| File | Purpose |
|------|---------|
| `extensions/receipt-ocr/index.ts` | The extension: settings, event handlers, extension object |
| `app/api/extensions/receipt-ocr/settings/route.ts` | GET/PATCH API for per-user extension settings |

### Modified files

| File | Change |
|------|--------|
| `lib/events/types.ts` | Added `Receipt` import and 3 new events to `CoreEvent` union |
| `lib/extensions/loader.ts` | Imported and registered `receiptOcrExtension` |
| `app/api/receipts/upload/route.ts` | Emits `receipt.extracted` after successful OCR |
| `app/api/receipts/[id]/match/route.ts` | Emits `receipt.matched` after manual match; upgraded selects to fetch full objects |
| `app/api/receipts/[id]/confirm/route.ts` | Emits `receipt.confirmed` with computed business/private totals |

---

## New Events

Three events were added to `lib/events/types.ts`:

### `receipt.extracted`

Fires when OCR extraction completes on a receipt image, whether via the direct upload path or the document archive path.

```typescript
{ type: 'receipt.extracted'; payload: {
    receipt: Receipt;
    documentId: string | null;  // null when from direct upload path
    confidence: number;
    userId: string;
}}
```

### `receipt.matched`

Fires when a receipt is linked to a bank transaction, whether by user manual action or extension auto-match.

```typescript
{ type: 'receipt.matched'; payload: {
    receipt: Receipt;
    transaction: Transaction;
    confidence: number;
    autoMatched: boolean;  // true = extension, false = user manual
    userId: string;
}}
```

### `receipt.confirmed`

Fires when a user confirms line item classifications (business vs private).

```typescript
{ type: 'receipt.confirmed'; payload: {
    receipt: Receipt;
    businessTotal: number;
    privateTotal: number;
    userId: string;
}}
```

---

## Event Retrofitting

Existing API routes were retrofitted to emit events after their success paths. Each route received:

- `import { eventBus } from '@/lib/events/bus'`
- `import { ensureInitialized } from '@/lib/init'`
- `ensureInitialized()` at module scope
- `await eventBus.emit(...)` after the successful operation, before the response

### `app/api/receipts/upload/route.ts`

Emits `receipt.extracted` after the complete receipt (with line items) is fetched, with `documentId: null` since this is the direct upload path.

### `app/api/receipts/[id]/match/route.ts`

The PATCH handler's ownership verification queries were upgraded from `select('id')` to `select('*, line_items:receipt_line_items(*)')` and `select('*')` respectively, so the full receipt and transaction objects are available for the event payload. Emits `receipt.matched` with `autoMatched: false`.

### `app/api/receipts/[id]/confirm/route.ts`

Computes `businessTotal` and `privateTotal` by iterating over the updated receipt's line items. Emits `receipt.confirmed` with these totals.

---

## Extension: `extensions/receipt-ocr/index.ts`

### Settings

```typescript
interface ReceiptOcrSettings {
  autoOcrEnabled: boolean          // default: true
  autoMatchEnabled: boolean        // default: true
  autoMatchThreshold: number       // default: 0.8
  ocrConfidenceThreshold: number   // default: 0.6
}
```

Stored as an `extension_data` row with `extension_id='receipt-ocr'`, `key='settings'`, `value=<jsonb>`.

- `getSettings(userId)` reads from DB and merges with defaults (forward-compatible when new settings are added)
- `saveSettings(userId, partial)` merges partial update with current settings, then upserts on the unique constraint `(user_id, extension_id, key)`

### Event Handler: `document.uploaded`

When an image is uploaded via the document archive:

1. **Gate:** Is `document.mime_type` an image? (`image/jpeg|png|webp|gif`) — if not, return
2. **Gate:** Is `autoOcrEnabled` in user's settings? — if not, return
3. Downloads image from `documents` storage bucket
4. Converts to base64, calls `analyzeReceipt()` from `lib/receipts/receipt-analyzer.ts`
5. **Gate:** Is `extraction.confidence >= ocrConfidenceThreshold`? — if not, return
6. Calls `processLineItems()` from `lib/receipts/receipt-categorizer.ts`
7. Creates receipt record (status: `extracted`) + line items in DB
8. Emits `receipt.extracted` with `documentId: document.id`

### Event Handler: `transaction.synced`

When new transactions arrive from banking sync:

1. **Gate:** Is `autoMatchEnabled`? — if not, return
2. Filters to expense transactions only (amount < 0)
3. Fetches unmatched receipts (`status IN ('extracted','confirmed')`, `matched_transaction_id IS NULL`)
4. Calls `autoMatchReceipts()` from `lib/receipts/receipt-matcher.ts` with `settings.autoMatchThreshold`
5. For each match: updates receipt + transaction bidirectional link, emits `receipt.matched` with `autoMatched: true`

### Extension Object

```typescript
export const receiptOcrExtension: Extension = {
  id: 'receipt-ocr',
  name: 'Receipt OCR',
  version: '1.0.0',
  eventHandlers: [
    { eventType: 'document.uploaded', handler: handleDocumentUploaded },
    { eventType: 'transaction.synced', handler: handleTransactionSynced },
  ],
  mappingRuleTypes: [
    { id: 'receipt-ocr-merchant', name: 'OCR Merchant Match', ... },
    { id: 'receipt-ocr-category', name: 'OCR Category Suggestion', ... },
  ],
  settingsPanel: { label: 'Receipt OCR', path: '/settings/extensions/receipt-ocr' },
  async onInstall(ctx) { await saveSettings(ctx.userId, DEFAULT_SETTINGS) },
}
```

---

## Settings API: `app/api/extensions/receipt-ocr/settings/route.ts`

Establishes the convention `app/api/extensions/{id}/settings/route.ts` for all extensions.

- **GET** — Returns the current user's merged settings (DB value + defaults)
- **PATCH** — Accepts a partial settings object, validates keys against an allowlist, saves via `saveSettings()`

---

## Existing Code Reused

| Import | From | Used in |
|--------|------|---------|
| `analyzeReceipt()` | `lib/receipts/receipt-analyzer.ts` | `handleDocumentUploaded` |
| `processLineItems()` | `lib/receipts/receipt-categorizer.ts` | `handleDocumentUploaded` |
| `autoMatchReceipts()` | `lib/receipts/receipt-matcher.ts` | `handleTransactionSynced` |
| `eventBus` | `lib/events/bus.ts` | Both handlers + retrofit |
| `createClient()` | `lib/supabase/server.ts` | Settings + DB ops |

No service logic was duplicated. The extension only acts as event-driven glue between existing services.

---

## Event Flow

```
Document Archive Upload          Direct Receipt Upload          Bank Sync
         |                              |                          |
   uploadDocument()              POST /receipts/upload      POST /banking/sync
         |                              |                          |
  emit document.uploaded         analyzeReceipt() inline    emit transaction.synced
         |                              |                          |
         v                              v                          v
  +-----------------+    emit receipt.extracted      +---------------------+
  |  receipt-ocr    |                                |    receipt-ocr      |
  |  extension      |                                |    extension        |
  |                 |                                |                     |
  | Gate: image?    |                                | Gate: enabled?      |
  | Gate: enabled?  |                                | Fetch unmatched     |
  | Download image  |                                | autoMatchReceipts() |
  | analyzeReceipt()|                                | Link matches        |
  | Create receipt  |                                | emit receipt.matched|
  | emit receipt.   |                                +---------------------+
  |   extracted     |
  +-----------------+

         User confirms receipt --> POST /receipts/[id]/confirm
                                          |
                                   emit receipt.confirmed
                                          |
                                          v
                                 [Future extensions]
                                 push-notifications
                                 ne-bilaga, etc.
```

---

## Architectural Patterns Established

1. **Extensions never duplicate service logic.** They call existing functions from `lib/`.
2. **Extensions are gate-guarded.** Every handler checks user settings before doing work.
3. **Extensions emit domain events.** Downstream extensions react without coupling.
4. **Events fire from both paths.** Whether a receipt enters via archive (event-driven) or direct upload (API), the same `receipt.extracted` event fires.
5. **Settings use `extension_data` with `key='settings'`.** Helpers merge with defaults for forward-compatible schema evolution.
6. **`onInstall` seeds defaults.** Idempotent via upsert.
7. **Handlers never crash the emitter.** `Promise.allSettled` in the bus handles this.
8. **Console logging with `[extension-id]` prefix.** Convention for grep-ability.
9. **One-way dependency.** Base never imports from `extensions/`. Only `loader.ts` imports extension objects.

---

## Verification

- `npx tsc --noEmit` passes with zero errors
- Manual: upload image via document archive -> receipt auto-created with OCR extraction
- Manual: sync bank transactions -> unmatched receipts auto-matched
- Manual: direct receipt upload still works unchanged, now also emits `receipt.extracted`
- Manual: confirm receipt -> emits `receipt.confirmed`
