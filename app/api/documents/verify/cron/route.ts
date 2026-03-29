import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/auth/cron'

/**
 * GET /api/documents/verify/cron
 * Batch integrity verification of WORM document archive
 *
 * Runs weekly (Sunday 03:00 UTC / 05:00 Swedish time).
 * Processes up to 100 documents per run, prioritizing
 * documents never checked or least recently checked.
 *
 * Uses service role for cross-user verification (RLS bypass).
 */
export async function GET(request: Request) {
  const authError = verifyCronSecret(request)
  if (authError) return authError

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Missing Supabase configuration' },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Fetch up to 100 current-version documents, prioritizing unchecked/oldest
  const { data: documents, error: fetchError } = await supabase
    .from('document_attachments')
    .select('id, user_id, storage_path, sha256_hash, file_name')
    .eq('is_current_version', true)
    .order('last_integrity_check_at', { ascending: true, nullsFirst: true })
    .limit(100)

  if (fetchError) {
    console.error('[doc-verify-cron] Failed to fetch documents:', fetchError)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }

  if (!documents || documents.length === 0) {
    return NextResponse.json({ message: 'No documents to verify', processed: 0 })
  }

  let verified = 0
  let failures = 0
  let errors = 0

  for (const doc of documents) {
    try {
      // Download file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(doc.storage_path)

      if (downloadError || !fileData) {
        console.error(`[doc-verify-cron] Download failed for ${doc.id}:`, downloadError)
        errors++
        continue
      }

      // Compute SHA-256 hash
      const buffer = await fileData.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const computedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

      const isValid = computedHash === doc.sha256_hash

      // Update last_integrity_check_at
      await supabase
        .from('document_attachments')
        .update({ last_integrity_check_at: new Date().toISOString() })
        .eq('id', doc.id)

      if (!isValid) {
        // Log integrity failure to audit_log
        await supabase.from('audit_log').insert({
          user_id: doc.user_id,
          action: 'INTEGRITY_FAILURE',
          table_name: 'document_attachments',
          record_id: doc.id,
          description: `Integrity check failed for document "${doc.file_name}": stored hash ${doc.sha256_hash}, computed hash ${computedHash}`,
          old_state: { sha256_hash: doc.sha256_hash },
          new_state: { computed_hash: computedHash },
        })

        console.error(`[doc-verify-cron] INTEGRITY FAILURE: document ${doc.id} (${doc.file_name})`)
        failures++
      } else {
        verified++
      }
    } catch (error) {
      console.error(`[doc-verify-cron] Error verifying document ${doc.id}:`, error)
      errors++
      // Continue with other documents
    }
  }

  console.log(
    `[doc-verify-cron] Processed ${documents.length}: ${verified} verified, ${failures} failures, ${errors} errors`
  )

  return NextResponse.json({
    processed: documents.length,
    verified,
    failures,
    errors,
  })
}
