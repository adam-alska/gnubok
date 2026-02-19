'use client'

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import type { AnnualReport, AnnualReportNote } from '@/types/year-end'
import type { IncomeStatementReport, BalanceSheetReport } from '@/types'

// Register a default font that handles Swedish characters
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'Helvetica' },
    { src: 'Helvetica-Bold', fontWeight: 'bold' },
  ],
})

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 50,
    paddingBottom: 50,
    paddingHorizontal: 50,
    color: '#1a1a1a',
  },
  coverPage: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 100,
    paddingBottom: 50,
    paddingHorizontal: 50,
    color: '#1a1a1a',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666666',
    marginBottom: 4,
  },
  coverInfo: {
    fontSize: 11,
    textAlign: 'center',
    color: '#888888',
    marginTop: 40,
  },
  h1: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    marginTop: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    paddingBottom: 6,
  },
  h2: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 16,
  },
  h3: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 4,
    marginTop: 12,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
    minHeight: 20,
    alignItems: 'center',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    minHeight: 24,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  tableTotalRow: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    borderTopColor: '#333333',
    minHeight: 24,
    alignItems: 'center',
    fontWeight: 'bold',
  },
  accountCol: {
    width: '15%',
    fontSize: 9,
  },
  nameCol: {
    width: '55%',
    fontSize: 9,
  },
  amountCol: {
    width: '30%',
    textAlign: 'right',
    fontSize: 9,
  },
  wideNameCol: {
    width: '70%',
    fontSize: 9,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    fontSize: 8,
    color: '#999999',
    textAlign: 'center',
  },
  signatureSection: {
    marginTop: 40,
  },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: '#333333',
    width: '60%',
    marginTop: 40,
    paddingTop: 4,
    fontSize: 9,
  },
  noteCard: {
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e0e0e0',
  },
})

interface AnnualReportPDFProps {
  report: AnnualReport
  companyName: string
  orgNumber: string
  address?: string
}

function formatAmount(amount: number): string {
  return Math.round(amount).toLocaleString('sv-SE')
}

