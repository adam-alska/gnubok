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
  file_name: string
  storage_path: string
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
  userId: string,
  options: FullArchiveOptions
): Promise<ArrayBuffer> {
  const { period_id, include_documents = true } = options

  // Fetch fiscal period
  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('*')
    .eq('id', period_id)
    .eq('user_id', userId)
    .single()

  if (!period) {
    throw new Error('Fiscal period not found')
  }

  // Fetch company settings
  const { data: company } = await supabase
    .from('company_settings')
    .select('company_name, org_number, moms_period')
    .eq('user_id', userId)
    .single()

  if (!company) {
    throw new Error('Company settings not found')
  }

  const zip = new JSZip()

  // 1. SIE4 export
  const sieContent = await generateSIEExport(supabase, userId, {
    fiscal_period_id: period_id,
    company_name: company.company_name || 'Unknown',
    org_number: company.org_number,
    program_name: 'ERPBase',
  })
  zip.file('bokforing.se', sieContent)

  // 2. Reports folder
  const rapporter = zip.folder('rapporter')!

  const [trialBalance, incomeStatement, balanceSheet, generalLedger, journalRegister] =
    await Promise.all([
      generateTrialBalance(supabase, userId, period_id),
      generateIncomeStatement(supabase, userId, period_id),
      generateBalanceSheet(supabase, userId, period_id),
      generateGeneralLedger(supabase, userId, period_id),
      generateJournalRegister(supabase, userId, period_id),
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
      userId,
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
      .select('id, file_name, storage_path, journal_entry_id')
      .eq('user_id', userId)
      .not('journal_entry_id', 'is', null)

    if (documents && documents.length > 0) {
      // Filter to entries in this period
      const { data: periodEntryIds } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('user_id', userId)
        .eq('fiscal_period_id', period_id)
        .in('status', ['posted', 'reversed'])

      const periodEntryIdSet = new Set((periodEntryIds || []).map((e: { id: string }) => e.id))
      const periodDocuments = documents.filter(
        (d: { journal_entry_id: string | null }) => d.journal_entry_id && periodEntryIdSet.has(d.journal_entry_id)
      )

      for (const doc of periodDocuments) {
        try {
          const { data: fileData, error } = await supabase.storage
            .from('documents')
            .download(doc.storage_path)

          if (error || !fileData) {
            manifest.push({
              file_name: doc.file_name,
              storage_path: doc.storage_path,
              status: 'error',
              error: error?.message || 'Download returned no data',
            })
            continue
          }

          const buffer = await fileData.arrayBuffer()
          dokument.file(doc.file_name, buffer)
          manifest.push({
            file_name: doc.file_name,
            storage_path: doc.storage_path,
            status: 'downloaded',
          })
        } catch (err) {
          manifest.push({
            file_name: doc.file_name,
            storage_path: doc.storage_path,
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
    const result = await getAuditLog(supabase, userId, {
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

  return zip.generateAsync({ type: 'arraybuffer' })
}
