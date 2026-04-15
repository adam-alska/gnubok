import type { SupabaseClient } from '@supabase/supabase-js'
import { skvRequest } from './api-client'
import type { SkatteverketAGIInlamning, SkatteverketAGIKontrollresultat } from '../types'

/**
 * Skatteverket AGI (Arbetsgivardeklaration) API client.
 *
 * Follows the same pattern as the Momsdeklaration API:
 *   kontrollera → utkast → lås → (BankID signering) → inlämnat
 *
 * Base URL: https://api.skatteverket.se/arbetsgivardeklaration/inlamning/v1
 *
 * Endpoint pattern:
 *   /arbetsgivare/{arbetsgivarregistrerad}/redovisningsperioder/{redovisningsperiod}/...
 */

const DEFAULT_AGI_API_BASE_URL =
  'https://api.test.skatteverket.se/arbetsgivardeklaration/inlamning/v1'

function getAgiApiBaseUrl(): string {
  return process.env.SKATTEVERKET_AGI_API_BASE_URL || DEFAULT_AGI_API_BASE_URL
}

function basePath(arbetsgivare: string, period: string): string {
  return `/arbetsgivare/${arbetsgivare}/redovisningsperioder/${period}`
}

/**
 * Validate AGI data (dry run) without saving.
 * Returns validation errors/warnings.
 */
export async function agiValidate(
  supabase: SupabaseClient,
  userId: string,
  arbetsgivare: string,
  period: string,
  payload: SkatteverketAGIInlamning
): Promise<{ ok: boolean; status: number; data?: SkatteverketAGIKontrollresultat; error?: string }> {
  const response = await skvRequest(
    supabase,
    userId,
    'POST',
    `${basePath(arbetsgivare, period)}/kontrollera`,
    payload,
    { baseUrl: getAgiApiBaseUrl() }
  )

  if (!response.ok) {
    const text = await response.text()
    return { ok: false, status: response.status, error: text }
  }

  const data = await response.json()
  return { ok: true, status: response.status, data }
}

/**
 * Save AGI as draft to Skatteverket's "Eget utrymme".
 * Returns kontrollresultat and inlämningsId.
 */
export async function agiSaveDraft(
  supabase: SupabaseClient,
  userId: string,
  arbetsgivare: string,
  period: string,
  payload: SkatteverketAGIInlamning
): Promise<{ ok: boolean; status: number; data?: { inlamningId?: string; kontrollresultat?: SkatteverketAGIKontrollresultat }; error?: string }> {
  const response = await skvRequest(
    supabase,
    userId,
    'POST',
    `${basePath(arbetsgivare, period)}/inlamningar`,
    payload,
    { baseUrl: getAgiApiBaseUrl() }
  )

  if (!response.ok) {
    const text = await response.text()
    return { ok: false, status: response.status, error: text }
  }

  const data = await response.json()
  return { ok: true, status: response.status, data }
}

/**
 * Get a specific AGI submission.
 */
export async function agiGetSubmission(
  supabase: SupabaseClient,
  userId: string,
  arbetsgivare: string,
  period: string,
  inlamningId: string
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  const response = await skvRequest(
    supabase,
    userId,
    'GET',
    `${basePath(arbetsgivare, period)}/inlamningar/${inlamningId}`,
    undefined,
    { baseUrl: getAgiApiBaseUrl() }
  )

  if (response.status === 404) {
    return { ok: true, status: 404, data: null }
  }

  if (!response.ok) {
    const text = await response.text()
    return { ok: false, status: response.status, error: text }
  }

  const data = await response.json()
  return { ok: true, status: response.status, data }
}

/**
 * Delete a draft AGI submission.
 */
export async function agiDeleteDraft(
  supabase: SupabaseClient,
  userId: string,
  arbetsgivare: string,
  period: string,
  inlamningId: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  const response = await skvRequest(
    supabase,
    userId,
    'DELETE',
    `${basePath(arbetsgivare, period)}/inlamningar/${inlamningId}`,
    undefined,
    { baseUrl: getAgiApiBaseUrl() }
  )

  if (response.status !== 204 && !response.ok) {
    const text = await response.text()
    return { ok: false, status: response.status, error: text }
  }

  return { ok: true, status: response.status }
}

/**
 * Lock the reporting period for signing.
 * Returns a signeringslänk for BankID signing on Skatteverket's site.
 */
export async function agiLockPeriod(
  supabase: SupabaseClient,
  userId: string,
  arbetsgivare: string,
  period: string
): Promise<{ ok: boolean; status: number; data?: { signeringslank?: string }; error?: string }> {
  const response = await skvRequest(
    supabase,
    userId,
    'PUT',
    `${basePath(arbetsgivare, period)}/las`,
    undefined,
    { baseUrl: getAgiApiBaseUrl() }
  )

  if (!response.ok) {
    const text = await response.text()
    return { ok: false, status: response.status, error: text }
  }

  const data = await response.json()
  return { ok: true, status: response.status, data }
}

/**
 * Unlock a locked reporting period (cancel signing).
 */
export async function agiUnlockPeriod(
  supabase: SupabaseClient,
  userId: string,
  arbetsgivare: string,
  period: string
): Promise<{ ok: boolean; status: number; error?: string }> {
  const response = await skvRequest(
    supabase,
    userId,
    'DELETE',
    `${basePath(arbetsgivare, period)}/las`,
    undefined,
    { baseUrl: getAgiApiBaseUrl() }
  )

  if (response.status !== 204 && !response.ok) {
    const text = await response.text()
    return { ok: false, status: response.status, error: text }
  }

  return { ok: true, status: response.status }
}

/**
 * Fetch submitted AGI (after signing).
 * Returns kvittensnummer and submission timestamp.
 */
export async function agiGetSubmitted(
  supabase: SupabaseClient,
  userId: string,
  arbetsgivare: string,
  period: string
): Promise<{ ok: boolean; status: number; data?: { kvittensnummer?: string; tidpunkt?: string; signerare?: string } | null; error?: string }> {
  const response = await skvRequest(
    supabase,
    userId,
    'GET',
    `${basePath(arbetsgivare, period)}/inlamnat`,
    undefined,
    { baseUrl: getAgiApiBaseUrl() }
  )

  if (response.status === 404) {
    return { ok: true, status: 404, data: null }
  }

  if (!response.ok) {
    const text = await response.text()
    return { ok: false, status: response.status, error: text }
  }

  const data = await response.json()
  return { ok: true, status: response.status, data }
}
