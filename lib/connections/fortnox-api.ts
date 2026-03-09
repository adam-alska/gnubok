interface FortnoxCompanyInfo {
  CompanyName: string
  OrganizationNumber: string
}

export async function fetchFortnoxCompanyInfo(
  accessToken: string
): Promise<FortnoxCompanyInfo | null> {
  try {
    const response = await fetch('https://api.fortnox.se/3/companyinformation', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) return null

    const data = await response.json()
    return data.CompanyInformation ?? null
  } catch {
    return null
  }
}

export interface FortnoxFinancialYear {
  Id: number
  FromDate: string
  ToDate: string
  accountingMethod: string
}

export async function fetchFortnoxFinancialYears(
  accessToken: string
): Promise<FortnoxFinancialYear[]> {
  try {
    const response = await fetch('https://api.fortnox.se/3/financialyears', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[fortnox-api] Financial years fetch failed: ${response.status}`, body)
      return []
    }

    const data = await response.json()
    return data.FinancialYears ?? []
  } catch (err) {
    console.error('[fortnox-api] Financial years fetch error:', err)
    return []
  }
}

export async function fetchFortnoxSIE(
  accessToken: string,
  financialYear: number
): Promise<ArrayBuffer | null> {
  try {
    const url = `https://api.fortnox.se/3/sie/4?financialyear=${financialYear}`
    console.log(`[fortnox-api] Fetching SIE: ${url}`)

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[fortnox-api] SIE fetch failed: ${response.status} ${response.statusText}`, body)
      return null
    }

    return response.arrayBuffer()
  } catch (err) {
    console.error('[fortnox-api] SIE fetch error:', err)
    return null
  }
}
