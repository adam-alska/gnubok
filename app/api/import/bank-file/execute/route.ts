import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { eventBus } from '@/lib/events'
import { ensureInitialized } from '@/lib/init'
import { ingestTransactions, type RawTransaction } from '@/lib/transactions/ingest'
import { generateExternalId } from '@/lib/import/bank-file/parser'
import { requireCompanyId } from '@/lib/company/context'
import { requireWritePermission } from '@/lib/auth/require-write'
import type { ParsedBankTransaction, BankFileFormatId } from '@/lib/import/bank-file/types'
import type { Transaction } from '@/types'

ensureInitialized()

interface ExecuteRequest {
  transactions: ParsedBankTransaction[]
  format: BankFileFormatId
  filename: string
  file_hash: string
  skip_duplicates: boolean
  auto_categorize: boolean
}

/**
 * POST /api/import/bank-file/execute
 *
 * Executes the import of confirmed bank transactions.
 * Records import in bank_file_imports, calls ingestTransactions(),
 * emits transaction.synced event.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const writeCheck = await requireWritePermission(supabase, user.id)
  if (!writeCheck.ok) return writeCheck.response

  const companyId = await requireCompanyId(supabase, user.id)

  const body: ExecuteRequest = await request.json()
  const { transactions, format, filename, file_hash, skip_duplicates: _skip_duplicates = true, auto_categorize: _auto_categorize = true } = body

  if (!transactions || transactions.length === 0) {
    return NextResponse.json({ error: 'No transactions to import' }, { status: 400 })
  }

  try {
    // Create import record
    const { data: importRecord, error: importError } = await supabase
      .from('bank_file_imports')
      .upsert({
        user_id: user.id,
        company_id: companyId,
        filename,
        file_hash,
        file_format: format,
        transaction_count: transactions.length,
        status: 'processing',
        date_from: transactions.map(t => t.date).sort()[0] || null,
        date_to: transactions.map(t => t.date).sort().reverse()[0] || null,
      }, {
        onConflict: 'user_id,file_hash',
      })
      .select()
      .single()

    if (importError) {
      console.error('Failed to create import record:', importError)
      return NextResponse.json({ error: 'Failed to create import record' }, { status: 500 })
    }

    // Convert parsed transactions to RawTransaction format
    const rawTransactions: RawTransaction[] = transactions.map((tx, index) => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      currency: tx.currency || 'SEK',
      external_id: generateExternalId(tx, format, index),
      reference: tx.reference || null,
      import_source: format === 'camt053' ? 'camt053' : `csv_${format}`,
    }))

    // Run ingestion pipeline
    const ingestResult = await ingestTransactions(supabase, companyId, user.id, rawTransactions)

    // Update import record with results
    await supabase
      .from('bank_file_imports')
      .update({
        imported_count: ingestResult.imported,
        duplicate_count: ingestResult.duplicates,
        matched_count: ingestResult.auto_matched_invoices,
        status: ingestResult.errors > 0 && ingestResult.imported === 0 ? 'failed' : 'completed',
        error_message: ingestResult.errors > 0
          ? `${ingestResult.errors} transactions failed to import`
          : null,
      })
      .eq('id', importRecord.id)

    // Emit event with newly imported transactions
    if (ingestResult.imported > 0 && ingestResult.transaction_ids.length > 0) {
      try {
        const { data: importedTransactions } = await supabase
          .from('transactions')
          .select('*')
          .in('id', ingestResult.transaction_ids)

        if (importedTransactions && importedTransactions.length > 0) {
          await eventBus.emit({
            type: 'transaction.synced',
            payload: {
              transactions: importedTransactions as Transaction[],
              userId: user.id,
              companyId,
            },
          })
        }
      } catch {
        // Non-critical event emission
      }
    }

    return NextResponse.json({
      data: {
        import_id: importRecord.id,
        ...ingestResult,
      },
    })
  } catch (error) {
    console.error('Bank file execute error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    )
  }
}
