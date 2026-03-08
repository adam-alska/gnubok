/**
 * MFA (Multi-Factor Authentication) helpers.
 *
 * MFA is only required on the hosted version, never for self-hosted deployments.
 * Enforcement is application-side (middleware + API routes), not RLS.
 */

export function isMfaRequired(): boolean {
  if (process.env.NEXT_PUBLIC_SELF_HOSTED === 'true') return false
  return process.env.NEXT_PUBLIC_REQUIRE_MFA === 'true'
}
