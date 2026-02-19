Part 3: Event Bus & Extension Registry — Implementation

## What Was Built

An in-process event bus, extension registry with static discovery, database tables for extension data and event observability, and event emission retrofitted into all existing service and API route code paths. Backend only, no UI.

This is the foundation for all Tier 1 add-ons (receipt-ocr, ai-categorization, push-notifications, ne-bilaga, etc.). Without it, every add-on would need to be hardwired into core services.

---

## New Files

### Event Bus — `lib/events/`

**`lib/events/types.ts`**

Defines the `CoreEvent` discriminated union covering 18 event types across six domains:

| Domain | Events |
|--------|--------|
| Bookkeeping | `journal_entry.drafted`, `journal_entry.committed`, `journal_entry.corrected` |
| Documents | `document.uploaded` |
| Invoicing | `invoice.created`, `invoice.sent`, `invoice.paid`, `invoice.overdue`, `credit_note.created` |
| Banking | `transaction.synced`, `transaction.categorized`, `bank.statement_received`, `bank.payment_notification` |
| Periods | `period.locked`, `period.year_closed` |
| Customers | `customer.created`, `customer.pseudonymized` |
| Audit | `audit.security_event` |

Helper types for consuming events:

- `CoreEventType` — string literal union of all event type names
- `EventPayload<T>` — extracts the payload type for a given event type
- `EventHandler<T>` — handler function signature for a specific event type
- `EventSubscription<T>` — event type + handler pair

**`lib/events/bus.ts`**

The event bus singleton. Key design:

- `eventBus.on(eventType, handler)` — subscribe, returns unsubscribe function
- `eventBus.emit(event)` — runs all handlers via `Promise.allSettled` (a failing handler never crashes the emitter)
- `eventBus.clear()` — remove all handlers (for testing)
- Handlers run concurrently, errors logged to console
- Module-level singleton (persists across requests in same Node.js process)

**`lib/events/index.ts`** — Barrel export.

### Extension Registry — `lib/extensions/`

**`lib/extensions/types.ts`**

The `Extension` interface — the contract for all add-ons:

```typescript
interface Extension {
  id: string
  name: string
  version: string

  // Surfaces
  routes?: RouteDefinition[]
  apiRoutes?: ApiRouteDefinition[]
  sidebarItems?: SidebarItem[]
  eventHandlers?: ExtensionEventHandler[]
  mappingRuleTypes?: MappingRuleTypeDefinition[]
  reportTypes?: ReportDefinition[]
  settingsPanel?: SettingsPanelDefinition
  taxCodes?: TaxCodeDefinition[]
  dimensionTypes?: DimensionDefinition[]

  // Lifecycle
  onInstall?(ctx: ExtensionContext): Promise<void>
  onUninstall?(ctx: ExtensionContext): Promise<void>
}
```

Supporting types: `RouteDefinition`, `ApiRouteDefinition`, `SidebarItem`, `ReportDefinition`, `SettingsPanelDefinition`, `TaxCodeDefinition`, `DimensionDefinition`, `MappingRuleTypeDefinition`, `ExtensionEventHandler`, `ExtensionContext`.

**`lib/extensions/registry.ts`**

The `extensionRegistry` singleton:

- `register(extension)` — stores extension, wires event handlers to the bus
- `unregister(extensionId)` — unhooks handlers, removes extension
- `getAll()` — all registered extensions
- `get(id)` — specific extension by ID
- `getByCapability(key)` — extensions that have a specific surface (e.g. all extensions with `reportTypes`)
- `clear()` — remove all (for testing)

**`lib/extensions/loader.ts`**

Static extension discovery. Next.js bundling requires explicit imports, not dynamic filesystem scanning. Contains an empty `FIRST_PARTY_EXTENSIONS` array — extensions are added here as they are built. `loadExtensions()` has an idempotency guard.

**`lib/extensions/index.ts`** — Barrel export.

### Initialization — `lib/init.ts`

`ensureInitialized()` — calls `loadExtensions()` once. Called from API routes that emit events (at module scope, not per-request).

### Example Extension — `extensions/example-logger/index.ts`

Minimal reference implementation that logs `journal_entry.committed` and `document.uploaded` events to console. Not wired into the loader by default — exists as a template for building real extensions.

---

## Migration

**`supabase/migrations/20240101000020_extension_data.sql`**

Two tables:

**`extension_data`** — generic key-value store for extensions:
- Columns: `id`, `user_id`, `extension_id`, `key`, `value` (jsonb), `created_at`, `updated_at`
- `UNIQUE(user_id, extension_id, key)`
- RLS: select, insert, update, delete own rows
- Auto-update `updated_at` trigger

**`event_log`** — append-only event observability:
- Columns: `id`, `user_id`, `event_type`, `payload` (jsonb), `created_at`
- RLS: select + insert only (no update, no delete — append-only)
- Indexes on `(user_id, event_type)` and `created_at`

---

## Type Additions — `types/index.ts`

