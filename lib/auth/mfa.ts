/**
 * MFA (Multi-Factor Authentication) helpers.
 *
 * MFA is only required on the hosted version, never for self-hosted deployments.
 * Enforcement is application-side (middleware + API routes), not RLS.
 *
 * BankID-linked users skip TOTP entirely — BankID is inherently 2FA.
 */

export function isMfaRequired(): boolean {
  if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') return false
  return process.env.NEXT_PUBLIC_REQUIRE_MFA === 'true'
}

/**
 * Check whether TOTP MFA should be enforced for a specific user.
 * Returns false for BankID-linked users (BankID is inherently 2FA).
 * `app_metadata.bankid_linked` is set server-side when BankID is linked
 * and is embedded in the JWT — no extra DB query needed.
 */
export function shouldEnforceMfa(user: { app_metadata?: Record<string, unknown> }): boolean {
  if (!isMfaRequired()) return false
  if (user.app_metadata?.bankid_linked) return false
  return true
}
