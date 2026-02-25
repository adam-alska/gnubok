/**
 * Re-export from core. EU country data now lives in lib/vat/eu-countries.ts.
 * This file exists for backward compatibility with export extensions.
 */
export {
  type EUCountry,
  EU_COUNTRIES,
  EU_COUNTRY_CODES_EXCL_SE,
  EU_COUNTRY_CODES,
  isEUCountry,
  isEUCountryIncludingSE,
  getEUCountry,
  getVatPrefix,
  toCountryCode,
} from '@/lib/vat/eu-countries'
