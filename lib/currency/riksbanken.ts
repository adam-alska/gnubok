import type { Currency, ExchangeRate } from '@/types'

/**
 * Fetch exchange rates from Riksbanken API
 * Uses their public API for daily exchange rates
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
    console.error(`Unknown currency: ${currency}`)
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
        return {
          currency,
          rate: parseFloat(latest.value),
          date: latest.date,
        }
      }

      return null
    }

    const data = await response.json()
    if (data && data.length > 0) {
      return {
        currency,
        rate: parseFloat(data[0].value),
        date: data[0].date,
      }
    }

    return null
  } catch (error) {
    console.error('Error fetching exchange rate:', error)
    // Return fallback rates for development/testing
    return getFallbackRate(currency)
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
