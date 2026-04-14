import { decryptPersonnummer } from '../personnummer'

/**
 * AGI XML generator — Arbetsgivardeklaration per Skatteverket Teknisk beskrivning.
 *
 * Generates the XML content for filing employer declarations.
 * The XML is stored in agi_declarations.xml_content for 7-year retention.
 */

export interface AGIEmployeeData {
  personnummer: string      // Encrypted — will be decrypted for XML
  specificationNumber: number // FK570 — MUST stay consistent
  grossSalary: number       // Ruta 011
  taxWithheld: number       // Ruta 001
  avgifterBasis: number     // Ruta 020
  fSkattPayment?: number    // Ruta 131 (F-skatt holders)
  // Benefits by type
  benefitCar?: number       // Ruta 012
  benefitFuel?: number      // Ruta 013
  benefitHousing?: number   // Ruta 014
  benefitMeals?: number     // Ruta 015
  benefitOther?: number     // Ruta 019
  // Absence (from 2025)
  sickDays?: number         // FK821
  vabDays?: number          // FK822
  parentalDays?: number     // FK823
}

export interface AGICompanyData {
  orgNumber: string         // NNNNNN-NNNN format
  companyName: string
  periodYear: number
  periodMonth: number
  contactName: string
  contactPhone: string
  contactEmail: string
}

export interface AGITotals {
  totalTax: number          // Ruta 001 (huvuduppgift)
  totalAvgifterBasis: number // Ruta 020 (huvuduppgift)
  avgifterByCategory: {
    standard?: { basis: number; amount: number }
    reduced65plus?: { basis: number; amount: number }
    youth?: { basis: number; amount: number }
  }
}

/**
 * Generate AGI XML for a period.
 *
 * CRITICAL: FK570 (specifikationsnummer) must stay consistent per employee.
 * Using a different number creates a new record instead of correcting.
 */