Placeholder types for event payloads not yet fully built:

| Type | Purpose |
|------|---------|
| `CreditNote` | Extends `Invoice` with required `credited_invoice_id` |
| `CAMT053Statement` | Bank statement (CAMT parsing not yet implemented) |
| `CAMT054Notification` | Payment notification (CAMT parsing not yet implemented) |
| `AuditSecurityEvent` | Security event payload for audit events |
| `ExtensionDataRecord` | Row type for the `extension_data` table |

---

## Retrofitted Event Emissions

The pattern is identical everywhere: import `eventBus`, call `await eventBus.emit(...)` after the successful operation. No control flow changes, no return type changes. All events include a `userId` field for RLS-scoped observability.

### Phase A — Service Layer

| File | Function | Event |
|------|----------|-------|
| `lib/bookkeeping/engine.ts` | `createDraftEntry()` | `journal_entry.drafted` |
| `lib/bookkeeping/engine.ts` | `commitEntry()` | `journal_entry.committed` |
| `lib/bookkeeping/engine.ts` | `createJournalEntry()` | `journal_entry.committed` |
| `lib/bookkeeping/engine.ts` | `reverseEntry()` | `journal_entry.committed` |
| `lib/core/bookkeeping/storno-service.ts` | `correctEntry()` | `journal_entry.corrected` |
| `lib/core/documents/document-service.ts` | `uploadDocument()` | `document.uploaded` |
| `lib/core/bookkeeping/period-service.ts` | `lockPeriod()` | `period.locked` |
| `lib/core/bookkeeping/year-end-service.ts` | `executeYearEndClosing()` | `period.year_closed` |

### Phase B — API Routes

| File | Event |
|------|-------|
| `app/api/invoices/route.ts` (POST) | `invoice.created` |
| `app/api/invoices/route.ts` (createCreditNote) | `credit_note.created` |
| `app/api/invoices/[id]/send/route.ts` | `invoice.sent` |
| `app/api/customers/route.ts` (POST) | `customer.created` |
| `app/api/transactions/[id]/categorize/route.ts` | `transaction.categorized` |
| `app/api/banking/sync/route.ts` | `transaction.synced` |

API routes also call `ensureInitialized()` at module scope to ensure extensions are loaded before events are emitted.

### Deferred (Phase C)

These events are defined in the type system but not yet emitted because the underlying infrastructure doesn't exist:

| Event | Reason |
|-------|--------|
| `invoice.paid` | Payment matching with kursdifferens not fully wired |
| `invoice.overdue` | Needs cron-based detection |
| `bank.statement_received` | CAMT053 parsing not implemented |
| `bank.payment_notification` | CAMT054 parsing not implemented |
| `customer.pseudonymized` | GDPR flow not implemented |
| `audit.security_event` | Already logged at DB level; app-level TBD |

---

## Design Decisions

1. **In-process bus** — architecture specifies "in-process handlers initially, add webhook dispatch when external plugin consumers exist." No message queue, no outbox pattern at the event bus level.

2. **`Promise.allSettled`** — a failing handler never crashes the emitting service. Errors are logged to console. The emitter's control flow is never affected.

3. **Module-level singletons** — `eventBus` and `extensionRegistry` persist across requests in the same Node.js process. They are not per-request or per-user.

4. **Static extension imports** — Next.js bundling requires explicit imports in `loader.ts`, not dynamic `fs.readdirSync`. Extensions are added to the `FIRST_PARTY_EXTENSIONS` array as they are built.

5. **One-way dependency** — `lib/events/` depends on nothing except `types/`. Core services import from `lib/events/`. Extensions import from `lib/core/`, `lib/events/`, and `lib/extensions/`. The base never imports from `extensions/`.

6. **`ensureInitialized()` at module scope** — API routes call this at the top of the file (not inside request handlers). This means extensions are loaded once when the module is first imported by Next.js, not on every request.

7. **Every event payload includes `userId`** — enables RLS-scoped event logging and per-user extension behavior without needing to pass auth context through the bus.

---

## How to Build an Extension

1. Create a directory under `extensions/your-extension/`
2. Export an object satisfying the `Extension` interface
3. Import it in `lib/extensions/loader.ts` and add to `FIRST_PARTY_EXTENSIONS`

Example (see `extensions/example-logger/index.ts`):

```typescript
import type { Extension } from '@/lib/extensions/types'
import type { EventPayload } from '@/lib/events/types'

export const myExtension: Extension = {
  id: 'my-extension',
  name: 'My Extension',
  version: '0.1.0',
  eventHandlers: [
    {
      eventType: 'journal_entry.committed',
      handler: async (payload: EventPayload<'journal_entry.committed'>) => {
        // Your logic here
      },
    },
  ],
}
```

---

## Verification

- `npx tsc --noEmit` — zero errors
- All existing API routes unchanged in behavior — event emission is additive, never blocking
- Extension system is fully wired but dormant (empty extension list) until extensions are added to the loader
