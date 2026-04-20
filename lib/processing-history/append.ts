/**
 * Processing history (behandlingshistorik) — append helper.
 *
 * Appends events to the processing_history table within the caller's
 * database transaction. Throws on failure so that the table writes
 * and the audit trail are atomically consistent.
 *
 * PII BOUNDARY: payload MUST contain pseudonymous IDs only (user UUIDs,
 * company UUIDs, counterparty IDs). Never names, emails, personnummer,
 * addresses, or phone numbers. These live in their source tables (profiles,
 * customers, suppliers) and are referenced by ID. GDPR erasure pseudonymizes
 * the source tables; processing_history events become undecipherable by
 * reference, which is the required behavior per v0.2 §10.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ProcessingHistoryAggregateType,
  ProcessingHistoryActor,
} from '@/types'
import { z } from 'zod'

// ── PII validator ───────────────────────────────────────────────
// Rejects payloads containing Swedish personal identity numbers.
// Personnummer:       YYMMDD-NNNN or YYMMDDNNNN (6+4 digits)
// Samordningsnummer:  Same format but day +60
// Organisationsnummer: NNNNNN-NNNN (10 digits, but we catch the pattern)

// Word boundaries prevent false positives on Bankgiro (123456-7890) and
// invoice references like 202312-1234 that share the digit shape but aren't PII.
const PII_PATTERNS = [
  /\b\d{6}-?\d{4}\b/,   // personnummer, samordningsnummer
  /\b\d{8}-?\d{4}\b/,   // 12-digit variant (YYYYMMDD-NNNN) or orgnr
]

function containsPii(value: unknown): boolean {
  if (typeof value === 'string') {
    return PII_PATTERNS.some(pattern => pattern.test(value))
  }
  if (Array.isArray(value)) {
    return value.some(containsPii)
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value).some(containsPii)
  }
  return false
}

const piiSafePayload = z.record(z.string(), z.unknown()).refine(
  (payload) => !containsPii(payload),
  { message: 'Payload contains PII (personnummer/samordningsnummer/orgnr pattern). Use pseudonymous IDs only.' }
)

function assertActorPiiSafe(actor: ProcessingHistoryActor): void {
  if (actor.label && PII_PATTERNS.some(p => p.test(actor.label!))) {
    throw new Error(
      'actor.label contains PII (personnummer/samordningsnummer/orgnr pattern). Use a pseudonymous descriptor only.'
    )
  }
}

// ── Input type ──────────────────────────────────────────────────

export interface AppendEventInput {
  companyId: string
  correlationId: string
  causationId?: string
  aggregateType: ProcessingHistoryAggregateType
  aggregateId: string
  eventType: string
  payload: Record<string, unknown>
  payloadSchemaVersion?: number
  actor: ProcessingHistoryActor
  rubricVersion?: string
  occurredAt: Date  // mandatory — no default. Caller must set explicitly.
}

// ── Append functions ────────────────────────────────────────────

/**
 * Append a single event to processing_history within the caller's transaction.
 *
 * Uses the provided SupabaseClient (which should be the same client used for
 * table writes in the command handler). Throws on failure so that both the
 * table writes and the audit trail roll back together.
 *
 * Returns the generated event_id (pre-generated client-side for causation chaining).
 */
export async function appendProcessingHistory(
  supabase: SupabaseClient,
  input: AppendEventInput
): Promise<string> {
  // Validate payload + actor.label contain no PII
  piiSafePayload.parse(input.payload)
  assertActorPiiSafe(input.actor)

  const eventId = crypto.randomUUID()

  const { error } = await supabase
    .from('processing_history')
    .insert({
      event_id: eventId,
      company_id: input.companyId,
      correlation_id: input.correlationId,
      causation_id: input.causationId ?? null,
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      event_type: input.eventType,
      payload: input.payload,
      payload_schema_version: input.payloadSchemaVersion ?? 1,
      actor: input.actor,
      rubric_version: input.rubricVersion ?? null,
      occurred_at: input.occurredAt.toISOString(),
    })

  if (error) {
    throw new Error(
      `Failed to append processing_history event ${input.eventType}: ${error.message}`
    )
  }

  return eventId
}

/**
 * Append multiple events atomically within the caller's transaction.
 * Used for batch operations (e.g., migration commits, multi-event command handlers).
 *
 * Returns array of generated event_ids in input order.
 */
export async function appendProcessingHistoryBatch(
  supabase: SupabaseClient,
  inputs: AppendEventInput[]
): Promise<string[]> {
  if (inputs.length === 0) return []

  const eventIds = inputs.map(() => crypto.randomUUID())

  // Validate all payloads + actor labels before any DB write
  for (const input of inputs) {
    piiSafePayload.parse(input.payload)
    assertActorPiiSafe(input.actor)
  }

  const rows = inputs.map((input, i) => ({
    event_id: eventIds[i],
    company_id: input.companyId,
    correlation_id: input.correlationId,
    causation_id: input.causationId ?? null,
    aggregate_type: input.aggregateType,
    aggregate_id: input.aggregateId,
    event_type: input.eventType,
    payload: input.payload,
    payload_schema_version: input.payloadSchemaVersion ?? 1,
    actor: input.actor,
    rubric_version: input.rubricVersion ?? null,
    occurred_at: input.occurredAt.toISOString(),
  }))

  const { error } = await supabase
    .from('processing_history')
    .insert(rows)

  if (error) {
    throw new Error(
      `Failed to append processing_history batch (${inputs.length} events): ${error.message}`
    )
  }

  return eventIds
}
