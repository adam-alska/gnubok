import type { SupabaseClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import { generateSIEExport } from './sie-export'
import { generateTrialBalance } from './trial-balance'
import { generateIncomeStatement } from './income-statement'
import { generateBalanceSheet } from './balance-sheet'
import { generateGeneralLedger } from './general-ledger'
import { generateJournalRegister } from './journal-register'
import { calculateVatDeclaration } from './vat-declaration'
import { getAuditLog } from '@/lib/core/audit/audit-service'
import type { AuditLogEntry } from '@/types'

export interface FullArchiveOptions {
  period_id: string
  include_documents?: boolean
}

interface DocumentManifestEntry {
  document_id: string
  file_name: string
  storage_path: string
  sha256_hash: string
  journal_entry_id: string | null
  version: number
  digitization_date: string | null
  upload_source: string | null
  mime_type: string | null
  file_size_bytes: number | null
  status: 'downloaded' | 'missing' | 'error'
  error?: string
}

/**
 * Generate a full archive ZIP for a fiscal period.
 *
 * Contains SIE4 file, all financial reports, attached documents, and audit trail.
 * This fulfills the Swedish accounting law (BFL) requirement for complete archives.
 */
export async function generateFullArchive(
  supabase: SupabaseClient,
  companyId: string,
  options: FullArchiveOptions
): Promise<ArrayBuffer> {
  const { period_id, include_documents = true } = options

  // Fetch fiscal period
  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', period_id)
    .eq('company_id', companyId)
    .single()

  if (!period) {
    throw new Error('Fiscal period not found')
  }

  // Fetch company settings
  const { data: company } = await supabase
    .from('company_settings')
    .select('company_name, trade_name, org_number, moms_period')
    .eq('company_id', companyId)
    .single()

  if (!company) {
    throw new Error('Company settings not found')
  }

  const zip = new JSZip()

  // 1. SIE4 export
  const sieContent = await generateSIEExport(supabase, companyId, {
    fiscal_period_id: period_id,
    company_name: company.company_name || 'Unknown',
    trade_name: company.trade_name,
    org_number: company.org_number,
    program_name: 'ERPBase',
  })
  zip.file('bokforing.se', sieContent)

  // 2. Reports folder
  const rapporter = zip.folder('rapporter')!

  const [trialBalance, incomeStatement, balanceSheet, generalLedger, journalRegister] =
    await Promise.all([
      generateTrialBalance(supabase, companyId, period_id),
      generateIncomeStatement(supabase, companyId, period_id),
      generateBalanceSheet(supabase, companyId, period_id),
      generateGeneralLedger(supabase, companyId, period_id),
      generateJournalRegister(supabase, companyId, period_id),
    ])

  rapporter.file('saldobalans.json', JSON.stringify(trialBalance, null, 2))
  rapporter.file('resultatrakning.json', JSON.stringify(incomeStatement, null, 2))
  rapporter.file('balansrakning.json', JSON.stringify(balanceSheet, null, 2))
  rapporter.file('huvudbok.json', JSON.stringify(generalLedger, null, 2))
  rapporter.file('grundbok.json', JSON.stringify(journalRegister, null, 2))

  // VAT declaration — calculate for the full fiscal period as yearly
  try {
    const startDate = new Date(period.period_start)
    const vatDeclaration = await calculateVatDeclaration(
      supabase,
      companyId,
      'yearly',
      startDate.getFullYear(),
      1
    )
    rapporter.file('momsdeklaration.json', JSON.stringify(vatDeclaration, null, 2))
  } catch {
    // VAT declaration may fail if no relevant entries exist — skip gracefully
  }

  // 3. Documents folder
  if (include_documents) {
    const dokument = zip.folder('dokument')!
    const manifest: DocumentManifestEntry[] = []

    // Fetch document attachments linked to journal entries in this period
    const { data: documents } = await supabase
      .from('document_attachments')
      .select('id, file_name, storage_path, journal_entry_id, sha256_hash, version, digitization_date, upload_source, mime_type, file_size_bytes')
      .eq('company_id', companyId)
      .not('journal_entry_id', 'is', null)

    if (documents && documents.length > 0) {
      // Filter to entries in this period
      const { data: periodEntryIds } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('company_id', companyId)
        .eq('fiscal_period_id', period_id)
        .in('status', ['posted', 'reversed'])

      const periodEntryIdSet = new Set((periodEntryIds || []).map((e: { id: string }) => e.id))
      const periodDocuments = documents.filter(
        (d: { journal_entry_id: string | null }) => d.journal_entry_id && periodEntryIdSet.has(d.journal_entry_id)
      )

      for (const doc of periodDocuments) {
        const baseManifest = {
          document_id: doc.id,
          file_name: doc.file_name,
          storage_path: doc.storage_path,
          sha256_hash: doc.sha256_hash,
          journal_entry_id: doc.journal_entry_id,
          version: doc.version,
          digitization_date: doc.digitization_date,
          upload_source: doc.upload_source,
          mime_type: doc.mime_type,
          file_size_bytes: doc.file_size_bytes,
        }

        try {
          const { data: fileData, error } = await supabase.storage
            .from('documents')
            .download(doc.storage_path)

          if (error || !fileData) {
            manifest.push({
              ...baseManifest,
              status: 'error',
              error: error?.message || 'Download returned no data',
            })
            continue
          }

          const buffer = await fileData.arrayBuffer()
          // Prefix with document ID to prevent duplicate filename collisions
          const zipFileName = `${doc.id}_${doc.file_name}`
          dokument.file(zipFileName, buffer)
          manifest.push({
            ...baseManifest,
            status: 'downloaded',
          })
        } catch (err) {
          manifest.push({
            ...baseManifest,
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        }
      }
    }

    dokument.file('manifest.json', JSON.stringify(manifest, null, 2))
  }

  // 4. Audit trail
  const revision = zip.folder('revision')!
  const allAuditEntries: AuditLogEntry[] = []
  let page = 1
  const pageSize = 500

  while (true) {
    const result = await getAuditLog(supabase, companyId, {
      from_date: period.period_start,
      to_date: period.period_end,
      page,
      pageSize,
    })
    allAuditEntries.push(...result.data)
    if (allAuditEntries.length >= result.count || result.data.length < pageSize) {
      break
    }
    page++
  }

  revision.file('behandlingshistorik.json', JSON.stringify(allAuditEntries, null, 2))

  // 5. Systemdokumentation (BFNAR 2013:2 kap 8)
  const [accountsResult, voucherSeriesResult] = await Promise.all([
    supabase
      .from('chart_of_accounts')
      .select('account_number, account_name, account_type, is_active')
      .eq('company_id', companyId)
      .order('account_number'),
    supabase
      .from('voucher_sequences')
      .select('voucher_series, last_number')
      .eq('company_id', companyId)
      .eq('fiscal_period_id', period_id),
  ])

  const systemdokumentation = {
    system: {
      name: 'gnubok',
      description: 'Bokforingssystem for enskild firma och aktiebolag',
      url: process.env.NEXT_PUBLIC_APP_URL || '',
    },
    kontoplan: {
      standard: 'BAS 2026',
      accounts: accountsResult.data || [],
    },
    verifikationsserier: (voucherSeriesResult.data || []).map((vs: { voucher_series: string; last_number: number }) => ({
      serie: vs.voucher_series,
      senaste_nummer: vs.last_number,
    })),
    behorighetskontroll: {
      description: 'Rollbaserad atkomstkontroll med owner/admin/member/viewer',
      mfa_stod: true,
      rls_aktiv: true,
    },
    arkivering: {
      lagringstid_ar: 7,
      format: 'WORM (Write Once, Read Many)',
      integritetskontroll: 'SHA-256 hashning vid uppladdning, regelbunden verifiering',
      lagringsplats: 'Supabase Storage (krypterad)',
    },
    integrationer: {
      bank: 'Enable Banking (PSD2)',
      email: 'Resend',
      export_format: 'SIE4',
    },
    generated_at: new Date().toISOString(),
    fiscal_period: {
      id: period.id,
      start: period.period_start,
      end: period.period_end,
    },
  }

  revision.file('systemdokumentation.json', JSON.stringify(systemdokumentation, null, 2))

  return zip.generateAsync({ type: 'arraybuffer' })
}
