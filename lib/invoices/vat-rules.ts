import type { CustomerType, VatTreatment } from '@/types'

export interface VatRule {
  treatment: VatTreatment
  rate: number
  momsRuta: string
  reverseChargeText?: string
}

/**
 * Determine VAT treatment based on customer type and VAT validation status
 *
 * Rules:
 * - Swedish customers: 25% VAT, moms ruta 05
 * - EU business with validated VAT: 0% reverse charge, moms ruta 39
 * - EU business without validated VAT: 25% VAT, moms ruta 05
 * - Non-EU business: 0% export, moms ruta 40
 */
export function getVatRules(
  customerType: CustomerType,
  vatNumberValidated: boolean = false
): VatRule {
  switch (customerType) {
    case 'individual':
    case 'swedish_business':
      return {
        treatment: 'standard_25',
        rate: 25,
        momsRuta: '05',
      }

    case 'eu_business':
      if (vatNumberValidated) {
        return {
          treatment: 'reverse_charge',
          rate: 0,
          momsRuta: '39',
          reverseChargeText: 'Omvänd skattskyldighet / Reverse charge - VAT to be accounted for by the recipient as per Article 196, Council Directive 2006/112/EC',
        }
      }
      // EU business without validated VAT number must be charged Swedish VAT
      return {
        treatment: 'standard_25',
        rate: 25,
        momsRuta: '05',
      }

    case 'non_eu_business':
      return {
        treatment: 'export',
        rate: 0,
        momsRuta: '40',
      }

    default:
      return {
        treatment: 'standard_25',
        rate: 25,
        momsRuta: '05',
      }
  }
}

/**
 * Calculate VAT amount
 */
export function calculateVat(subtotal: number, vatRate: number): number {
  return subtotal * (vatRate / 100)
}

/**
 * Calculate total including VAT
 */
export function calculateTotal(subtotal: number, vatRate: number): number {
  return subtotal + calculateVat(subtotal, vatRate)
}

/**
 * Format VAT rate for display
 */
export function formatVatRate(rate: number): string {
  if (rate === 0) {
    return '0%'
  }
  return `${rate}%`
}

/**
 * Get VAT treatment label in Swedish
 */
export function getVatTreatmentLabel(treatment: VatTreatment): string {
  const labels: Record<VatTreatment, string> = {
    standard_25: '25% moms',
    reduced_12: '12% moms',
    reduced_6: '6% moms',
    reverse_charge: 'Omvänd skattskyldighet (0%)',
    export: 'Export (0%)',
    exempt: 'Momsfritt',
  }
  return labels[treatment]
}

/**
 * Get moms ruta description
 */
export function getMomsRutaDescription(ruta: string): string {
  const descriptions: Record<string, string> = {
    '05': 'Utgående moms 25%',
    '06': 'Utgående moms 12%',
    '07': 'Utgående moms 6%',
    '39': 'Försäljning av tjänster till annat EU-land',
    '40': 'Export utanför EU',
  }
  return descriptions[ruta] || ruta
}