export function generateAGIXml(
  company: AGICompanyData,
  employees: AGIEmployeeData[],
  totals: AGITotals,
  isCorrection: boolean = false
): string {
  const period = `${company.periodYear}${String(company.periodMonth).padStart(2, '0')}`

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<Skatteverket xmlns="http://xmls.skatteverket.se/se/skatteverket/ai/instans/infoForBeskworksgiv662/1.0"')
  lines.push('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">')
  lines.push('  <Avsandare>')
  lines.push(`    <Programnamn>gnubok</Programnamn>`)
  lines.push(`    <Organisationsnummer>${escapeXml(company.orgNumber.replace('-', ''))}</Organisationsnummer>`)
  lines.push('    <TekniskKontaktperson>')
  lines.push(`      <Namn>${escapeXml(company.contactName)}</Namn>`)
  lines.push(`      <Telefon>${escapeXml(company.contactPhone)}</Telefon>`)
  lines.push(`      <Epostadress>${escapeXml(company.contactEmail)}</Epostadress>`)
  lines.push('    </TekniskKontaktperson>')
  lines.push('  </Avsandare>')

  lines.push('  <Blankettgemensamt>')
  lines.push(`    <Arbetsgivare>`)
  lines.push(`      <AgRegistreradId>${escapeXml(company.orgNumber.replace('-', ''))}</AgRegistreradId>`)
  lines.push(`    </Arbetsgivare>`)
  lines.push('  </Blankettgemensamt>')

  // Huvuduppgift (employer totals)
  lines.push('  <Blankett>')
  lines.push('    <Arendeinformation>')
  lines.push(`      <Arendeagare>${escapeXml(company.orgNumber.replace('-', ''))}</Arendeagare>`)
  lines.push(`      <Period>${period}</Period>`)
  if (isCorrection) {
    lines.push('      <Rattelse>J</Rattelse>')
  }
  lines.push('    </Arendeinformation>')
  lines.push('    <Blankettinnehall>')
  lines.push('      <HU>')

  // Ruta 001: Total skatteavdrag
  if (totals.totalTax > 0) {
    lines.push(`        <AvdragenSkatt faltkod="001">${formatAmount(totals.totalTax)}</AvdragenSkatt>`)
  }

  // Ruta 020: Total avgifter basis
  if (totals.totalAvgifterBasis > 0) {
    lines.push(`        <SummaArbAvg>${formatAmount(totals.totalAvgifterBasis)}</SummaArbAvg>`)
  }

  // Avgifter by category
  if (totals.avgifterByCategory.standard) {
    lines.push(`        <AvgUnderlagStandardRate faltkod="060">${formatAmount(totals.avgifterByCategory.standard.basis)}</AvgUnderlagStandardRate>`)
  }
  if (totals.avgifterByCategory.reduced65plus) {
    lines.push(`        <AvgUnderlagAlderspension faltkod="061">${formatAmount(totals.avgifterByCategory.reduced65plus.basis)}</AvgUnderlagAlderspension>`)
  }
  if (totals.avgifterByCategory.youth) {
    lines.push(`        <AvgUnderlagUngdom faltkod="062">${formatAmount(totals.avgifterByCategory.youth.basis)}</AvgUnderlagUngdom>`)
  }

  lines.push('      </HU>')
  lines.push('    </Blankettinnehall>')
  lines.push('  </Blankett>')

  // Individuppgifter (per employee)
  for (const emp of employees) {
    lines.push('  <Blankett>')
    lines.push('    <Arendeinformation>')
    lines.push(`      <Arendeagare>${escapeXml(company.orgNumber.replace('-', ''))}</Arendeagare>`)
    lines.push(`      <Period>${period}</Period>`)
    if (isCorrection) {
      lines.push('      <Rattelse>J</Rattelse>')
    }
    lines.push('    </Arendeinformation>')
    lines.push('    <Blankettinnehall>')
    lines.push('      <IU>')

    // FK215: Personnummer (CRITICAL: must be decrypted for AGI)
    let pnr: string
    try {
      pnr = decryptPersonnummer(emp.personnummer)
    } catch {
      throw new Error(`Kunde inte dekryptera personnummer för anställd med FK570=${emp.specificationNumber}. AGI kan inte genereras utan giltigt personnummer.`)
    }
    lines.push(`        <Personnummer faltkod="215">${pnr}</Personnummer>`)

    // FK570: Specifikationsnummer (MUST stay consistent)
    lines.push(`        <Specifikationsnummer faltkod="570">${emp.specificationNumber}</Specifikationsnummer>`)

    // Ruta 011: Gross salary
    if (emp.grossSalary > 0) {
      lines.push(`        <KontantBruttoloen faltkod="011">${formatAmount(emp.grossSalary)}</KontantBruttoloen>`)
    }

    // Ruta 001: Tax withheld
    if (emp.taxWithheld > 0) {
      lines.push(`        <AvdragenSkatt faltkod="001">${formatAmount(emp.taxWithheld)}</AvdragenSkatt>`)
    }

    // Benefits
    if (emp.benefitCar && emp.benefitCar > 0) {
      lines.push(`        <FormanBil faltkod="012">${formatAmount(emp.benefitCar)}</FormanBil>`)
    }
    if (emp.benefitFuel && emp.benefitFuel > 0) {
      lines.push(`        <FormanDrivmedel faltkod="013">${formatAmount(emp.benefitFuel)}</FormanDrivmedel>`)
    }
    if (emp.benefitHousing && emp.benefitHousing > 0) {
      lines.push(`        <FormanBostad faltkod="014">${formatAmount(emp.benefitHousing)}</FormanBostad>`)
    }
    if (emp.benefitMeals && emp.benefitMeals > 0) {
      lines.push(`        <FormanKost faltkod="015">${formatAmount(emp.benefitMeals)}</FormanKost>`)
    }
    if (emp.benefitOther && emp.benefitOther > 0) {
      lines.push(`        <FormanOvrigt faltkod="019">${formatAmount(emp.benefitOther)}</FormanOvrigt>`)
    }

    // Ruta 020: Avgifter basis
    if (emp.avgifterBasis > 0) {
      lines.push(`        <UnderlagArbAvg faltkod="020">${formatAmount(emp.avgifterBasis)}</UnderlagArbAvg>`)
    }

    // Ruta 131: F-skatt payments
    if (emp.fSkattPayment && emp.fSkattPayment > 0) {
      lines.push(`        <ErsattningFSkatt faltkod="131">${formatAmount(emp.fSkattPayment)}</ErsattningFSkatt>`)
    }

    // Absence fields (from 2025)
    if (emp.sickDays && emp.sickDays > 0) {
      lines.push(`        <SjukfranvaroDagar faltkod="821">${Math.round(emp.sickDays)}</SjukfranvaroDagar>`)
    }
    if (emp.vabDays && emp.vabDays > 0) {
      lines.push(`        <VabDagar faltkod="822">${Math.round(emp.vabDays)}</VabDagar>`)
    }
    if (emp.parentalDays && emp.parentalDays > 0) {
      lines.push(`        <ForaldraledigDagar faltkod="823">${Math.round(emp.parentalDays)}</ForaldraledigDagar>`)
    }

    lines.push('      </IU>')
    lines.push('    </Blankettinnehall>')
    lines.push('  </Blankett>')
  }

  lines.push('</Skatteverket>')

  return lines.join('\n')
}

/**
 * Build individuppgifter snapshot for storage in agi_declarations table.
 * Used for corrections — must reference same FK570.
 */
export function buildIndividuppgifterSnapshot(
  employees: AGIEmployeeData[]
): Record<string, unknown>[] {
  return employees.map(emp => {
    let pnr: string
    try {
      pnr = decryptPersonnummer(emp.personnummer)
    } catch {
      pnr = 'DECRYPTION_FAILED'
    }

    return {
      personnummer: pnr,
      fk570: emp.specificationNumber,
      ruta011: emp.grossSalary,
      ruta001: emp.taxWithheld,
      ruta020: emp.avgifterBasis,
      fk821: emp.sickDays || 0,
      fk822: emp.vabDays || 0,
      fk823: emp.parentalDays || 0,
    }
  })
}

// ============================================================
// Helpers
// ============================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatAmount(amount: number): string {
  return Math.round(amount).toString()
}
