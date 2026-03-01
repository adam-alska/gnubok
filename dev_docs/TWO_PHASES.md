                                                                                                                                
 Here is Claude's plan:                                                                                                         
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Plan A: Extension Opt-In Foundation (~3 days)                                                                                  
                                                                                                                                
 Context                                                                                                                        
                                                                                                                                
 erp-base is being open-sourced. The core (Swedish bookkeeping) should work standalone with only Supabase. Extensions (AI,      
 PSD2, push, email, sector tools) ship in the same repo as an "extensions library" that developers explicitly opt into via a    
 JSON config file. Everything is open-source — monetization happens on the hosted platform.                                     

 This plan establishes the architectural boundary. After this plan:
 - Core builds and runs with an empty config (zero extensions)
 - Extensions are enabled by adding their ID to extensions.config.json
 - CI prevents anyone from accidentally importing extension code in core
 - Every extension has a manifest describing its dependencies

 Plan B (separate, future) handles the full cleanup: email extraction, API route migration, template-embeddings relocation,
 SRU/NE-bilaga merge, cross-extension cleanup, and documentation.

 Current Coupling (What We're Fixing)

 Only 3 files in lib/ directly import from extensions/:

 ┌───────────────────────────────────────┬───────────────────────────────────────────────────────────┐
 │                 File                  │                         Coupling                          │
 ├───────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ lib/extensions/loader.ts              │ 12 hardcoded static imports from @/extensions/            │
 ├───────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ lib/extensions/workspace-registry.tsx │ 24 hardcoded next/dynamic() imports                       │
 ├───────────────────────────────────────┼───────────────────────────────────────────────────────────┤
 │ lib/extensions/sectors.ts             │ Hardcoded extension metadata (data only, no code imports) │
 └───────────────────────────────────────┴───────────────────────────────────────────────────────────┘

 Everything else is already clean — event bus, registry, context factory, types, core API routes, core components.

 Implementation

 Step 1: Create the config file and JSON schema

 New file: extensions.config.json
 {
   "$schema": "./extensions.schema.json",
   "extensions": []
 }

 New file: extensions.schema.json

 JSON Schema listing all valid extension IDs with descriptions, giving IDE autocompletion. Generated from manifest files (or
 hand-maintained initially).

 Step 2: Add manifest.json to every extension

 Each extension directory gets a manifest describing its metadata, imports, and requirements.

 Format:
 {
   "id": "receipt-ocr",
   "sector": "general",
   "exportName": "receiptOcrExtension",
   "workspace": "@/components/extensions/general/ReceiptOcrWorkspace",
   "requiredEnvVars": ["ANTHROPIC_API_KEY"],
   "optionalEnvVars": [],
   "npmDependencies": ["@anthropic-ai/sdk"],
   "definition": {
     "name": "Receipt OCR",
     "category": "import",
     "icon": "Camera",
     "dataPattern": "both",
     "description": "Scan and process receipts with AI",
     "longDescription": "..."
   }
 }

 Extensions to manifest (24 total):

 ┌────────────────────────┬────────────────────────────────────────────┬───────────────────────────────────────────────────┐
 │       Extension        │                    Path                    │                 Required Env Vars                 │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ receipt-ocr            │ extensions/general/receipt-ocr/            │ ANTHROPIC_API_KEY                                 │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ ai-categorization      │ extensions/general/ai-categorization/      │ ANTHROPIC_API_KEY, OPENAI_API_KEY                 │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ ai-chat                │ extensions/general/ai-chat/                │ ANTHROPIC_API_KEY, OPENAI_API_KEY                 │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ invoice-inbox          │ extensions/general/invoice-inbox/          │ ANTHROPIC_API_KEY                                 │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ enable-banking         │ extensions/general/enable-banking/         │ ENABLE_BANKING_APP_ID, ENABLE_BANKING_PRIVATE_KEY │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ push-notifications     │ extensions/general/push-notifications/     │ VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY   │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ calendar               │ extensions/general/calendar/               │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ eu-sales-list          │ extensions/export/eu-sales-list/           │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ vat-monitor            │ extensions/export/vat-monitor/             │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ intrastat              │ extensions/export/intrastat/               │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ currency-receivables   │ extensions/export/currency-receivables/    │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ food-cost              │ extensions/restaurant/food-cost/           │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ earnings-per-liter     │ extensions/restaurant/earnings-per-liter/  │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ pos-import             │ extensions/restaurant/pos-import/          │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ tip-tracking           │ extensions/restaurant/tip-tracking/        │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ rot-calculator         │ extensions/construction/rot-calculator/    │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ project-cost           │ extensions/construction/project-cost/      │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ revpar                 │ extensions/hotel/revpar/                   │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ occupancy              │ extensions/hotel/occupancy/                │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ billable-hours         │ extensions/tech/billable-hours/            │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ project-billing        │ extensions/tech/project-billing/           │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ shopify-import         │ extensions/ecommerce/shopify-import/       │ (none)                                            │
 ├────────────────────────┼────────────────────────────────────────────┼───────────────────────────────────────────────────┤
 │ multichannel-revenue   │ extensions/ecommerce/multichannel-revenue/ │ (none)                                            │
 └────────────────────────┴────────────────────────────────────────────┴───────────────────────────────────────────────────┘

 Step 3: Build the generator script

 New file: scripts/generate-extension-registry.ts

 The generator:
 1. Reads extensions.config.json to get enabled extension IDs
 2. For each ID, finds and reads extensions/**/manifest.json matching that ID
 3. Generates 3 files under lib/extensions/_generated/:

 lib/extensions/_generated/extension-list.ts — When config has ["receipt-ocr", "ai-categorization"]:
 // AUTO-GENERATED — do not edit. Run `npm run setup:extensions` to regenerate.
 import type { Extension } from '../types'
 import { receiptOcrExtension } from '@/extensions/general/receipt-ocr'
 import { aiCategorizationExtension } from '@/extensions/general/ai-categorization'

 export const FIRST_PARTY_EXTENSIONS: Extension[] = [
   receiptOcrExtension,
   aiCategorizationExtension,
 ]

 lib/extensions/_generated/workspace-map.tsx — Dynamic import map:
 // AUTO-GENERATED — do not edit. Run `npm run setup:extensions` to regenerate.
 import dynamic from 'next/dynamic'
 import type { ComponentType } from 'react'
 import type { WorkspaceComponentProps } from '../workspace-registry'

 export const WORKSPACES: Record<string, ComponentType<WorkspaceComponentProps>> = {
   'general/receipt-ocr': dynamic(() => import('@/components/extensions/general/ReceiptOcrWorkspace')),
   'general/ai-categorization': dynamic(() => import('@/components/extensions/general/AiCategorizationWorkspace')),
 }

 lib/extensions/_generated/sector-definitions.ts — Extension metadata:
 // AUTO-GENERATED — do not edit. Run `npm run setup:extensions` to regenerate.
 import type { ExtensionDefinition } from '../types'
 export const EXTENSION_DEFINITIONS: Record<string, ExtensionDefinition[]> = {
   general: [
     { slug: 'receipt-ocr', name: 'Receipt OCR', ... },
     { slug: 'ai-categorization', name: 'AI Categorization', ... },
   ],
 }

 When config is empty ("extensions": []):
 export const FIRST_PARTY_EXTENSIONS: Extension[] = []
 export const WORKSPACES: Record<string, ComponentType<WorkspaceComponentProps>> = {}
 export const EXTENSION_DEFINITIONS: Record<string, ExtensionDefinition[]> = {}

 Generator features:
 - npm run setup:extensions — Generate + validate env vars (warn if missing)
 - npm run setup:extensions -- --list — Print all available extensions with descriptions
 - Outputs: "Enabled: receipt-ocr, ai-categorization. Warning: OPENAI_API_KEY not set (required by ai-categorization)"

 Step 4: Modify loader, workspace-registry, and sectors to use generated files

 lib/extensions/loader.ts — Replace hardcoded imports:
 import { extensionRegistry } from './registry'
 import { FIRST_PARTY_EXTENSIONS } from './_generated/extension-list'

 let loaded = false

 export function loadExtensions(): void {
   if (loaded) return
   loaded = true
   for (const extension of FIRST_PARTY_EXTENSIONS) {
     extensionRegistry.register(extension)
   }
 }

 lib/extensions/workspace-registry.tsx — Replace hardcoded map:
 import type { ComponentType } from 'react'
 import { WORKSPACES } from './_generated/workspace-map'

 export interface WorkspaceComponentProps {
   userId: string
 }

 export function getWorkspaceComponent(
   sector: string,
   slug: string
 ): ComponentType<WorkspaceComponentProps> | null {
   return WORKSPACES[`${sector}/${slug}`] ?? null
 }

 lib/extensions/sectors.ts — Replace hardcoded extension definitions:

 The sector shells (general, restaurant, construction, etc.) stay hardcoded since they are structural. The extension
 definitions per sector come from the generated file. Merge them at runtime.

 Step 5: Commit empty defaults for generated files

 These are committed so core compiles out of the box without running the generator:

 - lib/extensions/_generated/extension-list.ts → Empty FIRST_PARTY_EXTENSIONS
 - lib/extensions/_generated/workspace-map.tsx → Empty WORKSPACES
 - lib/extensions/_generated/sector-definitions.ts → Empty EXTENSION_DEFINITIONS

 Add to .gitignore a comment explaining these files are auto-generated but the defaults are committed.

 Step 6: npm scripts

 Add to package.json:
 {
   "setup:extensions": "tsx scripts/generate-extension-registry.ts",
   "prebuild": "npm run setup:extensions",
   "predev": "npm run setup:extensions"
 }

 This ensures the generated files are always up-to-date before build/dev.

 Step 7: CI regression guard

 New file: .github/workflows/core-build.yml

 name: Core Build (no extensions)
 on: [pull_request]
 jobs:
   core-only:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: actions/setup-node@v4
         with: { node-version: 20 }
       - run: npm ci
       - name: Reset extensions config
         run: echo '{"extensions":[]}' > extensions.config.json
       - run: npm run setup:extensions
       - run: npm run build
       - run: npm test
       - name: Check no core imports from extensions
         run: |
           VIOLATIONS=$(grep -r "from '@/extensions/" lib/ app/api/ components/ --include="*.ts" --include="*.tsx" \
             | grep -v "app/api/extensions/" \
             | grep -v "components/extensions/" \
             | grep -v "lib/extensions/_generated/" \
             | grep -v "lib/extensions/loader.ts" || true)
           if [ -n "$VIOLATIONS" ]; then
             echo "ERROR: Core code imports from @/extensions/:"
             echo "$VIOLATIONS"
             exit 1
           fi

 Note: After this plan, lib/extensions/loader.ts will no longer import from @/extensions/ (it imports from _generated/), so the
  exclusion for loader.ts is just a safety measure during transition.

 Verification Criteria

 1. Empty config builds: echo '{"extensions":[]}' > extensions.config.json && npm run setup:extensions && npm run build →
 succeeds
 2. Single extension works: Add "calendar" to config → npm run setup:extensions && npm run build → calendar extension available
  at /e/general/calendar
 3. Full config works: Add all 12 currently-loaded extension IDs → npm run setup:extensions && npm run build → identical to
 current behavior
 4. CI catches violations: If someone adds import { x } from '@/extensions/foo' in lib/utils.ts, the CI job fails
 5. All tests pass: npm test with both empty and full config
 6. Generator warns about missing env vars: Enable ai-categorization without OPENAI_API_KEY → warning printed, build still
 succeeds

 Critical Files

 ┌─────────────────────────────────────────────────┬────────────────────────────────────────────────────────┐
 │                      File                       │                         Action                         │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ extensions.config.json                          │ Create                                                 │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ extensions.schema.json                          │ Create                                                 │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ scripts/generate-extension-registry.ts          │ Create                                                 │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ lib/extensions/_generated/extension-list.ts     │ Create (empty default)                                 │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ lib/extensions/_generated/workspace-map.tsx     │ Create (empty default)                                 │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ lib/extensions/_generated/sector-definitions.ts │ Create (empty default)                                 │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ .github/workflows/core-build.yml                │ Create                                                 │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ lib/extensions/loader.ts                        │ Modify: import from generated file                     │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ lib/extensions/workspace-registry.tsx           │ Modify: import from generated file                     │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ lib/extensions/sectors.ts                       │ Modify: import definitions from generated file         │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ extensions/*/manifest.json (24 files)           │ Create                                                 │
 ├─────────────────────────────────────────────────┼────────────────────────────────────────────────────────┤
 │ package.json                                    │ Modify: add setup:extensions, prebuild, predev scripts │
 └─────────────────────────────────────────────────┴────────────────────────────────────────────────────────┘

 ---
 Plan B: Full Decoupling (Reference — Execute Later)

 This plan is for after Plan A is complete. Context preserved here so nothing is lost.

 Prerequisites

 Plan A complete: config system works, manifests exist, CI guard in place.

 Phase 3: Create the email extension (~1.5 days)

 Extract email from core into an extension. Core only needs Supabase.

 1. Create extensions/general/email/:
   - index.ts — Extension definition, subscribes to invoice.created, invoice.overdue
   - lib/email-service.ts — Resend integration (moved from lib/email/)
   - lib/templates/ — Invoice, reminder, notification templates
   - manifest.json — requires RESEND_API_KEY, RESEND_FROM_EMAIL
 2. Create NoopEmailAdapter in core (lib/email/service.ts):
   - Core defines EmailService interface + no-op default
   - Email extension registers real implementation via services pattern on the registry
   - Invoice flows check if email service is available; if not, skip sending (no crash)
 3. Event-driven: Core emits invoice.created, invoice.overdue. Email extension subscribes, sends emails. If not loaded, events
 fire but nothing sends.
 4. Move cron: /api/invoices/reminders/cron becomes a thin proxy or moves into email extension's apiRoutes.

 Current email files to move:
 - lib/email/ → Review what's here, extract Resend-specific code into extension
 - Invoice template generation stays in core (PDF generation), email delivery moves to extension

 Phase 4: Move extension API routes into extensions (~5-7 days)

 Move handler logic from app/api/extensions/<name>/ route files into each extension's apiRoutes array. The catch-all at
 app/api/extensions/ext/[...path]/route.ts dispatches.

 Frontend URL change: /api/extensions/<name>/<action> → /api/extensions/ext/<name>/<action>

 Routes to convert (move handler into extension apiRoutes):
 - ai-categorization/suggestions/, ai-categorization/settings/
 - ai-chat/, ai-chat/stream/, ai-chat/sessions/
 - invoice-inbox/inbox/, invoice-inbox/inbox/[id]/*, invoice-inbox/settings/
 - receipt-ocr/upload/, receipt-ocr/[id]/*, receipt-ocr/settings/, receipt-ocr/queue/
 - push-notifications/subscribe/, push-notifications/settings/
 - All export/* routes

 Thin proxy routes (external callbacks / cron — keep but make extension-agnostic):
 - invoice-inbox/webhook/ — Resend webhook: delegates to extensionRegistry.get('invoice-inbox')?.apiRoutes
 - enable-banking/callback/ — PSD2 OAuth: delegates to registry
 - enable-banking/sync/cron/ — Vercel cron: delegates to registry
 - push-notifications/cron/ — Vercel cron: delegates to registry

 Keep as-is (core framework):
 - toggles/, [sector]/[slug]/data/, [sector]/[slug]/settings/, ext/[...path]/

 Delete all other dedicated routes after moving logic.

 Phase 5: Move template-embeddings.ts out of core (~1 day)

 lib/bookkeeping/template-embeddings.ts imports @langchain/openai.

 1. Move to extensions/general/ai-categorization/lib/template-embeddings.ts
 2. Add services field to Extension interface (lib/extensions/types.ts):
 services?: Record<string, (...args: unknown[]) => Promise<unknown>>
 3. ai-categorization registers: services: { findSimilarTemplates: ... }
 4. app/api/transactions/suggest-categories/route.ts uses registry:
 const aiExt = extensionRegistry.get('ai-categorization')
 const templateSuggestions = aiExt?.services?.findSimilarTemplates
   ? await aiExt.services.findSimilarTemplates(transaction, entityType)
   : []
 // Rule-based suggestions from mapping-engine.ts always available

 Phase 6: Merge SRU export and NE-bilaga into core (~1 day)

 Tax compliance features, no external deps, always available:
 - Move extensions/sru-export/ → lib/reports/sru-export/
 - Move extensions/ne-bilaga/ → lib/reports/ne-bilaga/
 - Move workspace components → components/reports/
 - Move API routes → app/api/reports/sru-export/, app/api/reports/ne-bilaga/
 - Remove from extension system (no manifest, not in loader)

 Phase 7: Cross-extension dependency cleanup (~0.5 days)

 invoice-inbox imports processReceiptFromDocument from receipt-ocr.

 Use services pattern:
 - receipt-ocr registers: services: { processReceiptFromDocument }
 - invoice-inbox calls: extensionRegistry.get('receipt-ocr')?.services?.processReceiptFromDocument(...)
 - Gracefully skips if receipt-ocr not enabled

 Phase 8: Documentation (~1 day)

 1. README.md: Self-hosting guide — core setup (just Supabase), extension opt-in
 2. EXTENSIONS.md: Extension interface, events, context API, how to build extensions
 3. scripts/create-extension.ts: Scaffolds new extension (manifest, index.ts, types, workspace)

 Plan B Effort Summary

 ┌──────────────────────────────────┬─────────────┐
 │              Phase               │   Effort    │
 ├──────────────────────────────────┼─────────────┤
 │ Phase 3: Email extension         │ 1.5 days    │
 ├──────────────────────────────────┼─────────────┤
 │ Phase 4: API route migration     │ 5-7 days    │
 ├──────────────────────────────────┼─────────────┤
 │ Phase 5: Template-embeddings     │ 1 day       │
 ├──────────────────────────────────┼─────────────┤
 │ Phase 6: SRU/NE-bilaga merge     │ 1 day       │
 ├──────────────────────────────────┼─────────────┤
 │ Phase 7: Cross-extension cleanup │ 0.5 days    │
 ├──────────────────────────────────┼─────────────┤
 │ Phase 8: Documentation           │ 1 day       │
 ├──────────────────────────────────┼─────────────┤
 │ Total                            │ ~10-12 days │
 └──────────────────────────────────┴─────────────┘

 Environment Variable Reference

 Core (required):
 - NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
 - NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anonymous key
 - SUPABASE_SERVICE_ROLE_KEY — Supabase service role key
 - NEXT_PUBLIC_APP_URL — App base URL
 - CRON_SECRET — Auth for core cron jobs (deadlines, tax deadlines, document verification)

 Extension env vars:

 ┌────────────────────────┬───────────────────────────────────────────────────┬────────────────────────┐
 │       Extension        │                     Required                      │        Optional        │
 ├────────────────────────┼───────────────────────────────────────────────────┼────────────────────────┤
 │ email                  │ RESEND_API_KEY, RESEND_FROM_EMAIL                 │ RESEND_WEBHOOK_SECRET  │
 ├────────────────────────┼───────────────────────────────────────────────────┼────────────────────────┤
 │ receipt-ocr            │ ANTHROPIC_API_KEY                                 │                        │
 ├────────────────────────┼───────────────────────────────────────────────────┼────────────────────────┤
 │ ai-categorization      │ ANTHROPIC_API_KEY, OPENAI_API_KEY                 │                        │
 ├────────────────────────┼───────────────────────────────────────────────────┼────────────────────────┤
 │ ai-chat                │ ANTHROPIC_API_KEY, OPENAI_API_KEY                 │                        │
 ├────────────────────────┼───────────────────────────────────────────────────┼────────────────────────┤
 │ invoice-inbox          │ ANTHROPIC_API_KEY                                 │                        │
 ├────────────────────────┼───────────────────────────────────────────────────┼────────────────────────┤
 │ enable-banking         │ ENABLE_BANKING_APP_ID, ENABLE_BANKING_PRIVATE_KEY │ ENABLE_BANKING_SANDBOX │
 ├────────────────────────┼───────────────────────────────────────────────────┼────────────────────────┤
 │ push-notifications     │ VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY   │ VAPID_SUBJECT          │
 ├────────────────────────┼───────────────────────────────────────────────────┼────────────────────────┤
 │ calendar               │ (none)                                            │                        │
 ├────────────────────────┼───────────────────────────────────────────────────┼────────────────────────┤
 │ All export extensions  │ (none)                                            │                        │
 ├────────────────────────┼───────────────────────────────────────────────────┼────────────────────────┤
 │ All sector extensions  │ (none)                                            │                        │
 └────────────────────────┴───────────────────────────────────────────────────┴────────────────────────┘

 Key Architectural Decisions

 1. Config is JSON — No TypeScript in config. Generator reads it without a compiler. CI validates trivially.
 2. Core never imports from @/extensions/ — Enforced by CI. The only bridge is the generated _generated/ files.
 3. Extensions communicate via events and services — Event bus for async reactions, services record for synchronous
 capabilities.
 4. Extension tables stay in shared DB — Empty when extension isn't enabled. RLS prevents access issues. No migration splitting
  needed.
 5. CRON_SECRET is core — 3 core cron jobs need it (deadlines, tax deadlines, document verification).
 6. Email is an extension — Core works without email. Invoices can be created/downloaded but not sent.