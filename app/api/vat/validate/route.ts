import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validateBody, VatValidateInputSchema } from '@/lib/validation'
import { apiLimiter, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Validate EU VAT number using VIES (VAT Information Exchange System)
 *
 * The EU provides a SOAP-based API, but we'll use a REST wrapper
 * In production, you might want to use the official SOAP API or a dedicated service
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { success, remaining, reset } = apiLimiter.check(user.id)
  if (!success) return rateLimitResponse(reset)

  const raw = await request.json()
  const validation = validateBody(VatValidateInputSchema, raw)
  if (!validation.success) return validation.response
  const { vat_number, customer_id } = validation.data

  // Extract country code and number
  const countryCode = vat_number.substring(0, 2).toUpperCase()
  const vatNumber = vat_number.substring(2).replace(/\s/g, '')

  try {
    // Use the EU VIES validation API
    // Note: In production, you should use the official SOAP API or a reliable service
    const response = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${countryCode}/vat/${vatNumber}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      // If VIES is unavailable, return a soft error
      return NextResponse.json({
        valid: false,
        error: 'VAT validation service unavailable. Please try again later.',
      })
    }

    const data = await response.json()

    const isValid = data.isValid === true

    // Update customer if customer_id provided
    if (customer_id && isValid) {
      await supabase
        .from('customers')
        .update({
          vat_number: vat_number.toUpperCase(),
          vat_number_validated: true,
          vat_number_validated_at: new Date().toISOString(),
        })
        .eq('id', customer_id)
        .eq('user_id', user.id)
    }

    return NextResponse.json({
      valid: isValid,
      name: data.name || null,
      address: data.address || null,
      country_code: countryCode,
      vat_number: vat_number.toUpperCase(),
    })
  } catch (error) {
    console.error('VAT validation error:', error)

    // Fallback: basic format validation
    const isValidFormat = validateVatNumberFormat(countryCode, vatNumber)

    return NextResponse.json({
      valid: false,
      error: 'Could not verify VAT number. Service temporarily unavailable.',
      format_valid: isValidFormat,
    })
  }
}

/**
 * Basic VAT number format validation by country
 */
function validateVatNumberFormat(countryCode: string, vatNumber: string): boolean {
  const patterns: Record<string, RegExp> = {
    AT: /^U\d{8}$/,
    BE: /^0\d{9}$/,
    BG: /^\d{9,10}$/,
    CY: /^\d{8}[A-Z]$/,
    CZ: /^\d{8,10}$/,
    DE: /^\d{9}$/,
    DK: /^\d{8}$/,
    EE: /^\d{9}$/,
    EL: /^\d{9}$/, // Greece
    ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
    FI: /^\d{8}$/,
    FR: /^[A-Z0-9]{2}\d{9}$/,
    HR: /^\d{11}$/,
    HU: /^\d{8}$/,
    IE: /^[0-9A-Z]{8,9}$/,
    IT: /^\d{11}$/,
    LT: /^\d{9,12}$/,
    LU: /^\d{8}$/,
    LV: /^\d{11}$/,
    MT: /^\d{8}$/,
    NL: /^\d{9}B\d{2}$/,
    PL: /^\d{10}$/,
    PT: /^\d{9}$/,
    RO: /^\d{2,10}$/,
    SE: /^\d{12}$/,
    SI: /^\d{8}$/,
    SK: /^\d{10}$/,
  }

  const pattern = patterns[countryCode]
  if (!pattern) {
    return false
  }

  return pattern.test(vatNumber)
}
