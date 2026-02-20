/**
 * Swedbank CSV format parser
 *
 * Format: Comma-delimited, PERIOD decimal separator (exception among Swedish banks!)
 * Columns: Clearingnummer, Kontonummer, Datum, Text, Belopp, Saldo, and more (12 columns)
 * Date format: YYYY-MM-DD
 * Encoding: UTF-8 or Windows-1252
 *
 * Notes:
 * - First line is metadata (account info), SKIP it
 * - Second line is the actual header
 * - Uses period as decimal separator (unlike Nordea/SEB/Handelsbanken)
 */

import type { BankFileFormat, BankFileParseResult, ParsedBankTransaction, BankFileParseIssue } from '../types'
import { prepareContent } from '../encoding'
import { parseCSVLine } from './nordea'

export const swedbankFormat: BankFileFormat = {
  id: 'swedbank',
  name: 'Swedbank',
  description: 'Swedbank CSV (comma-delimited, period decimal)',
  fileExtensions: ['.csv', '.txt'],

  detect(content: string, _filename: string): boolean {
    const prepared = prepareContent(content)
    const lines = prepared.split('\n')
    // Check first two lines — Swedbank has metadata line, then header
    const line1 = lines[0]?.toLowerCase() || ''
    const line2 = lines[1]?.toLowerCase() || ''

    return (
      (line1.includes('clearingnummer') || line2.includes('clearingnummer') ||
       line1.includes('radnummer') || line2.includes('radnummer'))
    )
  },

  parse(content: string): BankFileParseResult {
    const prepared = prepareContent(content)
    const lines = prepared.split('\n').filter((line) => line.trim() !== '')

    const transactions: ParsedBankTransaction[] = []
    const issues: BankFileParseIssue[] = []
    let skippedRows = 0

    // Determine where the header is
    // Line 0 might be metadata, line 1 might be header
    let headerLineIdx = 0
    const line0Lower = lines[0]?.toLowerCase() || ''
    const line1Lower = lines[1]?.toLowerCase() || ''

    if (line1Lower.includes('clearingnummer') || line1Lower.includes('radnummer')) {
      headerLineIdx = 1
    } else if (line0Lower.includes('clearingnummer') || line0Lower.includes('radnummer')) {
      headerLineIdx = 0
    }

    const headerLine = lines[headerLineIdx] || ''
    const headers = parseCSVLine(headerLine, ',').map((h) =>
      h.trim().toLowerCase().replace(/"/g, '')
    )

    // Find column indices
    const dateIdx = headers.findIndex((h) => h === 'datum' || h.includes('bokföringsdatum'))
    const descIdx = headers.findIndex((h) => h === 'text' || h.includes('beskrivning'))
    const amountIdx = headers.findIndex((h) => h === 'belopp')
    const balanceIdx = headers.findIndex((h) => h === 'saldo')

    if (dateIdx === -1 || amountIdx === -1) {
      issues.push({
        row: 1,
        message: 'Could not identify required columns (datum, belopp)',
        severity: 'error',
      })
      return {
        format: 'swedbank',
        format_name: 'Swedbank',
        transactions: [],
        date_from: null,
        date_to: null,
        issues,
        stats: { total_rows: 0, parsed_rows: 0, skipped_rows: 0, total_income: 0, total_expenses: 0 },
      }
    }

    // Data starts after header
    for (let i = headerLineIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const fields = parseCSVLine(line, ',').map((f) => f.trim().replace(/^"|"$/g, ''))

      const date = fields[dateIdx]
      const description = descIdx >= 0 ? fields[descIdx] : 'Unknown'
      const amountStr = fields[amountIdx]
      const balanceStr = balanceIdx >= 0 ? fields[balanceIdx] : undefined

      if (!date || !amountStr) {
        skippedRows++
        continue
      }

      // Swedbank uses PERIOD decimal separator
      const amount = parseFloat(amountStr.replace(/\s/g, ''))
      if (isNaN(amount)) {
        issues.push({ row: i + 1, message: `Invalid amount: ${amountStr}`, severity: 'warning' })
        skippedRows++
        continue
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        issues.push({ row: i + 1, message: `Invalid date: ${date}`, severity: 'warning' })
        skippedRows++
        continue
      }

      const balance = balanceStr ? parseFloat(balanceStr.replace(/\s/g, '')) : null

      transactions.push({
        date,
        description: (description || 'Unknown').trim(),
        amount,
        currency: 'SEK',
        balance: isNaN(balance as number) ? null : balance,
        reference: null,
        counterparty: null,
        raw_line: line,
      })
    }

    const dates = transactions.map((t) => t.date).sort()

    return {
      format: 'swedbank',
      format_name: 'Swedbank',
      transactions,
      date_from: dates[0] || null,
      date_to: dates[dates.length - 1] || null,
      issues,
      stats: {
        total_rows: lines.length - headerLineIdx - 1,
        parsed_rows: transactions.length,
        skipped_rows: skippedRows,
        total_income: Math.round(transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0) * 100) / 100,
        total_expenses: Math.round(transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0) * 100) / 100,
      },
    }
  },
}
