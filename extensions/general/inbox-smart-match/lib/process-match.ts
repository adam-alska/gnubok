/**
 * Core matching flow — deterministic narrowing + LLM call + persistence +
 * processing_history audit events. Called from both the classify handler and
 * the transaction-sync retroactive handler.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { InvoiceInboxItem, ReceiptExtractionResult } from '@/types'
import { appendProcessingHistory } from '@/lib/processing-history/append'
import { fetchCandidateTransactions } from './fetch-candidates'
import { matchReceiptToCandidate } from './match-receipt'

export interface MatchContext {
  supabase: SupabaseClient
  companyId: string
  userId: string
  extensionId: string
  triggerReason: 'classified' | 'transaction_synced'
}

export interface MatchOutcome {
  status: 'matched' | 'no_match' | 'pending_transaction' | 'skipped'
  transactionId: string | null
  confidence: number
  reasoning: string
}

/**
 * Process a single classified-receipt inbox item through the matcher pipeline.
 * Writes match fields + appends processing_history. Swallows internal errors
 * so one failing receipt doesn't break the whole event handler.
 */
export async function processInboxItemMatch(
  ctx: MatchContext,
  item: InvoiceInboxItem
): Promise<MatchOutcome> {
  const tag = `[inbox-smart-match] item=${item.id} trigger=${ctx.triggerReason}`

  // We only operate on receipts for v1
  if (item.document_type !== 'receipt') {
    return { status: 'skipped', transactionId: null, confidence: 0, reasoning: '' }
  }
  if (item.status !== 'ready') {
    return { status: 'skipped', transactionId: null, confidence: 0, reasoning: '' }
  }
  if (!item.extracted_data) {
    return { status: 'skipped', transactionId: null, confidence: 0, reasoning: '' }
  }

  const correlationId = item.correlation_id ?? crypto.randomUUID()

  // If we just minted a fresh correlation_id (legacy row predating the column),
  // persist it so retries reuse the same thread through processing_history.
  if (!item.correlation_id) {
    const { error: corrError } = await ctx.supabase
      .from('invoice_inbox_items')
      .update({ correlation_id: correlationId })
      .eq('id', item.id)
    if (corrError) {
      console.error(`${tag} — failed to persist correlation_id:`, corrError)
      // non-fatal — we still proceed with matching under the in-memory ID
    }
  }

  const extracted = item.extracted_data as unknown as ReceiptExtractionResult
  const candidates = await fetchCandidateTransactions(ctx.supabase, ctx.companyId, extracted)

  // Append DeterministicMatch event — records that the narrowing ran
  let deterministicEventId: string
  try {
    deterministicEventId = await appendProcessingHistory(ctx.supabase, {
      companyId: ctx.companyId,
      correlationId,
      aggregateType: 'MatchProposal',
      aggregateId: item.id,
      eventType: 'MatchAttemptedDeterministic',
      payload: {
        inbox_item_id: item.id,
        candidate_count: candidates.length,
        candidate_ids: candidates.map((c) => c.id),
        window_days: 7,
        trigger: ctx.triggerReason,
      },
      actor: { type: 'system', id: ctx.extensionId },
      occurredAt: new Date(),
    })
  } catch (err) {
    console.error(`${tag} — failed to append MatchAttemptedDeterministic:`, err)
    return { status: 'no_match', transactionId: null, confidence: 0, reasoning: '' }
  }

  // No candidates → mark pending, wait for bank sync
  if (candidates.length === 0) {
    await ctx.supabase
      .from('invoice_inbox_items')
      .update({
        match_method: 'pending_transaction',
        match_confidence: null,
        matched_transaction_id: null,
        match_reasoning: 'Inväntar matchande banktransaktion',
      })
      .eq('id', item.id)

    return {
      status: 'pending_transaction',
      transactionId: null,
      confidence: 0,
      reasoning: 'Inväntar matchande banktransaktion',
    }
  }

  // LLM chooses among candidates
  let llm
  try {
    llm = await matchReceiptToCandidate({ extracted, candidates })
  } catch (err) {
    console.error(`${tag} — LLM matcher failed:`, err)
    // Don't overwrite existing state on LLM failure; just log and exit
    return { status: 'no_match', transactionId: null, confidence: 0, reasoning: '' }
  }

  // Record the LLM attempt in processing_history
  try {
    await appendProcessingHistory(ctx.supabase, {
      companyId: ctx.companyId,
      correlationId,
      causationId: deterministicEventId,
      aggregateType: 'MatchProposal',
      aggregateId: item.id,
      eventType: 'MatchAttemptedLlm',
      payload: {
        inbox_item_id: item.id,
        matched: llm.matched,
        chosen_transaction_id: llm.transactionId,
        confidence: llm.confidence,
        llm_input_tokens: llm.usage.inputTokens,
        llm_output_tokens: llm.usage.outputTokens,
        candidate_count: candidates.length,
      },
      actor: { type: 'llm', id: 'match_receipt' },
      occurredAt: new Date(),
    })
  } catch (err) {
    console.error(`${tag} — failed to append MatchAttemptedLlm:`, err)
  }

  // Persist match. The (company_id, matched_transaction_id) partial unique
  // index means a concurrent second inbox item trying to claim the same
  // transaction will get a 23505 — we catch that and downgrade this one
  // to pending_transaction instead of overwriting the winner.
  if (llm.matched && llm.transactionId) {
    const { error: updateError } = await ctx.supabase
      .from('invoice_inbox_items')
      .update({
        matched_transaction_id: llm.transactionId,
        match_confidence: llm.confidence,
        match_method: 'llm',
        match_reasoning: llm.reasoning,
      })
      .eq('id', item.id)

    if (updateError) {
      const code = (updateError as { code?: string }).code
      if (code === '23505') {
        // Another receipt won the race for this transaction.
        await ctx.supabase
          .from('invoice_inbox_items')
          .update({
            matched_transaction_id: null,
            match_method: 'pending_transaction',
            match_confidence: null,
            match_reasoning: 'Transaktionen matchades först till ett annat kvitto',
          })
          .eq('id', item.id)

        return {
          status: 'pending_transaction',
          transactionId: null,
          confidence: 0,
          reasoning: 'Transaktionen matchades först till ett annat kvitto',
        }
      }
      console.error(`${tag} — failed to persist match:`, updateError)
      return { status: 'no_match', transactionId: null, confidence: 0, reasoning: '' }
    }

    return {
      status: 'matched',
      transactionId: llm.transactionId,
      confidence: llm.confidence,
      reasoning: llm.reasoning,
    }
  }

  // LLM said no match among the candidates — record explanatory reasoning
  await ctx.supabase
    .from('invoice_inbox_items')
    .update({
      matched_transaction_id: null,
      match_confidence: llm.confidence,
      match_method: 'pending_transaction',
      match_reasoning: llm.reasoning || 'AI kunde inte hitta matchande transaktion bland kandidaterna',
    })
    .eq('id', item.id)

  return {
    status: 'no_match',
    transactionId: null,
    confidence: llm.confidence,
    reasoning: llm.reasoning,
  }
}
