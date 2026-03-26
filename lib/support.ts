/**
 * Support recipient — server-side only.
 * Used by the /api/support/contact route. Never exposed to the client.
 */
export const SUPPORT_RECIPIENT_EMAIL = process.env.SUPPORT_RECIPIENT_EMAIL || 'support@gnubok.se'
