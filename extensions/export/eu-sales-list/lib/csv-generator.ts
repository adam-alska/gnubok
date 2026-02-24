/**
 * EU Sales List CSV Generator
 *
 * Generates a semicolon-separated CSV file (UTF-8 with BOM) for the
 * periodisk sammanställning report. Compatible with Excel and Skatteverket's
 * import tools.
 *
 * Format: Semicolon-delimited, UTF-8 BOM, whole SEK amounts.
 */

import type { ECSalesListReport } from './eu-sales-list-engine'

/** UTF-8 BOM for Excel compatibility */
const UTF8_BOM = '\uFEFF'

/**
 * Generate a CSV string for the EC Sales List report.
 *
 * Columns:
 *   Land;VAT-nummer;Varuförsäljning (SEK);Tjänsteförsäljning (SEK);Trepartshandel (SEK)
 *
 * Amounts are rounded to whole SEK (öre removed) as required by Skatteverket.
 */
export function generateCSV(report: ECSalesListReport): string {
  const header = 'Land;VAT-nummer;Varuförsäljning (SEK);Tjänsteförsäljning (SEK);Trepartshandel (SEK)'

  const rows = report.lines.map(line => {
    const goods = Math.round(line.goodsAmount)
    const services = Math.round(line.servicesAmount)
    const triangulation = Math.round(line.triangulationAmount)
    return `${line.customerCountry};${line.customerVatNumber};${goods};${services};${triangulation}`
  })

  // Summary row
  const totalGoods = Math.round(report.totals.goods)
  const totalServices = Math.round(report.totals.services)
  const totalTriangulation = Math.round(report.totals.triangulation)
  rows.push('')
  rows.push(`Summa;;${totalGoods};${totalServices};${totalTriangulation}`)

  return UTF8_BOM + [header, ...rows].join('\r\n') + '\r\n'
}

/**
 * Generate a filename for the CSV download.
 *
 * Format: PS_<VAT>_<period>.csv
 * Example: PS_SE556677889901_2026-Q1.csv or PS_SE556677889901_2026-03.csv
 */
export function generateCSVFilename(report: ECSalesListReport): string {
  const vat = report.reporterVatNumber.replace(/\s/g, '')
  const period = formatPeriod(report)
  return `PS_${vat}_${period}.csv`
}

function formatPeriod(report: ECSalesListReport): string {
  const { year, month, quarter } = report.period
  if (month !== undefined) {
    return `${year}-${String(month).padStart(2, '0')}`
  }
  if (quarter !== undefined) {
    return `${year}-Q${quarter}`
  }
  return `${year}`
}
