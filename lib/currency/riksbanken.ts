import type { Currency, ExchangeRate } from '@/types'
import { logger } from '@/lib/logger'

// --- TTL Cache for exchange rates ---
interface CachedRate {
  rate: ExchangeRate
  fetchedAt: number
}

const rateCache = new Map<string, CachedRate>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Get a cached exchange rate if still valid, or null if expired/missing.
 */
function getCachedRate(cacheKey: string): ExchangeRate | null {
  const cached = rateCache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.rate
  }
  return null
}

/**
 * Store an exchange rate in the cache.
 */
function setCachedRate(cacheKey: string, rate: ExchangeRate): void {
  rateCache.set(cacheKey, { rate, fetchedAt: Date.now() })
}

/**
 * Fetch exchange rates from Riksbanken API
 * Uses their public API for daily exchange rates.
 * Results are cached for 24 hours per currency+date combination.
 */
export async function fetchExchangeRate(
  currency: Currency,
  date?: Date
): Promise<ExchangeRate | null> {
  if (currency === 'SEK') {
    return {
      currency: 'SEK',
      rate: 1,
      date: new Date().toISOString().split('T')[0],
    }
  }

  const targetDate = date || new Date()
  const formattedDate = targetDate.toISOString().split('T')[0]

  // Check cache first
  const cacheKey = `${currency}_${formattedDate}`
  const cached = getCachedRate(cacheKey)
  if (cached) {
    logger.debug('riksbanken', 'Returning cached exchange rate', { currency, date: formattedDate })
    return cached
  }

  // Riksbanken uses specific series IDs for each currency
  const seriesIds: Record<Currency, string> = {
    SEK: '',
    EUR: 'SEKEURPMI',
    USD: 'SEKUSDPMI',
    GBP: 'SEKGBPPMI',
    NOK: 'SEKNOKPMI',
    DKK: 'SEKDKKPMI',
  }

  const seriesId = seriesIds[currency]
  if (!seriesId) {
    logger.error('riksbanken', `Unknown currency: ${currency}`)
    return null
  }

  try {
    // Riksbanken's public API endpoint
    const url = `https://api.riksbank.se/swea/v1/Observations/${seriesId}/${formattedDate}/${formattedDate}`

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    })

    if (!response.ok) {
      // If no rate for the specific date, try getting the latest available
      const fallbackUrl = `https://api.riksbank.se/swea/v1/Observations/${seriesId}`
      const fallbackResponse = await fetch(fallbackUrl, {
        headers: {
          Accept: 'application/json',
        },
        next: { revalidate: 3600 },
      })

      if (!fallbackResponse.ok) {
        throw new Error(`Failed to fetch exchange rate: ${fallbackResponse.status}`)
      }

      const fallbackData = await fallbackResponse.json()
      if (fallbackData && fallbackData.length > 0) {
        const latest = fallbackData[fallbackData.length - 1]
        const result: ExchangeRate = {
          currency,
          rate: parseFloat(latest.value),
          date: latest.date,
        }
        setCachedRate(cacheKey, result)
        return result
      }

      return null
    }

    const data = await response.json()
    if (data && data.length > 0) {
      const result: ExchangeRate = {
        currency,
        rate: parseFloat(data[0].value),
        date: data[0].date,
      }
      setCachedRate(cacheKey, result)
      return result
    }

    return null
  } catch (error) {
    logger.error('riksbanken', 'Error fetching exchange rate', { currency, error: error instanceof Error ? error.message : String(error) })
    // Return fallback rates for development/testing
    const fallback = getFallbackRate(currency)
    setCachedRate(cacheKey, fallback)
    return fallback
  }
}

/**
 * Fallback exchange rates for when API is unavailable
 * These should be updated periodically
 */
function getFallbackRate(currency: Currency): ExchangeRate {
  const fallbackRates: Record<Currency, number> = {
    SEK: 1,
    EUR: 11.5, // ~11.5 SEK per EUR
    USD: 10.5, // ~10.5 SEK per USD
    GBP: 13.5, // ~13.5 SEK per GBP
    NOK: 1.0, // ~1 SEK per NOK
    DKK: 1.55, // ~1.55 SEK per DKK
  }

  return {
    currency,
    rate: fallbackRates[currency],
    date: new Date().toISOString().split('T')[0],
  }
}

/**
 * Convert amount from one currency to SEK
 */
export function convertToSEK(
  amount: number,
  exchangeRate: number
): number {
  return amount * exchangeRate
}

/**
 * Format currency amount with proper symbol
 */
export function formatCurrencyAmount(
  amount: number,
  currency: Currency
): string {
  const symbols: Record<Currency, string> = {
    SEK: 'kr',
    EUR: '€',
    USD: '$',
    GBP: '£',
    NOK: 'kr',
    DKK: 'kr',
  }

  const formatted = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

  if (currency === 'EUR' || currency === 'USD' || currency === 'GBP') {
    return `${symbols[currency]}${formatted}`
  }

  return `${formatted} ${currency}`
}
