/**
 * Maps raw AWS Bedrock / infrastructure errors to Swedish user-facing sentences
 * for the invoice-inbox error_message column. We keep this local to the
 * extension rather than in lib/errors so the patterns can evolve with the
 * Bedrock SDK without churning the shared helper.
 */

const PATTERNS: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [
    /image exceeds 5 MB maximum: (\d+) bytes/i,
    (m) => {
      const mb = (Number(m[1]) / 1024 / 1024).toFixed(1)
      return `Bilden är för stor för AI-tolkning (${mb} MB, max 5 MB). Skicka ett mindre foto eller en PDF.`
    },
  ],
  [
    /image exceeds .+ maximum/i,
    () => 'Bilden är för stor för AI-tolkning. Skicka ett mindre foto eller en PDF.',
  ],
  [/ThrottlingException|TooManyRequestsException|Rate exceeded/i, () => 'AI-tjänsten är överbelastad just nu. Försök igen om en stund.'],
  [/AccessDeniedException/i, () => 'Åtkomst till AI-tjänsten nekades. Kontakta support.'],
  [/ValidationException.+modelId/i, () => 'AI-modellen är felkonfigurerad. Kontakta support.'],
  [/InternalServerException|ServiceUnavailable/i, () => 'AI-tjänsten är tillfälligt otillgänglig. Försök igen om en stund.'],
  [/Unsupported MIME type: (.+)/i, (m) => `Filformatet stöds inte (${m[1]}). Använd PDF, JPEG, PNG, HEIC eller WebP.`],
  [/No content in Bedrock response|No tool use result in Bedrock response/i, () => 'AI-tjänsten svarade inte med strukturerad data. Försök igen.'],
  [/Failed to fetch received email/i, () => 'Kunde inte hämta e-postmeddelandet från inkorgstjänsten. Försök igen.'],
  [/Failed to fetch attachment|Download URL returned/i, () => 'Kunde inte ladda ner bilagan från inkorgstjänsten.'],
]

export function toSwedishInboxError(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : 'Okänt fel'

  for (const [pattern, build] of PATTERNS) {
    const match = message.match(pattern)
    if (match) return build(match)
  }

  // Preserve any message that's already Swedish (heuristic: contains å/ä/ö
  // or a known Swedish word). Otherwise surface a generic fallback and log
  // the technical detail through stderr rather than the user's screen.
  if (/[åäö]|bild|faktura|inkorg|leverant/i.test(message)) {
    return message
  }
  return 'Kunde inte bearbeta dokumentet. Försök igen eller kontakta support.'
}