export function AnnualReportPDF({
  report,
  companyName,
  orgNumber,
  address,
}: AnnualReportPDFProps) {
  const incomeStatement = report.income_statement as IncomeStatementReport | null
  const balanceSheet = report.balance_sheet as BalanceSheetReport | null
  const notes = (report.notes_data || []) as AnnualReportNote[]
  const periodStart = (report.report_data as Record<string, string>)?.periodStart || ''
  const periodEnd = (report.report_data as Record<string, string>)?.periodEnd || ''

  return (
    <Document>
      {/* Cover Page */}
      <Page size="A4" style={styles.coverPage}>
        <View style={{ marginTop: 120 }}>
          <Text style={styles.coverTitle}>Årsredovisning</Text>
          <Text style={styles.coverSubtitle}>{companyName}</Text>
          <Text style={styles.coverSubtitle}>Organisationsnummer {orgNumber}</Text>
          <Text style={styles.coverInfo}>
            Räkenskapsår {periodStart} - {periodEnd}
          </Text>
          {address && <Text style={styles.coverInfo}>{address}</Text>}
        </View>
        <Text style={styles.footer}>
          Sida 1
        </Text>
      </Page>

      {/* Management Report (for AB) */}
      {report.entity_type === 'aktiebolag' && report.management_report && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Forvaltningsberattelse</Text>
          {report.management_report.split('\n\n').map((paragraph, idx) => (
            <Text key={idx} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
          <Text style={styles.footer}>
            {companyName} - Org.nr {orgNumber}
          </Text>
        </Page>
      )}

      {/* Income Statement */}
      {incomeStatement && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Resultatrakning</Text>
          <Text style={{ fontSize: 9, color: '#888888', marginBottom: 12 }}>
            Period: {periodStart} - {periodEnd}
          </Text>

          {/* Revenue */}
          <Text style={styles.h2}>Rorelsens intakter</Text>
          {incomeStatement.revenue_sections.map((section) => (
            <View key={section.title}>
              <Text style={styles.h3}>{section.title}</Text>
              {section.rows.map((row) => (
                <View key={row.account_number} style={styles.tableRow}>
                  <Text style={styles.accountCol}>{row.account_number}</Text>
                  <Text style={styles.nameCol}>{row.account_name}</Text>
                  <Text style={styles.amountCol}>{formatAmount(row.amount)}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={styles.tableTotalRow}>
            <Text style={styles.wideNameCol}>Summa rorelsens intakter</Text>
            <Text style={styles.amountCol}>
              {formatAmount(incomeStatement.total_revenue)}
            </Text>
          </View>

          {/* Expenses */}
          <Text style={styles.h2}>Rorelsens kostnader</Text>
          {incomeStatement.expense_sections.map((section) => (
            <View key={section.title}>
              <Text style={styles.h3}>{section.title}</Text>
              {section.rows.map((row) => (
                <View key={row.account_number} style={styles.tableRow}>
                  <Text style={styles.accountCol}>{row.account_number}</Text>
                  <Text style={styles.nameCol}>{row.account_name}</Text>
                  <Text style={styles.amountCol}>-{formatAmount(row.amount)}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={styles.tableTotalRow}>
            <Text style={styles.wideNameCol}>Summa rorelsens kostnader</Text>
            <Text style={styles.amountCol}>
              -{formatAmount(incomeStatement.total_expenses)}
            </Text>
          </View>

          {/* Operating result */}
          <View style={{ ...styles.tableTotalRow, marginTop: 8 }}>
            <Text style={{ ...styles.wideNameCol, fontWeight: 'bold' }}>
              Rorelseresultat
            </Text>
            <Text style={{ ...styles.amountCol, fontWeight: 'bold' }}>
              {formatAmount(incomeStatement.total_revenue - incomeStatement.total_expenses)}
            </Text>
          </View>

          {/* Financial items */}
          {incomeStatement.financial_sections.length > 0 && (
            <>
              <Text style={styles.h2}>Finansiella poster</Text>
              {incomeStatement.financial_sections.map((section) => (
                <View key={section.title}>
                  <Text style={styles.h3}>{section.title}</Text>
                  {section.rows.map((row) => (
                    <View key={row.account_number} style={styles.tableRow}>
                      <Text style={styles.accountCol}>{row.account_number}</Text>
                      <Text style={styles.nameCol}>{row.account_name}</Text>
                      <Text style={styles.amountCol}>{formatAmount(row.amount)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}

          {/* Net result */}
          <View
            style={{
              ...styles.tableTotalRow,
              marginTop: 16,
              borderTopWidth: 2,
              paddingTop: 4,
            }}
          >
            <Text style={{ ...styles.wideNameCol, fontSize: 12, fontWeight: 'bold' }}>
              Arets resultat
            </Text>
            <Text style={{ ...styles.amountCol, fontSize: 12, fontWeight: 'bold' }}>
              {formatAmount(incomeStatement.net_result)}
            </Text>
          </View>

          <Text style={styles.footer}>
            {companyName} - Org.nr {orgNumber}
          </Text>
        </Page>
      )}

      {/* Balance Sheet */}
      {balanceSheet && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Balansrakning</Text>
          <Text style={{ fontSize: 9, color: '#888888', marginBottom: 12 }}>
            Per {periodEnd}
          </Text>

          {/* Assets */}
          <Text style={styles.h2}>Tillgangar</Text>
          {balanceSheet.asset_sections.map((section) => (
            <View key={section.title}>
              <Text style={styles.h3}>{section.title}</Text>
              {section.rows.map((row) => (
                <View key={row.account_number} style={styles.tableRow}>
                  <Text style={styles.accountCol}>{row.account_number}</Text>
                  <Text style={styles.nameCol}>{row.account_name}</Text>
                  <Text style={styles.amountCol}>{formatAmount(row.amount)}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={styles.tableTotalRow}>
            <Text style={styles.wideNameCol}>Summa tillgangar</Text>
            <Text style={styles.amountCol}>
              {formatAmount(balanceSheet.total_assets)}
            </Text>
          </View>

          {/* Equity and liabilities */}
          <Text style={styles.h2}>Eget kapital och skulder</Text>
          {balanceSheet.equity_liability_sections.map((section) => (
            <View key={section.title}>
              <Text style={styles.h3}>{section.title}</Text>
              {section.rows.map((row) => (
                <View key={row.account_number} style={styles.tableRow}>
                  <Text style={styles.accountCol}>{row.account_number}</Text>
                  <Text style={styles.nameCol}>{row.account_name}</Text>
                  <Text style={styles.amountCol}>{formatAmount(row.amount)}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={styles.tableTotalRow}>
            <Text style={styles.wideNameCol}>Summa eget kapital och skulder</Text>
            <Text style={styles.amountCol}>
              {formatAmount(balanceSheet.total_equity_liabilities)}
            </Text>
          </View>

          <Text style={styles.footer}>
            {companyName} - Org.nr {orgNumber}
          </Text>
        </Page>
      )}

      {/* Notes */}
      {notes.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Noter</Text>
          {notes.map((note) => (
            <View key={note.noteNumber} style={styles.noteCard}>
              <Text style={styles.h2}>
                Not {note.noteNumber}: {note.title}
              </Text>
              {note.content.split('\n').map((line, idx) => (
                <Text key={idx} style={styles.paragraph}>
                  {line}
                </Text>
              ))}
            </View>
          ))}

          <Text style={styles.footer}>
            {companyName} - Org.nr {orgNumber}
          </Text>
        </Page>
      )}

      {/* Signature page */}
      {report.entity_type === 'aktiebolag' && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.h1}>Underskrifter</Text>
          <Text style={styles.paragraph}>
            Styrelsen och verkstallande direktoren intygar att arsredovisningen ger
            en rattvisande bild av foretagets stallning och resultat.
          </Text>
          <Text style={{ ...styles.paragraph, marginTop: 8 }}>
            Ort och datum: ________________________________
          </Text>

          <View style={styles.signatureSection}>
            {(report.board_members || []).length > 0 ? (
              report.board_members.map((member, idx) => (
                <View key={idx} style={styles.signatureLine}>
                  <Text>{member.name}</Text>
                  <Text style={{ fontSize: 8, color: '#666666' }}>
                    {member.role === 'ordforande'
                      ? 'Styrelsens ordforande'
                      : member.role === 'vd'
                      ? 'Verkstallande direktor'
                      : member.role === 'ledamot'
                      ? 'Styrelseledamot'
                      : 'Suppleant'}
                  </Text>
                </View>
              ))
            ) : (
              <>
                <View style={styles.signatureLine}>
                  <Text>________________________________</Text>
                  <Text style={{ fontSize: 8, color: '#666666' }}>
                    Styrelsens ordforande
                  </Text>
                </View>
                <View style={styles.signatureLine}>
                  <Text>________________________________</Text>
                  <Text style={{ fontSize: 8, color: '#666666' }}>
                    Styrelseledamot / Verkstallande direktor
                  </Text>
                </View>
              </>
            )}
          </View>

          <Text style={styles.footer}>
            {companyName} - Org.nr {orgNumber}
          </Text>
        </Page>
      )}
    </Document>
  )
}
