/**
 * EU Sales List XML Generator (SKV 5740 format)
 *
 * Generates XML compatible with Skatteverket's e-filing system for
 * periodisk sammanställning (EC Sales List / recapitulative statement).
 *
 * Reference: Skatteverket SKV 5740, KVPS XML schema
 * Filing: Monthly for goods, quarterly for services
 *
 * The XML structure follows Skatteverket's KVPS (Kvartalsvis Periodisk
 * Sammanställning) format with elements for reporter info, period, and
 * per-customer goods/services/triangulation amounts in whole SEK.
 */

import type { ECSalesListReport } from './eu-sales-list-engine'

/**
 * Generate SKV-compatible XML for the EC Sales List report.
 *
 * Structure:
 *   <KVPS>
 *     <Avsandare>         — reporter/sender information
 *     <Period>            — reporting period
 *     <Rad>               — one per customer VAT number
 *       <KopareVATnr>     — buyer VAT number
 *       <KopareLand>      — buyer country code
 *       <VarorBeloppSEK>  — goods amount (box 35)
 *       <TjansterBeloppSEK> — services amount (box 39)
 *       <TriangelhandelBeloppSEK> — triangulation (box 38)
 *     </Rad>
 *   </KVPS>
 *
 * All amounts are rounded to whole SEK (no decimals).
 */
export function generateSKVXml(report: ECSalesListReport): string {
  const lines: string[] = []

  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<KVPS>')

  // Reporter/sender info
  lines.push('  <Avsandare>')
  lines.push(`    <Momsregistreringsnummer>${escapeXml(report.reporterVatNumber)}</Momsregistreringsnummer>`)
  lines.push(`    <Namn>${escapeXml(report.reporterName)}</Namn>`)
  lines.push('  </Avsandare>')

  // Period info
  lines.push('  <Period>')
  lines.push(`    <Ar>${report.period.year}</Ar>`)
  if (report.period.month !== undefined) {
    lines.push(`    <Manad>${String(report.period.month).padStart(2, '0')}</Manad>`)
  }
  if (report.period.quarter !== undefined) {
    lines.push(`    <Kvartal>${report.period.quarter}</Kvartal>`)
  }
  lines.push(`    <Redovisningstyp>${report.filingType === 'monthly' ? 'Manad' : 'Kvartal'}</Redovisningstyp>`)
  lines.push('  </Period>')

  // Customer lines
  for (const line of report.lines) {
    const goods = Math.round(line.goodsAmount)
    const services = Math.round(line.servicesAmount)
    const triangulation = Math.round(line.triangulationAmount)

    // Skip lines with all zero amounts
    if (goods === 0 && services === 0 && triangulation === 0) continue

    lines.push('  <Rad>')
    lines.push(`    <KopareVATnr>${escapeXml(line.customerVatNumber)}</KopareVATnr>`)
    lines.push(`    <KopareLand>${escapeXml(line.customerCountry)}</KopareLand>`)
    if (goods !== 0) {
      lines.push(`    <VarorBeloppSEK>${goods}</VarorBeloppSEK>`)
    }
    if (services !== 0) {
      lines.push(`    <TjansterBeloppSEK>${services}</TjansterBeloppSEK>`)
    }
    if (triangulation !== 0) {
      lines.push(`    <TriangelhandelBeloppSEK>${triangulation}</TriangelhandelBeloppSEK>`)
    }
    lines.push('  </Rad>')
  }

  // Totals
  lines.push('  <Summa>')
  lines.push(`    <VarorTotaltSEK>${Math.round(report.totals.goods)}</VarorTotaltSEK>`)
  lines.push(`    <TjansterTotaltSEK>${Math.round(report.totals.services)}</TjansterTotaltSEK>`)
  lines.push(`    <TriangelhandelTotaltSEK>${Math.round(report.totals.triangulation)}</TriangelhandelTotaltSEK>`)
  lines.push(`    <TotaltSEK>${Math.round(report.totals.total)}</TotaltSEK>`)
  lines.push('  </Summa>')

  lines.push('</KVPS>')

  return lines.join('\n') + '\n'
}

/**
 * Generate a filename for the XML download.
 *
 * Format: KVPS_<VAT>_<period>.xml
 * Example: KVPS_SE556677889901_2026-Q1.xml
 */
export function generateXMLFilename(report: ECSalesListReport): string {
  const vat = report.reporterVatNumber.replace(/\s/g, '')
  const period = formatPeriod(report)
  return `KVPS_${vat}_${period}.xml`
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

/** Escape special XML characters to prevent injection */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
