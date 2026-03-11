/**
 * Nordea Business CSV format parser
 *
 * Format: Semicolon-delimited, comma decimal separator
 * Columns: Bokföringsdag, Belopp, Avsändare, Mottagare, Namn, Rubrik, Saldo, Valuta
 * Date format: YYYY-MM-DD
 * Encoding: UTF-8 or Windows-1252
 *
 * This is the format used by Nordea Business / Internetbanken Företag
 * (netbank.nordea.se), including Plusgiro and corporate accounts.
 * It differs from the personal banking format which is comma-delimited.
 */

import type { BankFileFormat, BankFileParseResult, ParsedBankTransaction, BankFileParseIssue } from '../types'
import { prepareContent } from '../encoding'

function parseCommaDecimal(value: string): number {
  const cleaned = value.replace(/\s/g, '').replace(',', '.')
  return parseFloat(cleaned)
}

export const nordeaBusinessFormat: BankFileFormat = {
  id: 'nordea_business',
  name: 'Nordea Företag',
  description: 'Nordea Företag CSV (Bokföringsdag;Belopp;Avsändare;Mottagare;Namn;Rubrik;Saldo;Valuta)',
  fileExtensions: ['.csv', '.txt'],

  detect(content: string, _filename: string): boolean {
    const prepared = prepareContent(content)
    const firstLine = prepared.split('\n')[0]?.toLowerCase() || ''
    // Nordea Business: semicolon-delimited with "bokföringsdag" and "rubrik"
    // "rubrik" distinguishes from SEB (which has "valutadag"/"verifikationsnummer")
    return (
      firstLine.includes(';') &&
      (firstLine.includes('bokföringsdag') || firstLine.includes('bokforingsdag')) &&
      (firstLine.includes('rubrik') || (firstLine.includes('avsändare') && firstLine.includes('mottagare')))
    )
  },

  parse(content: string): BankFileParseResult {
    const prepared = prepareContent(content)
    const lines = prepared.split('\n').filter((line) => line.trim() !== '')

    const transactions: ParsedBankTransaction[] = []
    const issues: BankFileParseIssue[] = []
    let skippedRows = 0

    // Parse header to find column indices dynamically
    const headerLine = lines[0] || ''
    const headers = headerLine.split(';').map((h) => h.trim().toLowerCase().replace(/"/g, ''))

    const dateIdx = headers.findIndex(
      (h) => h.includes('bokföringsdag') || h.includes('bokforingsdag')
    )
    const amountIdx = headers.findIndex((h) => h === 'belopp' || h.includes('belopp'))
    const senderIdx = headers.findIndex((h) => h.includes('avsändare') || h.includes('avsandare'))
    const receiverIdx = headers.findIndex((h) => h.includes('mottagare'))
    const nameIdx = headers.findIndex((h) => h === 'namn')
    const subjectIdx = headers.findIndex((h) => h === 'rubrik')
    const balanceIdx = headers.findIndex((h) => h === 'saldo' || h.includes('saldo'))
    const currencyIdx = headers.findIndex((h) => h === 'valuta' || h.includes('valuta'))

    if (dateIdx === -1 || amountIdx === -1) {
      issues.push({
        row: 1,
        message: 'Could not identify required columns (Bokföringsdag, Belopp)',
        severity: 'error',
      })
      return {
        format: 'nordea_business',
        format_name: 'Nordea Företag',
        transactions: [],
        date_from: null,
        date_to: null,
        issues,
        stats: { total_rows: 0, parsed_rows: 0, skipped_rows: 0, total_income: 0, total_expenses: 0 },
      }
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const fields = line.split(';').map((f) => f.trim().replace(/^"|"$/g, ''))

      const date = fields[dateIdx]?.trim()
      const amountStr = fields[amountIdx]

      if (!date || !amountStr) {
        issues.push({ row: i + 1, message: 'Missing required fields', severity: 'warning' })
        skippedRows++
        continue
      }

      const amount = parseCommaDecimal(amountStr)
      if (isNaN(amount)) {
        issues.push({ row: i + 1, message: `Invalid amount: ${amountStr}`, severity: 'warning' })
        skippedRows++
        continue
      }

      // Validate date format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        issues.push({ row: i + 1, message: `Invalid date: ${date}`, severity: 'warning' })
        skippedRows++
        continue
      }

      // Build description from Namn + Rubrik (name is the counterparty, rubrik is the subject/memo)
      const name = nameIdx >= 0 ? fields[nameIdx]?.trim() : ''
      const subject = subjectIdx >= 0 ? fields[subjectIdx]?.trim() : ''
      const description = [name, subject].filter(Boolean).join(' — ') || 'Unknown'

      // Counterparty from Avsändare (incoming) or Mottagare (outgoing)
      const sender = senderIdx >= 0 ? fields[senderIdx]?.trim() : null
      const receiver = receiverIdx >= 0 ? fields[receiverIdx]?.trim() : null
      const counterparty = (amount > 0 ? sender : receiver) || null

      const balance = balanceIdx >= 0 && fields[balanceIdx] ? parseCommaDecimal(fields[balanceIdx]) : null
      const currency = currencyIdx >= 0 && fields[currencyIdx] ? fields[currencyIdx].trim() : 'SEK'

      transactions.push({
        date,
        description,
        amount,
        currency: currency || 'SEK',
        balance: isNaN(balance as number) ? null : balance,
        reference: null,
        counterparty: counterparty || null,
        raw_line: line,
      })
    }

    const dates = transactions.map((t) => t.date).sort()

    return {
      format: 'nordea_business',
      format_name: 'Nordea Företag',
      transactions,
      date_from: dates[0] || null,
      date_to: dates[dates.length - 1] || null,
      issues,
      stats: {
        total_rows: lines.length - 1,
        parsed_rows: transactions.length,
        skipped_rows: skippedRows,
        total_income: Math.round(transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0) * 100) / 100,
        total_expenses: Math.round(transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0) * 100) / 100,
      },
    }
  },
}
