import { createClient } from '@/lib/supabase/server'
import { eventBus } from '@/lib/events'
import type { DocumentAttachment, CreateDocumentAttachmentInput, DocumentUploadSource } from '@/types'

/**
 * Document Service - WORM-style document archive
 *
 * Handles document upload with SHA-256 integrity, version chains,
 * and linking to journal entries. Deletion is blocked by DB triggers
 * for documents linked to committed entries.
 */

/**
 * Compute SHA-256 hash of a file buffer
 */
async function computeSHA256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Upload a document and create a record with SHA-256 integrity hash
 */
export async function uploadDocument(
  userId: string,
  file: { name: string; buffer: ArrayBuffer; type?: string },
  metadata: {
    upload_source?: DocumentUploadSource
    journal_entry_id?: string
    journal_entry_line_id?: string
  } = {}
): Promise<DocumentAttachment> {
  const supabase = await createClient()

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
 */
export async function createNewVersion(
  userId: string,
  originalId: string,
  file: { name: string; buffer: ArrayBuffer; type?: string }
): Promise<DocumentAttachment> {
  const supabase = await createClient()

  // Fetch the original/current version
  const { data: current, error: fetchError } = await supabase
    .from('document_attachments')
    .select('*')
    .eq('id', originalId)
    .eq('user_id', userId)
    .eq('is_current_version', true)
    .single()

  if (fetchError || !current) {
    throw new Error('Original document not found or not the current version')
  }

  const rootOriginalId = current.original_id || current.id
  const newVersion = current.version + 1

  // Compute SHA-256 hash
  const sha256Hash = await computeSHA256(file.buffer)

  // Upload new file
  const timestamp = Date.now()
  const storagePath = `documents/${userId}/${timestamp}_v${newVersion}_${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file.buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Failed to upload new version: ${uploadError.message}`)
  }

  // Create new version record
  const { data: newDoc, error: insertError } = await supabase
    .from('document_attachments')
    .insert({
      user_id: userId,
      storage_path: storagePath,
      file_name: file.name,
      file_size_bytes: file.buffer.byteLength,
      mime_type: file.type || null,
      sha256_hash: sha256Hash,
      version: newVersion,
      original_id: rootOriginalId,
      is_current_version: true,
      uploaded_by: userId,
      upload_source: current.upload_source,
      digitization_date: new Date().toISOString(),
      journal_entry_id: current.journal_entry_id,
      journal_entry_line_id: current.journal_entry_line_id,
    })
    .select()
    .single()

  if (insertError) {
    await supabase.storage.from('documents').remove([storagePath])
    throw new Error(`Failed to create new version record: ${insertError.message}`)
  }

  // Mark old version as superseded
  await supabase
    .from('document_attachments')
    .update({
      is_current_version: false,
      superseded_by_id: newDoc.id,
    })
    .eq('id', current.id)

  return newDoc as DocumentAttachment
}

/**
 * Link an existing document to a journal entry
 */
export async function linkToJournalEntry(
  userId: string,
  documentId: string,
  journalEntryId: string,
  journalEntryLineId?: string
): Promise<DocumentAttachment> {
  const supabase = await createClient()

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
  userId: string,
  documentId: string
): Promise<{ valid: boolean; storedHash: string; computedHash: string }> {
  const supabase = await createClient()

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
