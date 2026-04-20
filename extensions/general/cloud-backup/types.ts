/**
 * Connection stored per company in extension_data under key
 * `google_drive_connection`. The refresh token is AES-256-GCM encrypted
 * (see lib/crypto.ts) — never store it in plaintext.
 */
export interface GoogleDriveConnection {
  refresh_token_encrypted: string
  account_email: string
  connected_at: string
  /** ID of the top-level "gnubok" folder in the user's Drive. */
  root_folder_id: string | null
  /** ID of the per-company subfolder. */
  company_folder_id: string | null
}

/**
 * Last-sync snapshot stored under key `google_drive_last_sync`.
 */
export interface GoogleDriveLastSync {
  at: string
  file_id: string
  file_name: string
  file_size_bytes: number
  folder_id: string
}

/**
 * Status returned to the UI. Mirrors the two storage shapes above in a
 * shape safe to expose to the client (no encrypted token).
 */
export interface CloudBackupStatus {
  connected: boolean
  account_email: string | null
  connected_at: string | null
  last_sync: GoogleDriveLastSync | null
}
