import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { eventBus } from '@/lib/events'
import type { DocumentAttachment, DocumentUploadSource } from '@/types'

/**
 * Document Service - WORM-style document archive
 *
 * Handles document upload with SHA-256 integrity, version chains,
 * and linking to journal entries. Deletion is blocked by DB triggers
 * for documents linked to committed entries.
 */

let bucketVerified = false

/** @internal Reset bucket verification flag — for testing only */
export function _resetBucketVerified() {
  bucketVerified = false
}

/**
 * Ensure the 'documents' storage bucket exists, creating it if missing.
 * Runs once per process lifetime (same pattern as ensureInitialized).
 */
async function ensureDocumentsBucket(): Promise<void> {
  if (bucketVerified) return

  const supabase = await createServiceClient()
  const { data: bucket } = await supabase.storage.getBucket('documents')

  if (!bucket) {
    await supabase.storage.createBucket('documents', {
      public: false,
      fileSizeLimit: 52428800, // 50 MB
    })
  }

  bucketVerified = true
}

/**
 * Compute SHA-256 hash of a file buffer
 */
export async function computeSHA256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Upload a document and create a record with SHA-256 integrity hash
 */
export async function uploadDocument(
  supabase: SupabaseClient,
  userId: string,
  file: { name: string; buffer: ArrayBuffer; type?: string },
  metadata: {
    upload_source?: DocumentUploadSource
    journal_entry_id?: string
    journal_entry_line_id?: string
  } = {}
): Promise<DocumentAttachment> {
  await ensureDocumentsBucket()

  // Compute SHA-256 hash
  const sha256Hash = await computeSHA256(file.buffer)

  // Generate storage path
  const timestamp = Date.now()
  const storagePath = `documents/${userId}/${timestamp}_${file.name}`

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file.buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Failed to upload document: ${uploadError.message}`)
  }

  // Create document record
  const { data, error } = await supabase
    .from('document_attachments')
    .insert({
      user_id: userId,
      storage_path: storagePath,
      file_name: file.name,
      file_size_bytes: file.buffer.byteLength,
      mime_type: file.type || null,
      sha256_hash: sha256Hash,
      version: 1,
      is_current_version: true,
      uploaded_by: userId,
      upload_source: metadata.upload_source || 'file_upload',
      digitization_date: new Date().toISOString(),
      journal_entry_id: metadata.journal_entry_id || null,
      journal_entry_line_id: metadata.journal_entry_line_id || null,
    })
    .select()
    .single()

  if (error) {
    // Clean up uploaded file on record creation failure
    await supabase.storage.from('documents').remove([storagePath])
    throw new Error(`Failed to create document record: ${error.message}`)
  }

  const result = data as DocumentAttachment

  await eventBus.emit({
    type: 'document.uploaded',
    payload: { document: result, userId },
  })

  return result
}

/**
 * Create a new version of an existing document (WORM: old version is superseded)
 *
 * Uses the create_document_version RPC for atomic versioning with:
 * - Row-level locking (prevents concurrent versioning race condition)
 * - Cryptographic hash chain (prev_version_hash links to previous version)
 * - Single transaction (insert new + mark old superseded)
 */
export async function createNewVersion(
  supabase: SupabaseClient,
  userId: string,
  originalId: string,
  file: { name: string; buffer: ArrayBuffer; type?: string }
): Promise<DocumentAttachment> {
  await ensureDocumentsBucket()

  // Compute SHA-256 hash
  const sha256Hash = await computeSHA256(file.buffer)

  // Upload new file to Storage
  const timestamp = Date.now()
  const storagePath = `documents/${userId}/${timestamp}_${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file.buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Failed to upload new version: ${uploadError.message}`)
  }

  // Atomic version creation via RPC (row lock + hash chain + supersede in one tx)
  const { data: newDocId, error: rpcError } = await supabase.rpc('create_document_version', {
    p_user_id: userId,
    p_original_doc_id: originalId,
    p_storage_path: storagePath,
    p_file_name: file.name,
    p_file_size_bytes: file.buffer.byteLength,
    p_mime_type: file.type || null,
    p_sha256_hash: sha256Hash,
  })

  if (rpcError) {
    // Clean up uploaded file on RPC failure
    await supabase.storage.from('documents').remove([storagePath])
    throw new Error(`Failed to create new version: ${rpcError.message}`)
  }

  // Fetch the complete new version record
  const { data: newDoc, error: fetchError } = await supabase
    .from('document_attachments')
    .select('*')
    .eq('id', newDocId)
    .single()

  if (fetchError || !newDoc) {
    throw new Error('Failed to fetch new version record')
  }

  return newDoc as DocumentAttachment
}

/**
 * Link an existing document to a journal entry
 */
export async function linkToJournalEntry(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  journalEntryId: string,
  journalEntryLineId?: string
): Promise<DocumentAttachment> {

  const { data, error } = await supabase
    .from('document_attachments')
    .update({
      journal_entry_id: journalEntryId,
      journal_entry_line_id: journalEntryLineId || null,
    })
    .eq('id', documentId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to link document: ${error.message}`)
  }

  return data as DocumentAttachment
}

/**
 * Verify document integrity by re-hashing and comparing
 */
export async function verifyIntegrity(
  supabase: SupabaseClient,
  userId: string,
  documentId: string
): Promise<{ valid: boolean; storedHash: string; computedHash: string }> {

  // Fetch document record
  const { data: doc, error: docError } = await supabase
    .from('document_attachments')
    .select('storage_path, sha256_hash')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()

  if (docError || !doc) {
    throw new Error('Document not found')
  }

  // Download file from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('documents')
    .download(doc.storage_path)

  if (downloadError || !fileData) {
    throw new Error(`Failed to download document: ${downloadError?.message}`)
  }

  // Re-compute hash
  const buffer = await fileData.arrayBuffer()
  const computedHash = await computeSHA256(buffer)

  return {
    valid: computedHash === doc.sha256_hash,
    storedHash: doc.sha256_hash,
    computedHash,
  }
}
