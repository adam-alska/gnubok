/**
 * Intrastat SCB CSV Generator
 *
 * Generates a semicolon-separated CSV file (UTF-8 with BOM)
 * compatible with SCB's IDEP.web upload for Intrastat declarations.
 *
 * Format: Semicolon-delimited, UTF-8 BOM, whole SEK amounts,
 * net mass in kg with up to 3 decimal places.
 *
 * Reference: SCB IDEP.web filformat, Intrastat utförsel
 */

import type { IntrastatReport } from './intrastat-engine'

const UTF8_BOM = '\uFEFF'

/**
 * Generate an IDEP.web-compatible CSV for the Intrastat report.
 *
 * Columns (matching SCB IDEP.web format):
 *   CN-kod;Partnerland;Ursprungsland;Transaktionstyp;Leveransvillkor;
 *   Fakturerat värde (SEK);Nettovikt (kg);Kompletterande enhet;Partner-VAT
 */
export function generateSCBCsv(report: IntrastatReport): string {
  const header = [
    'CN-kod',
    'Partnerland',
    'Ursprungsland',
    'Transaktionstyp',
    'Leveransvillkor',
    'Fakturerat värde (SEK)',
    'Nettovikt (kg)',
    'Kompletterande enhet',
    'Partner-VAT',
  ].join(';')

  const rows = report.lines.map(line => {
    const value = Math.round(line.invoicedValue)
    const mass = roundMass(line.netMass)
    const suppUnit = line.supplementaryUnit !== null ? String(Math.round(line.supplementaryUnit)) : ''

    return [
      line.cnCode,
      line.partnerCountry,
      line.countryOfOrigin,
      line.transactionNature,
      line.deliveryTerms,
      String(value),
      String(mass),
      suppUnit,
      line.partnerVatId,
    ].join(';')
  })

  return UTF8_BOM + [header, ...rows].join('\r\n') + '\r\n'
}

/**
 * Generate a filename for the IDEP.web CSV download.
 *
 * Format: INTRASTAT_<VAT>_<YYYY>-<MM>.csv
 */
export function generateSCBFilename(report: IntrastatReport): string {
  const vat = report.reporterVatNumber.replace(/\s/g, '')
  const period = `${report.period.year}-${String(report.period.month).padStart(2, '0')}`
  return `INTRASTAT_${vat}_${period}.csv`
}

/** Round mass to max 3 decimal places, removing trailing zeros */
function roundMass(kg: number): string {
  const rounded = Math.round(kg * 1000) / 1000
  if (rounded === Math.floor(rounded)) return String(rounded)
  return rounded.toFixed(3).replace(/0+$/, '')
}
